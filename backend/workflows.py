"""
Temporal workflow and activity definitions for DuckDB Lab ETL pipelines.
Can run with the bundled Temporal or connect to an external Temporal cluster.
"""

import json
import os
import asyncio
from datetime import timedelta
from dataclasses import dataclass
from typing import List, Optional

try:
    from temporalio import workflow, activity
    from temporalio.client import Client
    from temporalio.worker import Worker
    TEMPORAL_AVAILABLE = True
except ImportError:
    TEMPORAL_AVAILABLE = False

import duckdb


# ─── Configuration ───────────────────────────────────────────────────────────

TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "temporal:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = "duckdb-lab"

DUCKDB_PATH = os.environ.get("DUCKDB_PATH", "/app/data/main.duckdb")


# ─── Data classes ────────────────────────────────────────────────────────────

@dataclass
class WorkflowStep:
    id: str
    type: str  # source, transform, destination
    config: dict


@dataclass
class WorkflowInput:
    workflow_id: str
    name: str
    steps: List[dict]


@dataclass
class StepResult:
    step_id: str
    success: bool
    message: str
    rows_affected: int = 0


# ─── Activities ──────────────────────────────────────────────────────────────

if TEMPORAL_AVAILABLE:
    @activity.defn
    async def execute_workflow_step(step_data: dict) -> dict:
        """Execute a single workflow step (source/transform/destination)."""
        step_type = step_data.get("type", "")
        config = step_data.get("config", {})
        step_id = step_data.get("id", "unknown")

        try:
            con = duckdb.connect(DUCKDB_PATH)
            
            # Install common extensions
            for ext in ["httpfs", "json", "parquet"]:
                try:
                    con.execute(f"LOAD '{ext}';")
                except Exception:
                    pass

            query = config.get("query", "")
            
            if step_type == "source":
                source_type = config.get("source_type", "")
                if source_type == "mysql":
                    con.execute("INSTALL mysql; LOAD mysql;")
                elif source_type == "postgresql":
                    con.execute("INSTALL postgres; LOAD postgres;")
                
                if query:
                    result = con.execute(query)
                    row_count = len(result.fetchall()) if result.description else 0
                    con.close()
                    return {"step_id": step_id, "success": True, "message": f"Source executed: {row_count} rows", "rows_affected": row_count}

            elif step_type == "transform":
                if query:
                    result = con.execute(query)
                    row_count = len(result.fetchall()) if result.description else 0
                    con.close()
                    return {"step_id": step_id, "success": True, "message": f"Transform executed: {row_count} rows", "rows_affected": row_count}

            elif step_type == "destination":
                dest_type = config.get("dest_type", "")
                if dest_type == "s3" and config.get("s3_path"):
                    s3_path = config["s3_path"]
                    if query:
                        con.execute(f"COPY ({query}) TO '{s3_path}'")
                    con.close()
                    return {"step_id": step_id, "success": True, "message": f"Exported to {s3_path}"}
                elif query:
                    con.execute(query)
                    con.close()
                    return {"step_id": step_id, "success": True, "message": "Destination query executed"}

            con.close()
            return {"step_id": step_id, "success": True, "message": "Step completed (no-op)"}

        except Exception as e:
            return {"step_id": step_id, "success": False, "message": str(e)}


    # ─── Workflow ────────────────────────────────────────────────────────────

    @workflow.defn
    class ETLPipelineWorkflow:
        """Executes ETL pipeline steps sequentially."""

        @workflow.run
        async def run(self, input_data: dict) -> dict:
            steps = input_data.get("steps", [])
            results = []
            
            for step in steps:
                result = await workflow.execute_activity(
                    execute_workflow_step,
                    step,
                    start_to_close_timeout=timedelta(minutes=30),
                )
                results.append(result)
                
                if not result.get("success", False):
                    return {
                        "workflow_id": input_data.get("workflow_id"),
                        "success": False,
                        "message": f"Step {result.get('step_id')} failed: {result.get('message')}",
                        "results": results,
                    }
            
            return {
                "workflow_id": input_data.get("workflow_id"),
                "success": True,
                "message": f"Pipeline completed: {len(results)} steps executed",
                "results": results,
            }


# ─── Client helper ───────────────────────────────────────────────────────────

_temporal_client: Optional[object] = None


async def get_temporal_client():
    """Get or create a Temporal client connection."""
    global _temporal_client
    if not TEMPORAL_AVAILABLE:
        return None
    if _temporal_client is not None:
        return _temporal_client
    try:
        _temporal_client = await Client.connect(
            TEMPORAL_HOST,
            namespace=TEMPORAL_NAMESPACE,
        )
        return _temporal_client
    except Exception as e:
        print(f"Temporal connection failed (non-fatal): {e}")
        return None


async def start_workflow(workflow_id: str, name: str, steps: list) -> dict:
    """Start a workflow execution via Temporal, or fall back to sync execution."""
    client = await get_temporal_client()
    
    if client is not None and TEMPORAL_AVAILABLE:
        try:
            handle = await client.start_workflow(
                ETLPipelineWorkflow.run,
                {
                    "workflow_id": workflow_id,
                    "name": name,
                    "steps": steps,
                },
                id=f"etl-{workflow_id}",
                task_queue=TASK_QUEUE,
            )
            return {
                "message": f"Workflow '{name}' started via Temporal",
                "temporal_run_id": handle.id,
                "async": True,
            }
        except Exception as e:
            print(f"Temporal dispatch failed, falling back to sync: {e}")
    
    # Fallback: synchronous execution
    return await _run_sync(workflow_id, name, steps)


async def _run_sync(workflow_id: str, name: str, steps: list) -> dict:
    """Synchronous fallback when Temporal is unavailable."""
    results = []
    con = duckdb.connect(DUCKDB_PATH)
    
    for step in steps:
        step_type = step.get("type", "")
        config = step.get("config", {})
        query = config.get("query", "")
        
        try:
            if query:
                con.execute(query)
            results.append({"step_id": step.get("id"), "success": True, "message": "OK"})
        except Exception as e:
            results.append({"step_id": step.get("id"), "success": False, "message": str(e)})
            con.close()
            return {
                "message": f"Workflow failed at step {step.get('id')}: {e}",
                "async": False,
                "results": results,
            }
    
    con.close()
    return {
        "message": f"Workflow '{name}' completed ({len(results)} steps)",
        "async": False,
        "results": results,
    }


async def get_workflow_status(workflow_id: str) -> dict:
    """Check status of a Temporal workflow execution."""
    client = await get_temporal_client()
    if client is None:
        return {"status": "unknown", "message": "Temporal not available"}
    
    try:
        handle = client.get_workflow_handle(f"etl-{workflow_id}")
        desc = await handle.describe()
        return {
            "status": str(desc.status),
            "start_time": str(desc.start_time) if desc.start_time else None,
            "close_time": str(desc.close_time) if desc.close_time else None,
        }
    except Exception as e:
        return {"status": "not_found", "message": str(e)}
