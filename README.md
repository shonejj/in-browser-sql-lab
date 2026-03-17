# DuckDB Lab — Browser-Based SQL IDE

A powerful, browser-based SQL IDE powered by [DuckDB](https://duckdb.org/). Supports both **WASM** (fully client-side) and **Server** mode (with MySQL, PostgreSQL, S3/MinIO, and full extension support).

## ✨ Features

- **Dual Engine**: Switch between WASM (browser-only) and Server (full backend) modes
- **SQL Notebook**: Multi-cell query editor with Monaco editor (syntax highlighting, autocomplete)
- **Data Import**: CSV, Parquet, JSON, Excel, DuckDB/SQLite files
- **Data Visualization**: Built-in charts (bar, line, area, scatter, pie) with chart builder
- **Database Connector**: Attach MySQL, PostgreSQL databases directly (Server mode)
- **S3/MinIO Integration**: Browse, import, and export data to S3-compatible storage
- **File Manager**: Windows Explorer-like MinIO file browser
- **Connectors Panel**: Configure MySQL, PostgreSQL, S3, FTP, Webhook, HTTP connectors
- **Workflow Builder**: Visual ETL pipeline builder with scheduling
- **AI Assistant**: Natural language to SQL with configurable AI backend
- **Dark/Light Theme**: Full theme support
- **DB Export**: Download your database as `.duckdb` or CSV
- **Notebooks**: Save and load query notebooks

---

## 🚀 Quick Start

### Option 1: WASM-Only (No Server Required)

Run the frontend locally — all processing happens in-browser via DuckDB WASM.

```bash
# Prerequisites: Node.js >= 20
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install --legacy-peer-deps
# or
yarn install

# Start dev server
npm run dev
# or
yarn dev
```

Open [http://localhost:8080](http://localhost:8080). The app runs entirely in the browser with DuckDB WASM.

> **Note:** WASM mode does not support MySQL/PostgreSQL connections, FTP, or some extensions.

### Option 2: Full Stack with Docker Compose

Run the complete stack including backend, MySQL, phpMyAdmin, MinIO, and Temporal.

```bash
# Prerequisites: Docker + Docker Compose
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Build and start all services
docker compose up --build -d

# Wait for services to be ready (~30-60 seconds)
docker compose logs -f backend
```

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | [http://localhost:3000](http://localhost:3000) | DuckDB Lab UI |
| Backend API | [http://localhost:9876](http://localhost:9876) | FastAPI + DuckDB native |
| phpMyAdmin | [http://localhost:8080](http://localhost:8080) | MySQL admin (root/duckdblab) |
| MinIO Console | [http://localhost:9001](http://localhost:9001) | S3 storage UI (minioadmin/minioadmin123) |
| Temporal UI | [http://localhost:8088](http://localhost:8088) | Workflow orchestration dashboard |
| MySQL | localhost:3306 | Sample database (duckdb/duckdblab) |

**Stop all services:**
```bash
docker compose down
# To also remove volumes (persistent data):
docker compose down -v
```

---

## 🌐 Deploy to GitHub Pages (WASM-Only)

The project includes a GitHub Actions workflow for automatic deployment to GitHub Pages.

### Setup

1. Go to your GitHub repo → **Settings** → **Pages**
2. Set **Source** to **GitHub Actions**
3. Push to `main` branch — the workflow triggers automatically

The deployment builds with `VITE_FORCE_WASM=true`, so the static site uses DuckDB WASM only (no backend dependency).

### Manual Trigger

You can also trigger deployment manually: **Actions** → **Deploy to GitHub Pages** → **Run workflow**

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose Stack                     │
├──────────────┬──────────────┬──────────┬────────┬───────────┤
│   Frontend   │   Backend    │  MySQL   │ MinIO  │ Temporal  │
│   (Nginx)    │  (FastAPI)   │  (8.0)   │ (S3)   │           │
│   :3000      │  :9876       │  :3306   │ :9000  │ :7233     │
│              │              │          │ :9001  │           │
│  React+Vite  │ DuckDB Native│ Sample DB│ Object │ Workflow  │
│  DuckDB WASM │ Full Exts    │          │ Store  │ Scheduler │
└──────────────┴──────────────┴──────────┴────────┴───────────┘
```

### WASM vs Server Mode

| Feature | WASM Mode | Server Mode |
|---------|-----------|-------------|
| SQL Queries | ✅ | ✅ |
| CSV/JSON/Parquet Import | ✅ | ✅ |
| MySQL/PostgreSQL Attach | ❌ | ✅ |
| S3/MinIO Integration | ❌ | ✅ |
| File Manager | ❌ | ✅ |
| Workflow Builder | ❌ | ✅ |
| FTP/SFTP Import | ❌ | ✅ |
| All DuckDB Extensions | Limited | ✅ |
| Requires Server | No | Yes |

---

## 🔧 Configuration

### Environment Variables

#### Frontend (Vite)
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_FORCE_WASM` | `false` | Force WASM mode (disable backend detection) |

#### Backend (FastAPI)
| Variable | Default | Description |
|----------|---------|-------------|
| `DUCKDB_PATH` | `/app/data/main.duckdb` | Path to persistent DuckDB file |
| `DATA_DIR` | `/app/data` | Data directory for exports |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO endpoint |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin123` | MinIO secret key |
| `MINIO_DEFAULT_BUCKET` | `duckdb-data` | Default bucket name |

### Connecting to External Databases

When running via Docker Compose, the backend can reach:
- **Docker services**: by container name (`mysql`, `minio`, etc.)
- **Host machine**: via `host.docker.internal` 
- **External networks**: directly by IP or hostname

Example: To connect to a MySQL on your host machine, use `host.docker.internal:3306` as the host.

---

## 🛠️ Development & Debugging

### Frontend Development

```bash
npm run dev          # Start Vite dev server (hot reload)
npm run build        # Production build
npm run lint         # ESLint
npm run preview      # Preview production build locally
```

### Backend Development

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 9876 --reload
```

### Debugging Tips

1. **Check service logs:**
   ```bash
   docker compose logs backend    # Backend logs
   docker compose logs frontend   # Frontend (nginx) logs
   docker compose logs mysql      # MySQL logs
   docker compose logs temporal   # Temporal logs
   ```

2. **Verify backend health:**
   ```bash
   curl http://localhost:9876/api/health
   ```

3. **Test MySQL connectivity from backend:**
   ```bash
   docker compose exec backend python -c "
   import duckdb
   con = duckdb.connect()
   con.execute(\"INSTALL mysql; LOAD mysql;\")
   con.execute(\"ATTACH 'host=mysql port=3306 user=duckdb password=duckdblab database=sampledb' AS test_db (TYPE MYSQL)\")
   print(con.execute('SELECT * FROM test_db.information_schema.tables LIMIT 5').fetchall())
   "
   ```

4. **Access MinIO console**: [http://localhost:9001](http://localhost:9001) (minioadmin/minioadmin123)

5. **Access phpMyAdmin**: [http://localhost:8080](http://localhost:8080) (root/duckdblab)

6. **Browser DevTools**: Check Console and Network tabs for API errors when in Server mode.

### Rebuilding

```bash
# Rebuild everything
docker compose up --build -d

# Rebuild just the backend
docker compose up --build -d backend

# Rebuild just the frontend
docker compose up --build -d frontend
```

---

## 📁 Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── lib/                # DuckDB engine, utilities
│   ├── pages/              # Main page (Index.tsx)
│   └── index.css           # Global styles & design tokens
├── backend/                # Python FastAPI backend
│   ├── main.py             # All API endpoints
│   ├── Dockerfile          # Backend container
│   ├── requirements.txt    # Python dependencies
│   └── init_mysql.sql      # MySQL seed data
├── docker-compose.yml      # Full stack orchestration
├── Dockerfile              # Frontend (nginx) container
├── nginx.conf              # Nginx config (API proxy)
└── .github/workflows/      # CI/CD
    └── deploy-gh-pages.yml # GitHub Pages deployment
```

---

## 🧰 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| SQL Editor | Monaco Editor |
| Charts | Recharts, ECharts |
| WASM Engine | @duckdb/duckdb-wasm |
| Backend | FastAPI, Python 3.12, DuckDB (native) |
| Storage | MinIO (S3-compatible) |
| Database | MySQL 8.0 (sample data) |
| Orchestration | Temporal |
| Deployment | Docker Compose, GitHub Pages |

---

## 📄 License

MIT
