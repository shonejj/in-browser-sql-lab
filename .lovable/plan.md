

## Plan: Fix Ctrl+Enter in Server Mode, Remove Duplicate Nav, Fix Monaco Theme, and Align Features

### Critical Bug 1: Ctrl+Enter Not Executing in Server Mode

**Root Cause:** In `QueryEditor.tsx` line 246-248, the Monaco `addCommand` captures a stale closure of `handleExecute`. The `handleExecute` function (line 30-37) calls `validateSQL(query)` where `query` is a prop. Since `onMount` runs once, it captures the initial `query` value (the welcome comment). When the user types a new query and presses Ctrl+Enter, it validates against the OLD query, which may fail validation or call the wrong `onExecute`.

**Fix:** Use a `useRef` to hold the latest `onExecute` and `query` values. In the Monaco `addCommand`, call `ref.current()` instead of the stale `handleExecute`. Also fix the hardcoded `theme="vs-light"` (line 250) to respect dark mode by using `theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}`.

**File:** `src/components/QueryEditor.tsx`

---

### Bug 2: Duplicate Nav Items (File Manager, Connectors, Workflows)

**Problem:** In server mode, File Manager, Connectors, and Workflows appear in both:
- The sidebar footer (`DatabaseSidebar.tsx` lines 213-230)
- The top bar Tools dropdown (`Index.tsx` lines 505-526)

**Fix:** Remove the duplicate buttons from `DatabaseSidebar.tsx` footer (lines 213-230). Keep them only in the top bar Tools dropdown, which is cleaner and less cluttered. The sidebar should focus on database tree navigation only.

**File:** `src/components/DatabaseSidebar.tsx`

---

### Bug 3: Monaco Editor Theme Not Following Dark Mode

**Problem:** `QueryEditor.tsx` line 250 hardcodes `theme="vs-light"`. In dark mode, the editor stays light.

**Fix:** Use `theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}` (already imports `useTheme` from next-themes on line 7).

**File:** `src/components/QueryEditor.tsx`

---

### Fix 4: File Manager -- Add "Import to DuckDB" from MinIO

**Problem:** The File Manager lets you browse MinIO files but has no direct "import this file as a DuckDB table" action.

**Fix:** Add an "Import to DuckDB" button next to each CSV/Parquet/JSON file in `FileManager.tsx`. When clicked, it calls the backend `/api/import` endpoint with the MinIO file path, or downloads and re-uploads via `/api/s3/import` if available. The backend already supports `COPY ... FROM 's3://...'` queries.

**File:** `src/components/FileManager.tsx`

---

### Fix 5: Workflow Builder Improvements

**Problem:** The workflow builder only has basic source/transform/destination with minimal config. Not close to n8n-level. Steps don't have proper node types like "Read from MinIO", "MySQL Query", "HTTP Request", etc.

**Fix:** Enhance the step configuration in `WorkflowBuilder.tsx`:
- Add predefined source types: MinIO File, MySQL Query, PostgreSQL Query, HTTP/API, FTP File
- Add predefined transform types: SQL Query, Filter, Aggregate, Join, Deduplicate
- Add predefined destination types: MinIO/S3, MySQL Insert, API POST, DuckDB Table
- Each type shows relevant config fields (endpoint, query, path, table name, etc.)
- Show step status indicators when running
- Add a "Logs" tab to see execution output

**File:** `src/components/WorkflowBuilder.tsx`

---

### Fix 6: Ensure All Compute/DataToolbar Operations Work in Server Mode

**Problem:** The `DataToolbar` generates SQL queries and adds them as new cells. This uses `executeQuery()` which routes through the backend in server mode. The queries reference `_last_result` as table name which doesn't exist.

**Fix:** Update `DataToolbar` to accept the actual source table name from the last executed query. In `Index.tsx`, pass the source table name extracted from the last query (parse FROM clause). If no table found, use a subquery approach: `SELECT ... FROM (last_query) AS _src`.

**Files:** `src/components/DataToolbar.tsx`, `src/pages/Index.tsx`

---

### Fix 7: History and New Cell Features Parity

These already work in both modes since they're purely frontend state management. No changes needed -- verified that `handleAddCell`, `queryHistory`, and `handleNotebookSelect` don't depend on WASM-specific APIs.

---

### Summary of All Changes

**Modified files:**
1. `src/components/QueryEditor.tsx` -- Fix stale closure for Ctrl+Enter, fix dark theme
2. `src/components/DatabaseSidebar.tsx` -- Remove duplicate File Manager/Connectors/Workflows buttons from footer
3. `src/components/FileManager.tsx` -- Add "Import to DuckDB" action for MinIO files
4. `src/components/WorkflowBuilder.tsx` -- Enhanced step types with proper config fields
5. `src/components/DataToolbar.tsx` -- Fix source table reference for server mode
6. `src/pages/Index.tsx` -- Pass source table info to DataToolbar

