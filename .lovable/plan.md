## Plan: Fix Server Mode Tables, Docker Networking, MinIO Auto-Setup, File Manager, and Workflow Builder

### Bug 1: Server Mode Tables Not Showing (Critical)

**Root cause:** `refreshTables()` in `Index.tsx` (line 243) uses `SELECT name FROM sqlite_master WHERE type='table'` via `executeQuery`. In backend mode with a persistent DuckDB file, `sqlite_master` may not return tables reliably. The backend already has a dedicated `/api/tables` endpoint that uses `information_schema.tables`.

**Fix:** Update `refreshTables()` to use `backendListTables()` when in backend mode, which calls the dedicated `/api/tables` endpoint and returns tables with columns and row counts already resolved. Same fix for `initializeDatabase()` line 104.

**File:** `src/pages/Index.tsx`

---

### Bug 2: Sample Data Loads Automatically on Init

**Fix:** Remove the `trains` table auto-creation from `initializeDatabase()`. Only init the DuckDB engine, detect mode, and refresh tables. The "Sample Data" button already exists in the top bar -- make it create both the trains table AND load the NYC taxi data as separate options.

**File:** `src/pages/Index.tsx`

---

### Bug 3: Right Sidebar Chart Offset

The right sidebar `ColumnDiagnostics` has a "Charts" tab with `AdvancedChartBuilder` which is redundant since each `QueryCell` already has chart views (ChartBuilder, DataVisualization). This creates confusion and layout issues.

**Fix:** Remove the "Charts" tab from `ColumnDiagnostics`. Keep only Columns, Stats, and Performance tabs in the right panel. Charts stay inside each QueryCell's view toggle.

**File:** `src/components/ColumnDiagnostics.tsx`

---

### Fix 4: Docker Network -- External DB Access

The current `docker-compose.yml` uses a private bridge network `duckdb-net`. The backend container can reach `mysql` by hostname but cannot reach databases on the host machine or external networks.

**Fix:** 

- Add `extra_hosts: ["host.docker.internal:host-gateway"]` to the backend service so it can reach host-machine databases via `host.docker.internal`
- Add `network_mode` documentation in README
- For the MySQL quick-connect in DatabaseConnector, the host should be `mysql` (docker hostname), not `localhost`

**File:** `docker-compose.yml`

---

### Fix 5: Backend Auto-Create MinIO Bucket with DuckDB File

On startup, the backend should use `boto3` to connect to MinIO, create a `duckdb-data` bucket if it doesn't exist, and optionally persist/load the DuckDB file from it.

**Fix:** Add a startup event in `backend/main.py` that:

1. Connects to MinIO using boto3
2. Creates `duckdb-data` bucket if missing
3. Checks if a `main.duckdb` exists in the bucket and downloads it
4. On shutdown or periodic checkpoint, uploads the current `.duckdb` to MinIO

Add `boto3` to `backend/requirements.txt`.

**Files:** `backend/main.py`, `backend/requirements.txt`

---

### Feature 6: MinIO File Manager UI

A new component `FileManager.tsx` with a Windows Explorer-like interface for the hosted MinIO:

- Tree/list view of buckets and folders
- Create folder, rename, delete, copy, move
- Upload files (drag & drop)
- Download files, copy shareable links
- Preview CSV/JSON files inline
- Uses backend API endpoints for all operations

New backend endpoints:

- `POST /api/files/upload` -- Upload file to MinIO
- `POST /api/files/delete` -- Delete file/folder
- `POST /api/files/mkdir` -- Create folder
- `POST /api/files/rename` -- Rename
- `POST /api/files/copy-link` -- Generate presigned URL
- `GET /api/files/download` -- Download file

**New files:** `src/components/FileManager.tsx`
**Modified:** `backend/main.py` (add file management endpoints), `src/components/DatabaseSidebar.tsx` (add File Manager button), `src/pages/Index.tsx` (add FileManager dialog)

---

### Feature 7: Connectors Management Panel

A dedicated Connectors panel for admins to configure all external data sources:

- MySQL, PostgreSQL connections
- S3/MinIO endpoints
- FTP/SFTP connections
- Webhook endpoints (incoming/outgoing)
- Each connector has: name, type, credentials, test connection button, save

Backend stores connectors in `_meta.connections` table (already exists). Add FTP and webhook fields.

**New file:** `src/components/ConnectorsPanel.tsx`
**Modified:** `backend/main.py` (add FTP endpoint using `ftplib`, webhook receiver endpoint)

---

### Feature 8: Workflow Builder (ETL Pipeline)

A visual workflow builder to create scheduled data pipelines:

- **Nodes:** Source (S3, FTP, MySQL, Webhook, API) → Transform (SQL query, filter, aggregate, join) → Destination (S3, MySQL, API, DuckDB table)
- Drag-and-drop node canvas with connections
- Each node is configurable with its own dialog
- "Run Now" button executes the pipeline sequentially
- "Schedule" button sets a cron expression
- Workflows stored in `_meta.workflows` table

For scheduling: Add **Temporal** to docker-compose and a Temporal worker in the backend that executes workflow steps.

**New files:**

- `src/components/WorkflowBuilder.tsx` -- Visual pipeline builder UI
- `src/components/WorkflowNodeConfig.tsx` -- Node configuration dialogs
- `backend/workflows.py` -- Temporal workflow definitions and activities

**Modified:**

- `docker-compose.yml` -- Add `temporal` and `temporal-ui` services
- `backend/main.py` -- Add workflow CRUD endpoints, Temporal client
- `backend/requirements.txt` -- Add `temporalio`, `paramiko` (SFTP)
- `src/pages/Index.tsx` -- Add Workflows menu item

---

### Feature 9: Backend Port & Requirements Fix

- `backend/requirements.txt`: Change `duckdb>=1.0.0` → `duckdb>=0.10.0,<2.0.0` and use `python:3.12-slim` in Dockerfile
- Already done in previous iteration but verify consistency
- Add `boto3`, `temporalio`, `paramiko` to requirements

**Files:** `backend/requirements.txt`, `backend/Dockerfile`

---

### Feature 10: GitHub Pages Static Build

Already has `.github/workflows/deploy-gh-pages.yml`. Verify it builds with `VITE_FORCE_WASM=true` so the static version never tries to contact a backend.

**File:** `.github/workflows/deploy-gh-pages.yml` (verify only)

---

### Summary of All Changes

**New files:**

1. `src/components/FileManager.tsx` -- MinIO file manager with explorer UI
2. `src/components/ConnectorsPanel.tsx` -- Admin connectors configuration
3. `src/components/WorkflowBuilder.tsx` -- Visual ETL pipeline builder
4. `src/components/WorkflowNodeConfig.tsx` -- Workflow node config dialogs
5. `backend/workflows.py` -- Temporal workflow definitions

**Modified files:**

1. `src/pages/Index.tsx` -- Fix refreshTables for backend mode, lazy sample data, add FileManager/Workflows
2. `src/components/ColumnDiagnostics.tsx` -- Remove redundant Charts tab
3. `src/components/DatabaseSidebar.tsx` -- Add FileManager and Workflows buttons
4. `backend/main.py` -- MinIO auto-setup, file management endpoints, FTP import, workflow CRUD, Temporal client
5. `backend/requirements.txt` -- Add boto3, temporalio, paramiko; fix duckdb version
6. `backend/Dockerfile` -- Ensure python:3.12-slim
7. `docker-compose.yml` -- Add extra_hosts for backend, add Temporal + Temporal UI services

### Technical Details

**Docker Compose additions:**

```text
temporal (temporalio/auto-setup) -- port 7233
temporal-ui (temporalio/ui) -- port 8088
temporal-postgresql (postgres:13) -- internal only, Temporal's persistence DB
```

**Backend startup flow:**

1. Connect to DuckDB (persistent file)
2. Install extensions (mysql, postgres, httpfs, json, parquet, excel)
3. Connect to MinIO via boto3, create `duckdb-data` bucket
4. Check for existing `main.duckdb` in bucket, download if present
5. Init `_meta` schema for connections/workflows
6. Start Temporal client connection

**Workflow execution model:**

- Frontend sends workflow definition (JSON) to backend
- Backend stores in `_meta.workflows`
- "Run Now" executes steps sequentially via Temporal activity
- "Schedule" creates a Temporal schedule with cron expression
- Each step: fetch data → transform (SQL) → output  
  
also update the read me for wasm only deloyment in local setup process just using yarn , and also include docker compose method for full backend and frontend deployemnt process , and instructions to setup localy and in prod .  
  
also update instructions about the project in the read me as well .   
  
next the github pages wasam system is not hosted even after i push to main the deployement using github actions is not working fix that error as well .   
  
next the process to manage project and debug everything must also be included   
  
