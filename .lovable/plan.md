

## Plan: Fix Chart Crash, Add Backend Service, DuckDB File Connector, and Data Computation Tools

### Issue 1: Chart Crash (Critical)
**Root Cause:** In `AdvancedChartBuilder.tsx` line 544, `<SelectItem value="">Count only</SelectItem>` uses an empty string value. Radix Select crashes when `SelectItem` has `value=""`.

**Fix:** Change `value=""` to `value="__none__"` and handle that sentinel value in the aggregation logic (treat `"__none__"` as no Y-axis selected).

**Files:** `src/components/AdvancedChartBuilder.tsx`

---

### Issue 2: FastAPI Backend DuckDB Service
Create a standalone Python FastAPI service that runs DuckDB natively with full extension support (MySQL, PostgreSQL, httpfs, excel, etc.). The frontend will detect if the backend is running and switch from WASM to backend mode.

**New files:**
- `backend/main.py` -- FastAPI app with endpoints: `/query`, `/tables`, `/import`, `/attach`, `/extensions`
- `backend/requirements.txt` -- fastapi, uvicorn, duckdb, python-multipart
- `backend/Dockerfile` -- Docker container for easy deployment
- `backend/README.md` -- Setup instructions

**Frontend changes:**
- `src/lib/duckdb.ts` -- Add a `BackendDuckDB` mode: check if backend is running at startup (`fetch('/api/health')`), if yes route all queries through REST API instead of WASM. Add `setBackendUrl()` and `isBackendMode()` exports.
- `src/components/DatabaseConnector.tsx` -- When backend mode is active, enable real MySQL/PostgreSQL connections by sending connection config to backend.
- `src/pages/Index.tsx` -- Add a backend status indicator in the top bar showing WASM vs Backend mode.

**Backend endpoints:**
```
POST /api/query        -- Execute SQL, return JSON results  
GET  /api/tables       -- List all tables  
POST /api/import       -- Upload CSV/XLSX/Parquet files  
POST /api/attach       -- Attach external DB (MySQL, PG, SQLite, DuckDB)  
POST /api/extensions   -- Install/load DuckDB extensions  
GET  /api/health       -- Health check  
```

---

### Issue 3: DuckDB File Loading Improvements
The existing `DuckDBFileAttacher.tsx` and `DatabaseConnector.tsx` both handle DuckDB file uploads but with different approaches. Consolidate and fix:
- Remove the broken `sqlite_master` query approach in `DuckDBFileAttacher.tsx`
- Use `ATTACH` + `information_schema.tables` consistently
- Improve error messages

**Files:** `src/components/DuckDBFileAttacher.tsx`

---

### Issue 4: DuckDB Extensions Awareness
Add a settings/extensions panel showing available DuckDB extensions and their status. In WASM mode, show which extensions are available (limited). In backend mode, allow installing any extension.

**New file:** `src/components/ExtensionsPanel.tsx`
**Modified:** `src/components/DatabaseSidebar.tsx` -- Add extensions button

---

### Issue 5: Data Computation Toolbar (No-Code Operations)
Add a toolbar for non-technical users to perform operations via buttons that generate SQL behind the scenes.

**New file:** `src/components/DataToolbar.tsx`

**Features:**
- **Add Computed Column** -- Dialog to create expressions: add, subtract, multiply, divide between columns or constants. Generates `ALTER TABLE ... ADD COLUMN` + `UPDATE` or `SELECT *, expr AS new_col`
- **IF/CASE Conditions** -- Visual builder for CASE WHEN statements
- **Filter Builder** -- Visual WHERE clause builder with column, operator (=, !=, >, <, LIKE, IN), value
- **Aggregation/Group By** -- Select columns to group by + aggregation functions (COUNT, SUM, AVG, MIN, MAX)
- **Sort** -- Multi-column sort builder
- **Fuzzy Matching** -- Use DuckDB's `levenshtein()` and `jaro_winkler_similarity()` functions. UI to select two columns and threshold, generates query like `SELECT *, levenshtein(col1, col2) as distance FROM table WHERE levenshtein(col1, col2) < threshold`
- **Dedup/Distinct** -- Remove duplicates based on selected columns
- **Type Casting** -- Convert column types
- **String Operations** -- UPPER, LOWER, TRIM, SPLIT, CONCAT
- **Date Operations** -- Extract year/month/day, date diff, date add

Each operation generates a SQL query that gets inserted into a new cell and auto-executed.

**Integration:** Add the toolbar above query cells in `Index.tsx`, visible when there are results. Each operation creates a new query cell with the generated SQL.

---

### Issue 6: DB Init Speed
The current init loads remote CSV from GitHub which is slow. Make it optional/lazy:
- Load only the local `trains` table on init (fast)
- Add a "Load Sample Dataset" button for NYC taxi data instead of auto-loading

**Files:** `src/pages/Index.tsx`

---

### Summary of All Files

**New files:**
1. `backend/main.py`
2. `backend/requirements.txt`
3. `backend/Dockerfile`
4. `backend/README.md`
5. `src/components/DataToolbar.tsx`
6. `src/components/ExtensionsPanel.tsx`

**Modified files:**
1. `src/components/AdvancedChartBuilder.tsx` -- Fix empty SelectItem value
2. `src/lib/duckdb.ts` -- Add backend mode switching
3. `src/components/DatabaseConnector.tsx` -- Enable real DB connections in backend mode
4. `src/components/DuckDBFileAttacher.tsx` -- Fix file attach logic
5. `src/pages/Index.tsx` -- Add DataToolbar, backend indicator, lazy sample data loading
6. `src/components/DatabaseSidebar.tsx` -- Add extensions button

