

## Plan: Comprehensive Stability, Workflow Stack, and Platform Architecture Fix

This plan addresses all identified issues across three tiers: core stability, workflow stack, and platform architecture.

---

### Tier 1: Core Stability

#### 1.1 Remove Default "FROM trains" Query Cell
**Problem:** On startup, the first cell contains `FROM trains;` which immediately errors because no sample data is loaded yet (screenshot confirms "Table trains does not exist").

**Fix:** Change `initialQuery` in `src/lib/sampleData.ts` to a welcome comment without any table reference. After loading sample data, auto-populate a cell with the trains query.

**Files:** `src/lib/sampleData.ts`, `src/pages/Index.tsx`

#### 1.2 Server-Mode Sidebar Shows No Tables
**Problem:** In server mode, `refreshTables()` calls `backendListTables()` which hits `/api/tables`. The backend filters by `table_catalog = 'main'` which may exclude tables from attached DuckDB files loaded from MinIO. Also the init sequence may call `refreshTables` before the backend has finished restoring from MinIO.

**Fix:**
- Remove the `table_catalog = 'main'` filter in `backend/main.py` `/api/tables` -- just filter by `table_schema = 'main'`
- Add retry logic in `refreshTables()` for server mode with a short delay
- Make `initializeDatabase()` await a health check confirmation before calling `refreshTables()`

**Files:** `backend/main.py`, `src/pages/Index.tsx`

#### 1.3 Backend URL: Use Relative Paths in Docker
**Problem:** `DEFAULT_BACKEND_URL = 'http://localhost:9876'` works for local dev but breaks when the frontend is served from Docker (nginx proxies `/api` to backend). When running via docker-compose, the frontend should use relative `/api/` paths.

**Fix:** Add logic in `duckdb.ts`: if the current page URL is NOT `localhost`, use relative URLs (just `/api/...`) since nginx will proxy them. Only use absolute `localhost:9876` when running in local dev mode.

**Files:** `src/lib/duckdb.ts`

#### 1.4 Disable "Attached databases +" Button or Make it Functional
**Problem:** The "+" button next to "Attached databases" is disabled with "coming soon" tooltip. It's confusing.

**Fix:** In server mode, wire the + button to open the `DatabaseConnector` dialog. In WASM mode, wire it to open the `DuckDBFileAttacher` dialog. Remove the `disabled` prop.

**Files:** `src/components/DatabaseSidebar.tsx`

#### 1.5 Sample Data: Show Cell Only After Loading
**Problem:** Sample data loads trains via button, but the initial cell still references trains. 

**Fix:** When "Load Sample Data" is clicked, replace the current empty/welcome cell content with `FROM trains;` and auto-execute it, instead of expecting the user to manually type it.

**Files:** `src/pages/Index.tsx`

#### 1.6 Server-Mode Feature Parity
**Problem:** Several WASM features work via `executeQuery()` which already routes through the backend in server mode -- so most SQL operations work. However, `getConnection()` and `getDatabase()` return `null` in backend mode, which breaks any component that directly calls WASM APIs.

**Audit results -- things that already work in server mode:**
- SQL queries (executeQuery routes through backend)
- Table refresh (backendListTables)
- File import (backendImportFile)
- DB attach (backendAttachDatabase)
- S3 connector, File Manager, Connectors, Extensions
- Table Details Panel (uses executeQuery for PRAGMA -- works because backend routes all SQL)
- Data Toolbar (generates SQL -- works through executeQuery)
- CSV Import (handleImportCSV uses executeQuery for batch inserts)

**Things that break in server mode:**
- `DatabaseConnector.tsx` line 118-126: calls `getConnection()` and `getDatabase()` directly for WASM file buffer registration -- but has a backend path already, so OK
- `DuckDBFileAttacher.tsx` line 38: calls `getDatabase()` for WASM -- has backend fallback, OK
- `exportDuckDB()` WASM path uses `conn!.query()` directly -- has backend path, OK

**Conclusion:** Server mode actually has good parity for SQL operations. The main issue is the sidebar not showing tables (1.2) and the backend URL issue (1.3).

---

### Tier 2: Workflow & Temporal Stack

#### 2.1 Create Temporal Worker Module
**Problem:** `backend/workflows.py` does not exist. The docker-compose runs Temporal but the backend has zero Temporal client code. Workflow execution is synchronous inside the FastAPI request handler.

**Fix:** Create `backend/workflows.py` with:
- A Temporal activity that executes a workflow step (source/transform/destination)
- A Temporal workflow that runs steps sequentially
- A Temporal worker that polls the `duckdb-lab` task queue
- Startup code to connect to Temporal

Create `backend/worker.py` as the entrypoint for running the Temporal worker process.

**Files:** `backend/workflows.py`, `backend/worker.py`

#### 2.2 Update Backend to Use Temporal Client
**Problem:** `/api/workflows/{id}/run` executes steps synchronously. Should dispatch to Temporal.

**Fix:** In `backend/main.py`:
- Import `temporalio.client`
- On startup, connect to Temporal server (configurable endpoint via `TEMPORAL_HOST` env var, default `temporal:7233`)
- `/api/workflows/{id}/run` starts a Temporal workflow execution instead of running inline
- Add `/api/workflows/{id}/status` endpoint to check execution status

**Files:** `backend/main.py`

#### 2.3 Platform-Ready Temporal: Bring Your Own
**Problem:** Users should be able to connect their own Temporal server instead of the bundled one.

**Fix:**
- Add `TEMPORAL_HOST` and `TEMPORAL_NAMESPACE` env vars to backend
- Make Temporal connection optional (graceful degradation: if Temporal unavailable, fall back to synchronous execution)
- Add a Temporal configuration section in the Connectors Panel UI
- Store Temporal config in `_meta.connections` with type `temporal`

**Files:** `backend/main.py`, `src/components/ConnectorsPanel.tsx`

#### 2.4 Docker Compose: Add Worker Service
**Problem:** The Temporal worker needs to run as a separate process.

**Fix:** Add a `worker` service to docker-compose that runs `python worker.py`:
```
worker:
  build: ./backend
  command: python worker.py
  depends_on: [temporal, minio]
  environment: [same as backend]
  network: duckdb-net
```

**Files:** `docker-compose.yml`, `backend/Dockerfile` (copy worker.py and workflows.py)

#### 2.5 Temporal Env Vars Documentation
Add `TEMPORAL_HOST`, `TEMPORAL_NAMESPACE` to the README environment variables table.

**Files:** `README.md`

---

### Tier 3: Platform Architecture (Multi-Tenant / BYO Everything)

#### 3.1 Bring Your Own Storage (BYO-S3)
**Problem:** Currently hardcoded to the bundled MinIO. Users should connect their own S3/MinIO endpoint.

**Fix:** The S3 connector and connector panel already support custom S3 endpoints. Make the backend's MinIO persistence configurable:
- If `MINIO_ENDPOINT` env var is set, use it for auto-persistence
- If not set, skip auto-persistence (user manages their own storage)
- Add a "Storage Settings" section to Connectors Panel where users can configure the persistence target

**Files:** `backend/main.py`, `src/components/ConnectorsPanel.tsx`

#### 3.2 All Data Passes Through, Nothing Stored (Privacy Mode)
**Problem:** Platform-as-a-service model: ETL operations execute here but data lives in user's infrastructure.

**Fix:**
- Add a `PRIVACY_MODE` env var to backend. When enabled:
  - DuckDB runs in `:memory:` mode (no file persistence)
  - No auto-backup to MinIO
  - All S3/DB credentials are session-only (not stored in `_meta`)
- Add a badge in the UI showing "Privacy Mode" when enabled
- Document this mode in README

**Files:** `backend/main.py`, `src/pages/Index.tsx`, `README.md`

#### 3.3 External Temporal Workers
**Problem:** Temporal workers should be connectable from different servers.

**Fix:** Already addressed by 2.3 (TEMPORAL_HOST env var). The Temporal task queue name (`duckdb-lab`) is the contract -- external workers poll the same queue. Document how to run a remote worker.

**Files:** `README.md`

#### 3.4 Better Error Handling Throughout
**Problem:** Many operations silently fail or show generic errors.

**Fix:**
- Backend: Add structured error responses with error codes
- Frontend: Show specific error messages with suggested actions (e.g., "Backend not reachable. Check if docker-compose is running.")
- Add error boundaries around each feature panel (FileManager, ConnectorsPanel, WorkflowBuilder)

**Files:** `backend/main.py`, `src/pages/Index.tsx`

---

### Summary of All Changes

**New files:**
1. `backend/workflows.py` -- Temporal workflow and activity definitions
2. `backend/worker.py` -- Temporal worker entrypoint

**Modified files:**
1. `src/lib/sampleData.ts` -- Remove trains reference from initialQuery
2. `src/lib/duckdb.ts` -- Smart backend URL detection (relative vs absolute)
3. `src/pages/Index.tsx` -- Fix sample data flow, improve error messages, add privacy mode badge
4. `src/components/DatabaseSidebar.tsx` -- Wire "+" button to appropriate dialog
5. `backend/main.py` -- Fix table_catalog filter, add Temporal client, add privacy mode, better errors
6. `backend/Dockerfile` -- Copy workflows.py and worker.py
7. `backend/requirements.txt` -- Add temporalio
8. `docker-compose.yml` -- Add worker service, add TEMPORAL_HOST env vars
9. `src/components/ConnectorsPanel.tsx` -- Add Temporal and Storage configuration sections
10. `README.md` -- Document new env vars, privacy mode, remote workers

