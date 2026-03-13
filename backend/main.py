"""
DuckDB Lab - FastAPI Backend Service
Provides native DuckDB with full extension support (MySQL, PostgreSQL, httpfs, excel, etc.)
Run: uvicorn main:app --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Any
import duckdb
import json
import os
import tempfile
import traceback

app = FastAPI(title="DuckDB Lab Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global DuckDB connection
db_path = os.environ.get("DUCKDB_PATH", ":memory:")
con = duckdb.connect(db_path)

# Pre-install common extensions
for ext in ["httpfs", "json", "parquet", "excel", "fts"]:
    try:
        con.execute(f"INSTALL '{ext}'; LOAD '{ext}';")
    except Exception:
        pass


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
    action: str = "install_and_load"  # install, load, install_and_load


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
        result = con.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'")
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
