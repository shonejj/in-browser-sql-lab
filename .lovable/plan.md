

## Plan: Fix Compute Errors, Theme Consistency, DataToolbar in Table Editor, Copy Table Name, and UI Cleanup

### 1. Compute Operation Error (Critical -- Screenshot Bug)

**Root cause:** The compute operation generates `SELECT *, ("order_id" + "customer_id") AS "computed_column"` which fails because DuckDB's `+` operator doesn't work on VARCHAR columns. The error is: `No function matches the given name and argument types '+(VARCHAR, VARCHAR)'`.

**Fix:** In `DataToolbar.tsx`, for arithmetic operations (`+`, `-`, `*`, `/`, `%`), wrap columns in `TRY_CAST(... AS DOUBLE)` so the query becomes:
```sql
SELECT *, (TRY_CAST("order_id" AS DOUBLE) + TRY_CAST("customer_id" AS DOUBLE)) AS "computed_column" FROM ...
```
For `||` (concat), keep columns as-is since concat works on VARCHAR. Also add column type info to the toolbar so users see which columns are numeric vs string.

**File:** `src/components/DataToolbar.tsx`

---

### 2. Route Pages Theme Mismatch (ConnectorsPage, FileManagerPage, WorkflowsPage)

**Problem:** All three route pages hardcode dark slate backgrounds (`bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`, `bg-slate-800`, `text-white`, etc.) instead of using the app's theme system (Tailwind `bg-background`, `text-foreground`, `bg-card`, `border-border`).

**Fix:** Replace all hardcoded slate/dark classes with theme-aware classes across all three pages:
- `from-slate-900 via-slate-800` → `bg-background`
- `bg-slate-800` → `bg-card`
- `border-slate-700` → `border-border`
- `text-white` → `text-foreground`
- `text-slate-400` → `text-muted-foreground`
- `bg-slate-700` → `bg-muted`
- Form inputs: remove hardcoded dark classes, use default shadcn styling
- Custom dialog overlays → use proper `<Dialog>` components from shadcn

**Files:** `src/pages/ConnectorsPage.tsx`, `src/pages/FileManagerPage.tsx`, `src/pages/WorkflowsPage.tsx`

---

### 3. DataToolbar Inside Table Editor View

**Problem:** User wants DataToolbar to appear in the table editor (output-level), not just at the top of the main page. The table editor dialog has no compute tools.

**Fix:** Import `DataToolbar` into `TableDataEditor.tsx` and render it inside the toolbar area. Pass the editor's `columns` and `tableName`. The `onGenerateQuery` callback will execute the transformation via `executeQuery`, then reload the table data.

**File:** `src/components/TableDataEditor.tsx`

---

### 4. Copy Table Name Not Working

**Problem:** Looking at `DatabaseSidebar.tsx` line 168, the copy button uses `navigator.clipboard.writeText(table.name)` which should work. However, the button group has `opacity-0 group-hover:opacity-100` (line 157) and the buttons are tiny (`h-6 w-6`). In some contexts, `navigator.clipboard.writeText` may fail silently without HTTPS.

**Fix:** Wrap the clipboard call in a try-catch with a fallback using `document.execCommand('copy')`. Also ensure the toast message confirms it worked. The current code looks correct syntactically -- the issue may be that the click is intercepted by the parent button's click handler (the table expand toggle). Move the action buttons outside the parent `<button>` element to prevent event bubbling.

**File:** `src/components/DatabaseSidebar.tsx`

---

### 5. Table Editor Missing Close Button

**Problem:** The `TableDataEditor` dialog (line 277) has `[&>button:last-child]:hidden` which hides the default Dialog close button, but there's no explicit close button provided either.

**Fix:** Add a close button (X icon) in the dialog header next to the title.

**File:** `src/components/TableDataEditor.tsx`

---

### 6. DatabaseSidebar Footer Cleanup

**Problem:** The sidebar footer (lines 196-212) still has many component buttons (CSVImporter, DuckDBFileAttacher, DatabaseConnector, S3Connector, ExtensionsPanel, NotebookManager) which clutters the sidebar. These were supposed to be removed per the previous plan.

**Fix:** Keep only: CSVImporter, Download DB, Refresh. Remove the others (DatabaseConnector, S3Connector, ExtensionsPanel, DuckDBFileAttacher, NotebookManager) since they're accessible from the top bar or attach button.

**File:** `src/components/DatabaseSidebar.tsx`

---

### 7. Confirm Dialogs -- Replace `confirm()` with ConfirmDialog

**Problem:** `FileManagerPage.tsx` line 102, `ConnectorsPage.tsx` line 132, `WorkflowsPage.tsx` line 91 all use `confirm()` (browser native popup).

**Fix:** Import and use the existing `ConfirmDialog` component for all delete confirmations across these three pages.

**Files:** `src/pages/FileManagerPage.tsx`, `src/pages/ConnectorsPage.tsx`, `src/pages/WorkflowsPage.tsx`

---

### Summary of Changes

| File | Changes |
|------|---------|
| `src/components/DataToolbar.tsx` | TRY_CAST for arithmetic ops on VARCHAR columns |
| `src/components/TableDataEditor.tsx` | Add DataToolbar + close button |
| `src/components/DatabaseSidebar.tsx` | Fix copy click propagation, clean footer |
| `src/pages/ConnectorsPage.tsx` | Theme-aware classes, ConfirmDialog |
| `src/pages/FileManagerPage.tsx` | Theme-aware classes, ConfirmDialog |
| `src/pages/WorkflowsPage.tsx` | Theme-aware classes, ConfirmDialog |

