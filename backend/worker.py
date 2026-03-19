"""
Temporal worker entrypoint for DuckDB Lab.

Run: python worker.py

Connects to the Temporal server and polls the 'duckdb-lab' task queue.
Can be run on the same machine or a remote server (BYO-Temporal).
"""

import asyncio
import os
import sys

TEMPORAL_HOST = os.environ.get("TEMPORAL_HOST", "temporal:7233")
TEMPORAL_NAMESPACE = os.environ.get("TEMPORAL_NAMESPACE", "default")
TASK_QUEUE = "duckdb-lab"


async def main():
    try:
        from temporalio.client import Client
        from temporalio.worker import Worker
        from workflows import ETLPipelineWorkflow, execute_workflow_step
    except ImportError:
        print("ERROR: temporalio is not installed. Install with: pip install temporalio")
        sys.exit(1)

    print(f"Connecting to Temporal at {TEMPORAL_HOST} (namespace: {TEMPORAL_NAMESPACE})...")
    
    # Retry connection with backoff
    client = None
    for attempt in range(30):
        try:
            client = await Client.connect(TEMPORAL_HOST, namespace=TEMPORAL_NAMESPACE)
            print("Connected to Temporal!")
            break
        except Exception as e:
            if attempt < 29:
                wait = min(2 ** attempt, 30)
                print(f"Temporal not ready (attempt {attempt + 1}/30): {e}. Retrying in {wait}s...")
                await asyncio.sleep(wait)
            else:
                print(f"Failed to connect to Temporal after 30 attempts: {e}")
                sys.exit(1)

    worker = Worker(
        client,
        task_queue=TASK_QUEUE,
        workflows=[ETLPipelineWorkflow],
        activities=[execute_workflow_step],
    )
    
    print(f"Worker polling task queue: {TASK_QUEUE}")
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
