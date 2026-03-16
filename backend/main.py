"""
DuckDB Lab - FastAPI Backend Service
Provides native DuckDB with full extension support (MySQL, PostgreSQL, httpfs, excel, etc.)
Run: uvicorn main:app --host 0.0.0.0 --port 9876
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Any
import duckdb
import json
import os
import tempfile
import traceback
import uuid
import shutil

app = FastAPI(title="DuckDB Lab Backend", version="2.0.0")

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

# Initialize meta schema for storing connections
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
except Exception:
    pass


# ─── Models ───────────────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str


class AttachRequest(BaseModel):
    type: str  # mysql, postgresql, sqlite, duckdb
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
    endpoint: str  # e.g. localhost:9000
    access_key: str
    secret_key: str
    region: Optional[str] = "us-east-1"
    use_ssl: Optional[bool] = False
    url_style: Optional[str] = "path"  # path or vhost


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
    query: Optional[str] = None  # If provided, export query results; otherwise export full DB


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


# ─── Helpers ──────────────────────────────────────────────────────────────────

def serialize_row(row, columns):
    """Convert a row to a JSON-safe dict."""
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
            WHERE table_schema = 'main' AND table_name NOT LIKE '_meta%'
        """)
        tables = []
        for row in result.fetchall():
            name = row[0]
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
            con.execute(f"ATTACH '{dsn}' AS mysql_db (TYPE MYSQL)")
            return {"message": f"Attached MySQL database: {req.database}", "alias": "mysql_db"}
        elif req.type == "postgresql":
            con.execute("INSTALL postgres; LOAD postgres;")
            dsn = f"host={req.host} port={req.port} user={req.username} password={req.password} dbname={req.database}"
            con.execute(f"ATTACH '{dsn}' AS pg_db (TYPE POSTGRES)")
            return {"message": f"Attached PostgreSQL database: {req.database}", "alias": "pg_db"}
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
        proto = "https" if req.use_ssl else "http"
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
        # Use DuckDB's glob to list files in S3
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
            # Export entire database
            con.execute(f"EXPORT DATABASE '{s3_path}'")

        return {"message": f"Exported to {s3_path}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── DB Export / Download ────────────────────────────────────────────────────

@app.post("/api/export/duckdb")
def export_duckdb():
    """Export current database as a downloadable .duckdb file."""
    try:
        export_path = os.path.join(DATA_DIR, f"export_{uuid.uuid4().hex[:8]}.duckdb")
        # Checkpoint to flush WAL
        con.execute("CHECKPOINT")
        # Copy the database file
        shutil.copy2(db_path, export_path)
        return FileResponse(
            export_path,
            media_type="application/octet-stream",
            filename="duckdb_lab_export.duckdb",
            background=None,
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9876)
