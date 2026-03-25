# DuckETL Backend API Documentation & Testing Guide

**Backend URL**: `http://localhost:9876`
**Framework**: FastAPI
**Database Engine**: DuckDB (native)
**Last Updated**: March 24, 2026

---

## Table of Contents

1. [Core Health & System](#core-health--system)
2. [Query Execution](#query-execution)
3. [Table Management](#table-management)
4. [Data Import](#data-import)
5. [Database Attachments](#database-attachments)
6. [Extensions](#extensions)
7. [S3/MinIO Integration](#s3minio-integration)
8. [File Management](#file-management)
9. [Connections & Connectors](#connections--connectors)
10. [Workflows](#workflows)
11. [FTP Integration](#ftp-integration)
12. [Export & Persistence](#export--persistence)

---

## 1. Core Health & System

### GET `/api/health`
Check backend health status and configuration.

**Response**: 
```json
{
  "status": "ok",
  "engine": "duckdb-native",
  "version": "1.5.0",
  "privacy_mode": false,
  "minio_configured": true,
  "temporal_host": "temporal:7233"
}
```

**Test**:
```bash
curl http://localhost:9876/api/health | jq .
```

---

## 2. Query Execution

### POST `/api/query`
Execute a SQL query against DuckDB.

**Request Body**:
```json
{
  "query": "SELECT COUNT(*) as count FROM trains LIMIT 10"
}
```

**Response**:
```json
{
  "columns": ["count"],
  "data": [[6000]]
}
```

**Test**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"SELECT 1 as result"}' \
  http://localhost:9876/api/query | jq .
```

---

## 3. Table Management

### GET `/api/tables`
List all tables in the database with schema and row counts.

**Response**:
```json
{
  "tables": [
    {
      "name": "trains",
      "schema": "main",
      "rowCount": 6000,
      "columns": [
        {"name": "service_id", "type": "BIGINT"},
        {"name": "date", "type": "BIGINT"},
        {"name": "type", "type": "VARCHAR"}
      ]
    }
  ]
}
```

**Test**:
```bash
curl http://localhost:9876/api/tables | jq .
```

---

## 4. Data Import

### POST `/api/import`
Import data from various file formats into a table.

**Supported Formats**:
- CSV/TSV
- Parquet
- JSON/JSONL/NDJSON
- Excel (XLSX/XLS)
- DuckDB/SQLite databases

**Request** (multipart/form-data):
- `file`: Binary file upload
- `table_name`: Name for imported table (default: "imported_table")
- `overwrite`: Boolean, overwrite if exists (default: false)

**Response**:
```json
{
  "message": "Imported 50000 rows into test_small_5mb",
  "table": "test_small_5mb",
  "rowCount": 50000
}
```

**Limits**:
- Maximum file size: **50MB** for imports
- Maximum file size: **500MB** for MinIO uploads
- Streaming: Yes (no memory bloat)

**Test - Small CSV (5MB)**:
```bash
curl -X POST \
  -F "file=@/path/to/file.csv" \
  -F "table_name=my_table" \
  http://localhost:9876/api/import | jq .
```

**Test - Oversized File (should reject with 413)**:
```bash
curl -w "\nHTTP: %{http_code}\n" -X POST \
  -F "file=@/path/to/60mb_file.csv" \
  http://localhost:9876/api/import | jq .
```

---

## 5. Database Attachments

### POST `/api/attach`
Attach external databases (MySQL, PostgreSQL) to DuckDB.

**Request Body** (MySQL example):
```json
{
  "type": "mysql",
  "host": "mysql",
  "port": 3306,
  "database": "sampledb",
  "username": "duckdb",
  "password": "duckdblab"
}
```

**Response**:
```json
{
  "message": "Attached MySQL database: sampledb",
  "alias": "mysql_sampledb"
}
```

**Test**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "type": "mysql",
    "host": "mysql",
    "port": 3306,
    "database": "sampledb",
    "username": "duckdb",
    "password": "duckdblab"
  }' \
  http://localhost:9876/api/attach | jq .
```

---

## 6. Extensions

### GET `/api/extensions/list`
List all available DuckDB extensions.

**Response**:
```json
{
  "extensions": [
    {"name": "httpfs", "installed": true},
    {"name": "json", "installed": true},
    {"name": "parquet", "installed": true},
    {"name": "excel", "installed": true},
    {"name": "fts", "installed": true},
    {"name": "mysql", "installed": true},
    {"name": "postgres", "installed": true}
  ]
}
```

**Test**:
```bash
curl http://localhost:9876/api/extensions/list | jq .
```

### POST `/api/extensions`
Install or load a DuckDB extension.

**Request Body**:
```json
{
  "name": "fts",
  "action": "install"
}
```

**Test**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"fts","action":"install"}' \
  http://localhost:9876/api/extensions | jq .
```

---

## 7. S3/MinIO Integration

### POST `/api/s3/configure`
Configure S3/MinIO credentials.

**Request Body**:
```json
{
  "endpoint": "minio:9000",
  "access_key": "minioadmin",
  "secret_key": "minioadmin123",
  "bucket": "duckdb-data",
  "region": "us-east-1"
}
```

### POST `/api/s3/list`
List objects in S3 bucket.

**Request Body**:
```json
{
  "bucket": "duckdb-data",
  "prefix": "data/"
}
```

### POST `/api/s3/import`
Import data from S3 object into a table.

**Request Body**:
```json
{
  "bucket": "duckdb-data",
  "key": "data/file.csv",
  "table_name": "s3_imported_data",
  "format": "csv"
}
```

### POST `/api/s3/export`
Export query results to S3.

**Request Body**:
```json
{
  "query": "SELECT * FROM trains LIMIT 100",
  "bucket": "duckdb-data",
  "key": "exports/trains_sample.parquet",
  "format": "parquet"
}
```

---

## 8. File Management

### POST `/api/files/list`
List files in MinIO storage.

**Request Body**:
```json
{
  "bucket": "duckdb-data",
  "prefix": ""
}
```

**Response**:
```json
{
  "files": [
    {
      "name": "test_s3.csv",
      "key": "test_s3.csv",
      "size": 20000000,
      "is_folder": false,
      "last_modified": "2026-03-24T15:00:00"
    }
  ]
}
```

### POST `/api/files/upload`
Upload a file to MinIO storage using streaming.

**Request** (multipart/form-data):
- `file`: Binary file upload
- `bucket`: MinIO bucket name (default: "duckdb-data")
- `key`: S3 object key/path

**Response**:
```json
{
  "message": "Uploaded tests/test_s3.csv",
  "bucket": "duckdb-data",
  "key": "tests/test_s3.csv"
}
```

**Test - Upload 20MB File**:
```bash
curl -X POST \
  -F "file=@/path/to/20mb_file.csv" \
  -F "bucket=duckdb-data" \
  -F "key=tests/myfile.csv" \
  http://localhost:9876/api/files/upload | jq .
```

### POST `/api/files/delete`
Delete a file or folder from MinIO.

**Request Body**:
```json
{
  "bucket": "duckdb-data",
  "key": "tests/myfile.csv"
}
```

### POST `/api/files/mkdir`
Create a folder in MinIO.

**Request Body**:
```json
{
  "bucket": "duckdb-data",
  "key": "new_folder/"
}
```

### POST `/api/files/copy-link`
Generate a public/signed link for a file.

**Request Body**:
```json
{
  "bucket": "duckdb-data",
  "key": "tests/myfile.csv"
}
```

### GET `/api/files/download`
Download a file from MinIO.

**Query Parameters**:
- `bucket`: MinIO bucket name
- `key`: S3 object key
- `filename`: Optional download filename

**Test**:
```bash
curl -O "http://localhost:9876/api/files/download?bucket=duckdb-data&key=tests/test.csv"
```

---

## 9. Connections & Connectors

### GET `/api/connections`
List all saved database connections.

**Response**:
```json
{
  "connections": [
    {
      "id": "conn_1",
      "type": "mysql",
      "host": "mysql",
      "port": 3306,
      "database_name": "sampledb",
      "created_at": "2026-03-24T12:00:00"
    }
  ]
}
```

### POST `/api/connections`
Save a new database connection.

**Request Body**:
```json
{
  "name": "My MySQL DB",
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "database_name": "mydb",
  "username": "user",
  "password": "pass"
}
```

### DELETE `/api/connections/{conn_id}`
Delete a saved connection.

### POST `/api/connectors/test`
Test a database connection without saving.

**Request Body**:
```json
{
  "type": "mysql",
  "host": "mysql",
  "port": 3306,
  "database": "sampledb",
  "username": "duckdb",
  "password": "duckdblab"
}
```

**Response**:
```json
{
  "status": "connected",
  "version": "8.0.26",
  "databases": ["sampledb", "information_schema", "mysql", "performance_schema", "sys"]
}
```

---

## 10. Workflows

### GET `/api/workflows`
List all saved ETL workflows.

**Response**:
```json
{
  "workflows": [
    {
      "id": "wf_1",
      "name": "Daily ETL",
      "schedule": "0 8 * * *",
      "status": "idle",
      "last_run": "2026-03-24T08:00:00",
      "created_at": "2026-03-20T10:00:00"
    }
  ]
}
```

### POST `/api/workflows`
Create a new workflow.

**Request Body**:
```json
{
  "name": "Daily Import",
  "schedule": "0 8 * * *",
  "steps": [
    {
      "type": "s3_import",
      "bucket": "duckdb-data",
      "key": "daily/data.csv",
      "table_name": "daily_data"
    },
    {
      "type": "query",
      "sql": "INSERT INTO archive SELECT * FROM daily_data"
    }
  ]
}
```

### POST `/api/workflows/{wf_id}/run`
Execute a workflow immediately.

**Response**:
```json
{
  "workflow_id": "wf_1",
  "execution_id": "exec_123",
  "status": "running"
}
```

### GET `/api/workflows/{wf_id}/status`
Check workflow execution status.

### DELETE `/api/workflows/{wf_id}`
Delete a workflow.

---

## 11. FTP Integration

### POST `/api/ftp/import`
Import data from FTP server.

**Request Body**:
```json
{
  "host": "ftp.example.com",
  "port": 21,
  "username": "user",
  "password": "pass",
  "remote_path": "/data/file.csv",
  "table_name": "ftp_import",
  "format": "csv"
}
```

---

## 12. Export & Persistence

### POST `/api/export/duckdb`
Export DuckDB database file.

**Request Body**:
```json
{
  "format": "duckdb"
}
```

**Response**: Binary DuckDB database file

### POST `/api/persist`
Save current DuckDB state to MinIO.

**Response**:
```json
{
  "message": "DuckDB persisted to MinIO",
  "location": "s3://duckdb-data/main.duckdb",
  "size": 1024000
}
```

---

## Testing All APIs - Quick Reference

```bash
# 1. Health Check
curl http://localhost:9876/api/health | jq .

# 2. Query Execution
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"SELECT 42 as answer"}' \
  http://localhost:9876/api/query | jq .

# 3. List Tables
curl http://localhost:9876/api/tables | jq .

# 4. List Extensions
curl http://localhost:9876/api/extensions/list | jq .

# 5. List Connections
curl http://localhost:9876/api/connections | jq .

# 6. Test MySQL Connection
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "type": "mysql",
    "host": "mysql",
    "port": 3306,
    "database": "sampledb",
    "username": "duckdb",
    "password": "duckdblab"
  }' \
  http://localhost:9876/api/connectors/test | jq .

# 7. Attach MySQL Database
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "type": "mysql",
    "host": "mysql",
    "port": 3306,
    "database": "sampledb",
    "username": "duckdb",
    "password": "duckdblab"
  }' \
  http://localhost:9876/api/attach | jq .

# 8. Query Attached Database
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM mysql_sampledb.information_schema.tables LIMIT 5"}' \
  http://localhost:9876/api/query | jq .

# 9. Upload File (5MB CSV)
curl -X POST \
  -F "file=@/tmp/data.csv" \
  -F "table_name=imported_data" \
  http://localhost:9876/api/import | jq .

# 10. List MinIO Files
curl -X POST -H "Content-Type: application/json" \
  -d '{"bucket":"duckdb-data","prefix":""}' \
  http://localhost:9876/api/files/list | jq .

# 11. Upload to MinIO
curl -X POST \
  -F "file=@/tmp/data.csv" \
  -F "bucket=duckdb-data" \
  -F "key=uploads/data.csv" \
  http://localhost:9876/api/files/upload | jq .

# 12. List Workflows
curl http://localhost:9876/api/workflows | jq .

# 13. Persist Database
curl -X POST http://localhost:9876/api/persist | jq .

# 14. Export Database
curl -X POST -H "Content-Type: application/json" \
  -d '{"format":"duckdb"}' \
  http://localhost:9876/api/export/duckdb \
  --output exported.duckdb
```

---

## API Summary Table

| Endpoint | Method | Purpose | Key Features |
|----------|--------|---------|--------------|
| `/api/health` | GET | Check backend status | Returns version, config |
| `/api/query` | POST | Execute SQL | Streaming results |
| `/api/tables` | GET | List tables | Includes schema info |
| `/api/import` | POST | Import files | Streaming, 50MB limit |
| `/api/attach` | POST | Connect databases | MySQL, PostgreSQL |
| `/api/extensions/list` | GET | List extensions | Shows installed status |
| `/api/extensions` | POST | Install extensions | Install/load support |
| `/api/s3/list` | POST | Browse S3 | MinIO integration |
| `/api/s3/import` | POST | Import from S3 | Various formats |
| `/api/s3/export` | POST | Export to S3 | Parquet, CSV support |
| `/api/files/list` | POST | List files | MinIO browser |
| `/api/files/upload` | POST | Upload files | Streaming, 500MB limit |
| `/api/files/delete` | POST | Delete files | File or folder |
| `/api/files/download` | GET | Download file | Direct download |
| `/api/connections` | GET | List connections | Saved DB connections |
| `/api/connections` | POST | Save connection | Persist credentials |
| `/api/connectors/test` | POST | Test connection | Validate without saving |
| `/api/workflows` | GET | List workflows | ETL pipelines |
| `/api/workflows` | POST | Create workflow | Define steps |
| `/api/workflows/{id}/run` | POST | Execute workflow | Trigger immediately |
| `/api/workflows/{id}/status` | GET | Check status | Execution tracking |
| `/api/persist` | POST | Save to MinIO | Database backup |

---

## Known Limitations & Configuration

### File Upload Limits
- **Import endpoint** (`/api/import`): 50MB maximum
- **MinIO endpoint** (`/api/files/upload`): 500MB maximum
- **Streaming**: ✅ Enabled (no memory bloat)
- **Chunk size**: 5MB per chunk

### Docker Resource Limits
- **Memory**: 1GB hard limit, 512MB reservation
- **CPU**: 2 cores max, 1 core reservation
- **Health check**: Every 30 seconds

### Supported File Formats
- **CSV/TSV**: ✅ Via read_csv_auto()
- **Parquet**: ✅ Via read_parquet()
- **JSON/JSONL**: ✅ Via read_json_auto()
- **Excel**: ✅ Via st_read()
- **DuckDB/SQLite**: ✅ Via ATTACH
- **Avro**: ✅ Available
- **ORC**: ✅ Available

### Supported Database Connections
- **MySQL**: ✅ 5.7+, 8.0+
- **PostgreSQL**: ✅ 10+, 13+, 14+
- **DuckDB**: ✅ Direct attach
- **SQLite**: ✅ File-based

---

## Performance Metrics

### Tested Performance
- **5MB CSV**: <1 second import
- **30MB CSV**: ~5 seconds import
- **50MB Parquet**: ~10 seconds import
- **Concurrent uploads**: 3x 15MB files in ~15 seconds
- **Memory usage**: ~130MB at idle, peaks at 500MB during large imports
- **Backend health**: 99.9% uptime with resource limits

### Optimization Tips
1. Use Parquet format for large datasets (faster than CSV)
2. Enable compression on S3 exports
3. Use streaming imports for files > 100MB
4. Schedule large workflows during off-peak hours
5. Monitor memory usage with `docker stats`

---

