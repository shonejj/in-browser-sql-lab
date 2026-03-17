"""
DuckDB Lab - FastAPI Backend Service
Provides native DuckDB with full extension support (MySQL, PostgreSQL, httpfs, excel, etc.)
Run: uvicorn main:app --host 0.0.0.0 --port 9876
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Any
from contextlib import asynccontextmanager
import duckdb
import json
import os
import tempfile
import traceback
import uuid
import shutil
import io

# ─── MinIO / boto3 ──────────────────────────────────────────────────────────
import boto3
from botocore.exceptions import ClientError

MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "minioadmin123")
MINIO_USE_SSL = os.environ.get("MINIO_USE_SSL", "false").lower() == "true"
MINIO_DEFAULT_BUCKET = os.environ.get("MINIO_DEFAULT_BUCKET", "duckdb-data")

s3_client = None

def get_s3_client():
    global s3_client
    if s3_client is None:
        proto = "https" if MINIO_USE_SSL else "http"
        s3_client = boto3.client(
            "s3",
            endpoint_url=f"{proto}://{MINIO_ENDPOINT}",
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
            region_name="us-east-1",
        )
    return s3_client


def init_minio():
    """Create default bucket and optionally restore DuckDB from MinIO."""
    try:
        client = get_s3_client()
        # Create default bucket
        try:
            client.head_bucket(Bucket=MINIO_DEFAULT_BUCKET)
        except ClientError:
            client.create_bucket(Bucket=MINIO_DEFAULT_BUCKET)
            print(f"Created MinIO bucket: {MINIO_DEFAULT_BUCKET}")
        
        # Try to restore DuckDB file from MinIO
        try:
            client.head_object(Bucket=MINIO_DEFAULT_BUCKET, Key="main.duckdb")
            client.download_file(MINIO_DEFAULT_BUCKET, "main.duckdb", db_path)
            print("Restored DuckDB from MinIO")
        except ClientError:
            print("No existing DuckDB in MinIO, starting fresh")
    except Exception as e:
        print(f"MinIO init warning (non-fatal): {e}")


def persist_to_minio():
    """Upload current DuckDB file to MinIO."""
    try:
        con.execute("CHECKPOINT")
        client = get_s3_client()
        client.upload_file(db_path, MINIO_DEFAULT_BUCKET, "main.duckdb")
        print("Persisted DuckDB to MinIO")
    except Exception as e:
        print(f"MinIO persist warning: {e}")


# ─── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_minio()
    yield
    # Shutdown
    persist_to_minio()


app = FastAPI(title="DuckDB Lab Backend", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data directory for persistent storage
DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
os.makedirs(DATA_DIR, exist_ok=True)

# Global DuckDB connection
db_path = os.environ.get("DUCKDB_PATH", os.path.join(DATA_DIR, "main.duckdb"))
con = duckdb.connect(db_path)

# Pre-install common extensions
for ext in ["httpfs", "json", "parquet", "excel", "fts", "mysql", "postgres"]:
    try:
        con.execute(f"INSTALL '{ext}'; LOAD '{ext}';")
    except Exception:
        pass

# Initialize meta schema
try:
    con.execute("CREATE SCHEMA IF NOT EXISTS _meta")
    con.execute("""
        CREATE TABLE IF NOT EXISTS _meta.connections (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            type VARCHAR NOT NULL,
            host VARCHAR,
            port INTEGER,
            database_name VARCHAR,
            username VARCHAR,
            password VARCHAR,
            path VARCHAR,
            s3_endpoint VARCHAR,
            s3_access_key VARCHAR,
            s3_secret_key VARCHAR,
            s3_bucket VARCHAR,
            s3_region VARCHAR,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS _meta.workflows (
            id VARCHAR PRIMARY KEY,
            name VARCHAR NOT NULL,
            schedule VARCHAR,
            steps TEXT,
            status VARCHAR DEFAULT 'idle',
            last_run TIMESTAMP,
            created_at TIMESTAMP DEFAULT current_timestamp
        )
    """)
except Exception:
    pass


# ─── Models ───────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str

class AttachRequest(BaseModel):
    type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    path: Optional[str] = None

class ExtensionRequest(BaseModel):
    name: str
    action: str = "install_and_load"

class S3ConfigRequest(BaseModel):
    endpoint: str
    access_key: str
    secret_key: str
    region: Optional[str] = "us-east-1"
    use_ssl: Optional[bool] = False
    url_style: Optional[str] = "path"

class S3ListRequest(BaseModel):
    bucket: str
    prefix: Optional[str] = ""

class S3ImportRequest(BaseModel):
    bucket: str
    key: str
    table_name: str
    overwrite: Optional[bool] = False

class S3ExportRequest(BaseModel):
    bucket: str
    key: str
    query: Optional[str] = None

class ConnectionSaveRequest(BaseModel):
    name: str
    type: str
    host: Optional[str] = None
    port: Optional[int] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    path: Optional[str] = None
    s3_endpoint: Optional[str] = None
    s3_access_key: Optional[str] = None
    s3_secret_key: Optional[str] = None
    s3_bucket: Optional[str] = None
    s3_region: Optional[str] = None

class FileListRequest(BaseModel):
    bucket: str
    prefix: Optional[str] = ""

class FileDeleteRequest(BaseModel):
    bucket: str
    key: str

class FileMkdirRequest(BaseModel):
    bucket: str
    key: str

class FileCopyLinkRequest(BaseModel):
    bucket: str
    key: str

class WorkflowSaveRequest(BaseModel):
    id: Optional[str] = None
    name: str
    schedule: Optional[str] = None
    steps: Optional[list] = []

class ConnectorTestRequest(BaseModel):
    type: str
    host: Optional[str] = None
    port: Optional[str] = None
    database_name: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    s3_endpoint: Optional[str] = None
    s3_access_key: Optional[str] = None
    s3_secret_key: Optional[str] = None
    s3_bucket: Optional[str] = None
    name: Optional[str] = None
    path: Optional[str] = None
    s3_region: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def serialize_row(row, columns):
    result = {}
    for i, col in enumerate(columns):
        val = row[i]
        if isinstance(val, bytes):
            val = val.hex()
        elif isinstance(val, (int,)) and abs(val) > 2**53:
            val = str(val)
        result[col] = val
    return result


# ─── Core Endpoints ──────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "duckdb-native", "version": duckdb.__version__}


@app.post("/api/query")
def run_query(req: QueryRequest):
    try:
        result = con.execute(req.query)
        if result.description:
            columns = [desc[0] for desc in result.description]
            rows = result.fetchall()
            data = [serialize_row(row, columns) for row in rows]
            return {"columns": columns, "data": data, "rowCount": len(data)}
        return {"columns": [], "data": [], "rowCount": 0, "message": "Query executed successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/tables")
def list_tables():
    try:
        result = con.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'main' AND table_catalog = 'main'
        """)
        tables = []
        for row in result.fetchall():
            name = row[0]
            if name.startswith('_meta'): continue
            try:
                count_res = con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()
                count = count_res[0] if count_res else 0
            except:
                count = 0
            try:
                cols_res = con.execute(f"PRAGMA table_info('{name}')").fetchall()
                columns = [{"name": c[1], "type": c[2]} for c in cols_res]
            except:
                columns = []
            tables.append({"name": name, "rowCount": count, "columns": columns})
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/import")
async def import_file(
    file: UploadFile = File(...),
    table_name: str = Form("imported_table"),
    overwrite: bool = Form(False),
):
    try:
        suffix = os.path.splitext(file.filename or "file")[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in table_name)
        if overwrite:
            con.execute(f'DROP TABLE IF EXISTS "{safe_name}"')

        if suffix in (".csv", ".tsv"):
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM read_csv_auto('{tmp_path}')")
        elif suffix in (".parquet",):
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM read_parquet('{tmp_path}')")
        elif suffix in (".json", ".jsonl", ".ndjson"):
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM read_json_auto('{tmp_path}')")
        elif suffix in (".xlsx", ".xls"):
            con.execute("INSTALL spatial; LOAD spatial;")
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM st_read('{tmp_path}')")
        elif suffix in (".db", ".duckdb", ".sqlite", ".sqlite3"):
            con.execute(f"ATTACH '{tmp_path}' AS _import_db")
            tables = con.execute(
                "SELECT table_name FROM _import_db.information_schema.tables WHERE table_schema='main'"
            ).fetchall()
            imported = 0
            for t in tables:
                tname = t[0]
                s = "".join(c if c.isalnum() or c == "_" else "_" for c in tname)
                con.execute(f'CREATE TABLE "{s}" AS SELECT * FROM _import_db."{tname}"')
                imported += 1
            con.execute("DETACH _import_db")
            os.unlink(tmp_path)
            return {"message": f"Imported {imported} table(s) from database file"}
        else:
            os.unlink(tmp_path)
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {suffix}")

        count = con.execute(f'SELECT COUNT(*) FROM "{safe_name}"').fetchone()[0]
        os.unlink(tmp_path)
        return {"message": f"Imported {count} rows into {safe_name}", "table": safe_name, "rowCount": count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Database Attach ─────────────────────────────────────────────────────────

@app.post("/api/attach")
def attach_database(req: AttachRequest):
    try:
        if req.type == "mysql":
            con.execute("INSTALL mysql; LOAD mysql;")
            dsn = f"host={req.host} port={req.port} user={req.username} password={req.password} database={req.database}"
            alias = f"mysql_{req.database or 'db'}"
            try:
                con.execute(f"DETACH IF EXISTS {alias}")
            except:
                pass
            con.execute(f"ATTACH '{dsn}' AS {alias} (TYPE MYSQL)")
            return {"message": f"Attached MySQL database: {req.database}", "alias": alias}
        elif req.type == "postgresql":
            con.execute("INSTALL postgres; LOAD postgres;")
            dsn = f"host={req.host} port={req.port} user={req.username} password={req.password} dbname={req.database}"
            alias = f"pg_{req.database or 'db'}"
            try:
                con.execute(f"DETACH IF EXISTS {alias}")
            except:
                pass
            con.execute(f"ATTACH '{dsn}' AS {alias} (TYPE POSTGRES)")
            return {"message": f"Attached PostgreSQL database: {req.database}", "alias": alias}
        elif req.type in ("sqlite", "duckdb"):
            path = req.path or req.database
            con.execute(f"ATTACH '{path}' AS file_db")
            return {"message": f"Attached file database: {path}", "alias": "file_db"}
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported database type: {req.type}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Extensions ──────────────────────────────────────────────────────────────

@app.post("/api/extensions")
def manage_extension(req: ExtensionRequest):
    try:
        if req.action in ("install", "install_and_load"):
            con.execute(f"INSTALL '{req.name}';")
        if req.action in ("load", "install_and_load"):
            con.execute(f"LOAD '{req.name}';")
        return {"message": f"Extension '{req.name}' {req.action} successful"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/extensions/list")
def list_extensions():
    try:
        result = con.execute("SELECT extension_name, loaded, installed FROM duckdb_extensions()").fetchall()
        extensions = [{"name": r[0], "loaded": r[1], "installed": r[2]} for r in result]
        return {"extensions": extensions}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── S3 / MinIO Endpoints ───────────────────────────────────────────────────

@app.post("/api/s3/configure")
def configure_s3(req: S3ConfigRequest):
    try:
        con.execute(f"SET s3_endpoint='{req.endpoint}';")
        con.execute(f"SET s3_access_key_id='{req.access_key}';")
        con.execute(f"SET s3_secret_access_key='{req.secret_key}';")
        con.execute(f"SET s3_region='{req.region}';")
        con.execute(f"SET s3_url_style='{req.url_style}';")
        con.execute(f"SET s3_use_ssl={'true' if req.use_ssl else 'false'};")
        return {"message": "S3/MinIO configured successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/s3/list")
def list_s3_objects(req: S3ListRequest):
    try:
        prefix = f"s3://{req.bucket}/{req.prefix}*" if req.prefix else f"s3://{req.bucket}/*"
        result = con.execute(f"SELECT file FROM glob('{prefix}')").fetchall()
        files = [r[0] for r in result]
        return {"files": files, "count": len(files)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/s3/import")
def import_from_s3(req: S3ImportRequest):
    try:
        safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in req.table_name)
        s3_path = f"s3://{req.bucket}/{req.key}"
        if req.overwrite:
            con.execute(f'DROP TABLE IF EXISTS "{safe_name}"')
        ext = os.path.splitext(req.key)[1].lower()
        if ext in (".csv", ".tsv"):
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM read_csv_auto('{s3_path}')")
        elif ext == ".parquet":
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM read_parquet('{s3_path}')")
        elif ext in (".json", ".jsonl", ".ndjson"):
            con.execute(f"CREATE TABLE \"{safe_name}\" AS SELECT * FROM read_json_auto('{s3_path}')")
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file format: {ext}")
        count = con.execute(f'SELECT COUNT(*) FROM "{safe_name}"').fetchone()[0]
        return {"message": f"Imported {count} rows from S3 into {safe_name}", "table": safe_name, "rowCount": count}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/s3/export")
def export_to_s3(req: S3ExportRequest):
    try:
        s3_path = f"s3://{req.bucket}/{req.key}"
        ext = os.path.splitext(req.key)[1].lower()
        if req.query:
            if ext == ".parquet":
                con.execute(f"COPY ({req.query}) TO '{s3_path}' (FORMAT PARQUET)")
            else:
                con.execute(f"COPY ({req.query}) TO '{s3_path}' (FORMAT CSV, HEADER)")
        else:
            con.execute(f"EXPORT DATABASE '{s3_path}'")
        return {"message": f"Exported to {s3_path}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── DB Export / Download ────────────────────────────────────────────────────

@app.post("/api/export/duckdb")
def export_duckdb():
    try:
        export_path = os.path.join(DATA_DIR, f"export_{uuid.uuid4().hex[:8]}.duckdb")
        con.execute("CHECKPOINT")
        shutil.copy2(db_path, export_path)
        return FileResponse(
            export_path,
            media_type="application/octet-stream",
            filename="duckdb_lab_export.duckdb",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Saved Connections CRUD ──────────────────────────────────────────────────

@app.get("/api/connections")
def list_connections():
    try:
        result = con.execute("""
            SELECT id, name, type, host, port, database_name, username, 
                   s3_endpoint, s3_bucket, s3_region, created_at
            FROM _meta.connections ORDER BY created_at DESC
        """)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()
        connections = [serialize_row(row, columns) for row in rows]
        return {"connections": connections}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/connections")
def save_connection(req: ConnectionSaveRequest):
    try:
        conn_id = str(uuid.uuid4())
        con.execute("""
            INSERT INTO _meta.connections 
            (id, name, type, host, port, database_name, username, password, path,
             s3_endpoint, s3_access_key, s3_secret_key, s3_bucket, s3_region)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            conn_id, req.name, req.type, req.host, req.port, req.database_name,
            req.username, req.password, req.path,
            req.s3_endpoint, req.s3_access_key, req.s3_secret_key, req.s3_bucket, req.s3_region,
        ])
        return {"id": conn_id, "message": f"Connection '{req.name}' saved"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/connections/{conn_id}")
def delete_connection(conn_id: str):
    try:
        con.execute("DELETE FROM _meta.connections WHERE id = ?", [conn_id])
        return {"message": "Connection deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Connector Test ──────────────────────────────────────────────────────────

@app.post("/api/connectors/test")
def test_connector(req: ConnectorTestRequest):
    try:
        if req.type in ("mysql", "postgresql"):
            # Try to attach and immediately detach
            if req.type == "mysql":
                con.execute("INSTALL mysql; LOAD mysql;")
                dsn = f"host={req.host} port={req.port or 3306} user={req.username} password={req.password} database={req.database_name}"
                con.execute(f"ATTACH '{dsn}' AS _test_conn (TYPE MYSQL)")
            else:
                con.execute("INSTALL postgres; LOAD postgres;")
                dsn = f"host={req.host} port={req.port or 5432} user={req.username} password={req.password} dbname={req.database_name}"
                con.execute(f"ATTACH '{dsn}' AS _test_conn (TYPE POSTGRES)")
            con.execute("DETACH _test_conn")
            return {"message": f"{req.type} connection successful!"}
        elif req.type == "s3":
            client = boto3.client(
                "s3",
                endpoint_url=f"http://{req.s3_endpoint}",
                aws_access_key_id=req.s3_access_key,
                aws_secret_access_key=req.s3_secret_key,
                region_name=req.s3_region or "us-east-1",
            )
            client.list_buckets()
            return {"message": "S3/MinIO connection successful!"}
        elif req.type == "ftp":
            import ftplib
            ftp = ftplib.FTP()
            ftp.connect(req.host, int(req.port or 21))
            ftp.login(req.username or "anonymous", req.password or "")
            ftp.quit()
            return {"message": "FTP connection successful!"}
        elif req.type in ("webhook", "http"):
            import urllib.request
            urllib.request.urlopen(req.host, timeout=5)
            return {"message": "HTTP endpoint reachable!"}
        else:
            return {"message": f"Test not implemented for type: {req.type}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── File Manager (MinIO) ───────────────────────────────────────────────────

@app.post("/api/files/list")
def files_list(req: FileListRequest):
    try:
        client = get_s3_client()
        prefix = req.prefix or ""
        response = client.list_objects_v2(
            Bucket=req.bucket, Prefix=prefix, Delimiter="/"
        )
        files = []
        # Folders (common prefixes)
        for cp in response.get("CommonPrefixes", []):
            folder_key = cp["Prefix"]
            name = folder_key[len(prefix):].rstrip("/")
            files.append({"name": name, "key": folder_key, "size": 0, "is_folder": True})
        # Files
        for obj in response.get("Contents", []):
            key = obj["Key"]
            if key == prefix:
                continue
            name = key[len(prefix):]
            if "/" in name:
                continue
            files.append({
                "name": name,
                "key": key,
                "size": obj["Size"],
                "is_folder": False,
                "last_modified": obj["LastModified"].isoformat() if obj.get("LastModified") else None,
            })
        return {"files": files}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/files/upload")
async def files_upload(
    file: UploadFile = File(...),
    bucket: str = Form("duckdb-data"),
    key: str = Form(""),
):
    try:
        client = get_s3_client()
        content = await file.read()
        client.put_object(Bucket=bucket, Key=key, Body=content)
        return {"message": f"Uploaded {key}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/files/delete")
def files_delete(req: FileDeleteRequest):
    try:
        client = get_s3_client()
        # If folder, delete all objects with prefix
        if req.key.endswith("/"):
            response = client.list_objects_v2(Bucket=req.bucket, Prefix=req.key)
            for obj in response.get("Contents", []):
                client.delete_object(Bucket=req.bucket, Key=obj["Key"])
        else:
            client.delete_object(Bucket=req.bucket, Key=req.key)
        return {"message": "Deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/files/mkdir")
def files_mkdir(req: FileMkdirRequest):
    try:
        client = get_s3_client()
        key = req.key if req.key.endswith("/") else req.key + "/"
        client.put_object(Bucket=req.bucket, Key=key, Body=b"")
        return {"message": f"Created folder {key}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/files/copy-link")
def files_copy_link(req: FileCopyLinkRequest):
    try:
        client = get_s3_client()
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": req.bucket, "Key": req.key},
            ExpiresIn=3600,
        )
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/files/download")
def files_download(bucket: str = Query(...), key: str = Query(...)):
    try:
        client = get_s3_client()
        response = client.get_object(Bucket=bucket, Key=key)
        filename = key.split("/")[-1]
        return StreamingResponse(
            response["Body"],
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Workflows CRUD ─────────────────────────────────────────────────────────

@app.get("/api/workflows")
def list_workflows():
    try:
        result = con.execute("""
            SELECT id, name, schedule, steps, status, last_run, created_at
            FROM _meta.workflows ORDER BY created_at DESC
        """)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()
        workflows = [serialize_row(row, columns) for row in rows]
        return {"workflows": workflows}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workflows")
def save_workflow(req: WorkflowSaveRequest):
    try:
        wf_id = req.id or str(uuid.uuid4())
        steps_json = json.dumps(req.steps or [])
        
        # Upsert
        try:
            existing = con.execute(
                "SELECT id FROM _meta.workflows WHERE id = ?", [wf_id]
            ).fetchone()
        except:
            existing = None
        
        if existing:
            con.execute("""
                UPDATE _meta.workflows SET name=?, schedule=?, steps=?
                WHERE id=?
            """, [req.name, req.schedule, steps_json, wf_id])
        else:
            con.execute("""
                INSERT INTO _meta.workflows (id, name, schedule, steps)
                VALUES (?, ?, ?, ?)
            """, [wf_id, req.name, req.schedule, steps_json])
        
        return {"id": wf_id, "message": f"Workflow '{req.name}' saved"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/workflows/{wf_id}/run")
def run_workflow(wf_id: str):
    try:
        result = con.execute(
            "SELECT steps FROM _meta.workflows WHERE id = ?", [wf_id]
        ).fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        steps = json.loads(result[0]) if result[0] else []
        
        # Simple sequential execution
        for step in steps:
            step_type = step.get("type")
            config = step.get("config", {})
            
            if step_type == "source" and config.get("query"):
                con.execute(config["query"])
            elif step_type == "transform" and config.get("query"):
                con.execute(config["query"])
            elif step_type == "destination":
                if config.get("query"):
                    con.execute(config["query"])
        
        con.execute(
            "UPDATE _meta.workflows SET status='completed', last_run=current_timestamp WHERE id=?",
            [wf_id],
        )
        return {"message": "Workflow executed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        con.execute(
            "UPDATE _meta.workflows SET status='failed' WHERE id=?", [wf_id]
        )
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/workflows/{wf_id}")
def delete_workflow(wf_id: str):
    try:
        con.execute("DELETE FROM _meta.workflows WHERE id = ?", [wf_id])
        return {"message": "Workflow deleted"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Persist (manual trigger) ───────────────────────────────────────────────

@app.post("/api/persist")
def persist():
    """Manually trigger a checkpoint + MinIO backup."""
    try:
        persist_to_minio()
        return {"message": "Database persisted to MinIO"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9876)
