

## Plan: Docker Compose Stack, WASM/Server Mode Switch, MinIO/S3, DB Export/Import

### 1. Fix Docker Build Error (Critical)
The `python:3.11-slim` image doesn't have duckdb wheels for all architectures. Fix by using `python:3.12-slim` and pinning `duckdb>=0.10.0` (broader compatibility). Change backend port from 8000 to 9876.

**Files:** `backend/Dockerfile`, `backend/requirements.txt`, `backend/main.py`

### 2. Docker Compose with Full Stack
Create `docker-compose.yml` at project root with 5 services:

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `frontend` | nginx (built from Vite) | 3000 | React app |
| `backend` | python FastAPI | 9876 | DuckDB native engine |
| `mysql` | mysql:8.0 | 3306 | Sample MySQL DB with Sakila dataset |
| `phpmyadmin` | phpmyadmin/phpmyadmin | 8080 | MySQL admin UI |
| `minio` | minio/minio | 9000/9001 | S3-compatible storage |

**New files:**
- `docker-compose.yml`
- `Dockerfile` (frontend nginx)
- `nginx.conf` (proxy `/api` to backend)
- `backend/init_mysql.sql` (seed sample data)

### 3. Update Backend Port & Add MinIO/S3 + MySQL/PG Endpoints
Change backend from port 8000 to 9876. Add endpoints:

- `POST /api/s3/configure` -- Configure S3/MinIO credentials (sets DuckDB httpfs secrets)
- `POST /api/s3/list` -- List objects in a bucket
- `POST /api/s3/import` -- Import file from S3 path into DuckDB table
- `GET /api/connections` -- List saved connections (stored in DuckDB meta table)
- `POST /api/connections` -- Save a connection config
- `DELETE /api/connections/{id}` -- Remove saved connection
- `POST /api/export/duckdb` -- Export current DB as downloadable .duckdb file

Backend will auto-install mysql, postgres, httpfs extensions on startup. Use a `_meta` schema for storing connection configs in the same DuckDB instance.

**Files:** `backend/main.py`

### 4. Frontend: Update Default Backend URL
Change `DEFAULT_BACKEND_URL` from `localhost:8000` to `localhost:9876`.

**Files:** `src/lib/duckdb.ts`

### 5. Frontend: WASM/Server Mode Toggle
Add a manual toggle in the top bar to switch between WASM and Server mode. Currently it auto-detects; add explicit user control:

- Add `setMode(mode: 'wasm' | 'backend')` and `forceWasmMode()` / `forceBackendMode()` to `duckdb.ts`
- Add a dropdown/switch in `Index.tsx` top bar next to the existing badge
- When switching to backend, prompt for backend URL (default `http://localhost:9876`)
- When switching to WASM, reinitialize WASM engine if needed

**Files:** `src/lib/duckdb.ts`, `src/pages/Index.tsx`

### 6. Frontend: DuckDB Export/Download
Add ability to download the current in-memory DuckDB as a `.duckdb` file:

- WASM mode: Use `db.copyFileToBuffer()` after `EXPORT DATABASE` or `CHECKPOINT` to a temp file
- Backend mode: Call `POST /api/export/duckdb` endpoint

Add a "Download DB" button in sidebar footer.

**Files:** `src/components/DatabaseSidebar.tsx`, `src/lib/duckdb.ts`

### 7. Frontend: MinIO/S3 Connection Panel
Add a new S3/MinIO configuration dialog accessible from the sidebar. In server mode only:

- Configure endpoint, access key, secret key, bucket
- List files in bucket
- Import selected files (CSV/Parquet/JSON) as DuckDB tables
- Save/export DuckDB file to MinIO bucket

Uses DuckDB's httpfs extension behind the scenes: `SET s3_endpoint`, `SET s3_access_key_id`, etc.

**New file:** `src/components/S3Connector.tsx`
**Modified:** `src/components/DatabaseSidebar.tsx`

### 8. Frontend: Enhanced DB Connector for Server Mode
Update `DatabaseConnector.tsx`:
- Remove "Browser Limitation" warnings when in server mode
- Show sample connection buttons (MySQL Sakila on localhost:3306 from docker-compose, PostgreSQL)
- Add "Save Connection" to persist configs via backend API
- Show saved connections list

**Files:** `src/components/DatabaseConnector.tsx`

### 9. GitHub Pages Static Build
Add npm script and docs for building a WASM-only static version:

- `package.json`: Add `"build:gh-pages"` script
- Create `.github/workflows/deploy.yml` for GitHub Pages deployment
- The static build will always use WASM mode (no backend dependency)

**New files:** `.github/workflows/deploy.yml`
**Modified:** `package.json`

### 10. Frontend Dockerfile
Create a multi-stage Dockerfile for the frontend:
- Stage 1: `node:20-alpine` to build Vite app
- Stage 2: `nginx:alpine` to serve static files
- nginx.conf proxies `/api/*` to backend service

**New files:** `Dockerfile`, `nginx.conf`

---

### Summary of All Files

**New files:**
1. `docker-compose.yml` -- Full stack orchestration
2. `Dockerfile` -- Frontend nginx container
3. `nginx.conf` -- Nginx config with API proxy
4. `src/components/S3Connector.tsx` -- MinIO/S3 browser and importer
5. `.github/workflows/deploy.yml` -- GitHub Pages deployment

**Modified files:**
1. `backend/Dockerfile` -- Use python:3.12-slim, port 9876
2. `backend/requirements.txt` -- Fix duckdb version constraint
3. `backend/main.py` -- Port 9876, add S3/export/connections endpoints, auto-install extensions
4. `src/lib/duckdb.ts` -- Port 9876, manual mode toggle, DB export helper
5. `src/pages/Index.tsx` -- Mode switch UI, download DB button
6. `src/components/DatabaseSidebar.tsx` -- S3 connector button, download DB button
7. `src/components/DatabaseConnector.tsx` -- Server-mode aware UI, saved connections
8. `package.json` -- Add `build:gh-pages` script

