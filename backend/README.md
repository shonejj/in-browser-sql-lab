# DuckDB Lab — Backend Service

A FastAPI backend that runs DuckDB natively with full extension support (MySQL, PostgreSQL, httpfs, Excel, etc.).

## Quick Start

### Option 1: Docker
```bash
docker build -t duckdb-lab-backend .
docker run -p 8000:8000 duckdb-lab-backend
```

### Option 2: Python
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Configuration

Set `DUCKDB_BACKEND_URL` in the frontend to point to this service (default: `http://localhost:8000`).

The frontend auto-detects the backend at startup. If reachable, it switches from WASM to backend mode, enabling:
- Direct MySQL/PostgreSQL connections via DuckDB extensions
- Full extension support (httpfs, excel, fts, json, spatial, etc.)
- Better performance for large datasets

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/query` | Execute SQL query |
| GET | `/api/tables` | List all tables |
| POST | `/api/import` | Upload & import file (CSV, Parquet, JSON, Excel, DB) |
| POST | `/api/attach` | Attach external database (MySQL, PostgreSQL, SQLite) |
| POST | `/api/extensions` | Install/load DuckDB extensions |
| GET | `/api/extensions/list` | List all available extensions |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DUCKDB_PATH` | `:memory:` | Path to persistent DuckDB file |
