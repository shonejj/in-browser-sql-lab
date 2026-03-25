import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseSidebar } from '@/components/DatabaseSidebar';
import { QueryCell } from '@/components/QueryCell';
import { ColumnDiagnostics } from '@/components/ColumnDiagnostics';
import { QueryHistory, QueryHistoryItem } from '@/components/QueryHistory';
import { AIChatAssistant } from '@/components/AIChatAssistant';
import { TableDataEditor } from '@/components/TableDataEditor';
import { TableDetailsPanel } from '@/components/TableDetailsPanel';
import { DataToolbar } from '@/components/DataToolbar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Footer } from '@/components/Footer';
import { NotebookManagerEnhanced } from '@/components/NotebookManagerEnhanced';
import { DatabaseConnector } from '@/components/DatabaseConnector';
import { DuckDBFileAttacher } from '@/components/DuckDBFileAttacher';
import { 
  initDuckDB, executeQuery, isBackendMode, 
  getBackendUrl, setBackendUrl, forceWasmMode, forceBackendMode, setAutoMode,
  getForceMode, backendListTables
} from '@/lib/duckdb';
import { generateTrainData, initialQuery } from '@/lib/sampleData';
import { getNotebook, saveNotebook, type NotebookDoc } from '@/lib/notebooks';
import { toast } from 'sonner';
import { History, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Sparkles, Download, Server, Monitor, Settings2, FolderOpen, Plug, GitBranch, Database, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface QueryCell {
  id: string;
  query: string;
  results: any[];
  isExecuting: boolean;
}

const Index = () => {
  const navigate = useNavigate();
  const [cells, setCells] = useState<QueryCell[]>([
    { id: '1', query: initialQuery, results: [], isExecuting: false }
  ]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string>();
  const [selectedCellId, setSelectedCellId] = useState<string>('1');
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [tables, setTables] = useState<Array<{ name: string; rowCount: number; columns: any[] }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [detailsTable, setDetailsTable] = useState<string | null>(null);
  const [currentNotebook, setCurrentNotebook] = useState<NotebookDoc | null>(null);
  const isInitializingRef = useRef(false);

  // Mode switch dialog
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [backendUrlInput, setBackendUrlInput] = useState(getBackendUrl());
  const [currentMode, setCurrentMode] = useState<'wasm' | 'backend'>(isBackendMode() ? 'backend' : 'wasm');

  // Feature dialogs (File Manager, Connectors, Workflows are now full-page routes)
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [attachFileDialogOpen, setAttachFileDialogOpen] = useState(false);

  // Platform info
  const [privacyMode, setPrivacyMode] = useState(false);

  useEffect(() => {
    if (!isInitializingRef.current && !isInitialized) {
      initializeDatabase();
    }
  }, []);

  async function initializeDatabase() {
    if (isInitializingRef.current || isInitialized) return;
    
    isInitializingRef.current = true;
    try {
      toast.loading('Initializing DuckDB...', { id: 'init' });
      
      await initDuckDB();
      setCurrentMode(isBackendMode() ? 'backend' : 'wasm');

      // Check platform info in backend mode
      if (isBackendMode()) {
        try {
          const base = getBackendUrl();
          const res = await fetch(`${base}/api/health`);
          if (res.ok) {
            const info = await res.json();
            setPrivacyMode(info.privacy_mode || false);
          }
        } catch { /* ignore */ }
      }

      setIsInitialized(true);
      toast.success(`Database initialized (${isBackendMode() ? 'Server' : 'WASM'} mode)`, { id: 'init' });
      
      // Retry table refresh with delay for server mode (backend may still be restoring from MinIO)
      if (isBackendMode()) {
        await refreshTables();
        // Retry once after a short delay in case tables are still loading
        setTimeout(async () => {
          await refreshTables();
        }, 2000);
      } else {
        await refreshTables();
      }
    } catch (error) {
      console.error('Failed to initialize database:', error);
      toast.error(`Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: 'init' });
    } finally {
      isInitializingRef.current = false;
    }
  }

  async function handleSwitchMode(mode: 'wasm' | 'backend') {
    try {
      if (mode === 'backend') {
        toast.loading('Connecting to backend...', { id: 'mode' });
        await forceBackendMode(backendUrlInput);
        toast.success('Switched to Server mode', { id: 'mode' });
      } else {
        toast.loading('Switching to WASM...', { id: 'mode' });
        await forceWasmMode();
        toast.success('Switched to WASM mode', { id: 'mode' });
      }
      setCurrentMode(mode);
      setModeDialogOpen(false);
      await refreshTables();
    } catch (err: any) {
      toast.error(`Mode switch failed: ${err.message}`, { id: 'mode' });
    }
  }

  async function handleExecuteQuery(cellId: string) {
    if (!isInitialized) {
      toast.error('Database is still initializing...');
      return;
    }

    const cell = cells.find(c => c.id === cellId);
    if (!cell) return;

    const copyMatch = cell.query.match(/COPY\s*\((.*?)\)\s*TO\s*['"](.+?)['"]/i);
    if (copyMatch) {
      try {
        const innerQuery = copyMatch[1];
        const fileName = copyMatch[2];
        const result = await executeQuery(innerQuery);
        if (result.length === 0) { toast.error('No data to export'); return; }
        const columns = Object.keys(result[0]);
        const headers = columns.join(',');
        const csvRows = result.map(row => columns.map(c => JSON.stringify(row[c] ?? '')).join(','));
        const csv = [headers, ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${result.length} rows to ${fileName}`);
        return;
      } catch (error: any) {
        toast.error(`Export failed: ${error.message}`);
        return;
      }
    }

    setCells(prev => prev.map(c => c.id === cellId ? { ...c, isExecuting: true } : c));
    const startTime = performance.now();
    
    try {
      const result = await executeQuery(cell.query);
      const executionTime = Math.round(performance.now() - startTime);
      
      setCells(prev => prev.map(c => c.id === cellId ? { ...c, results: result, isExecuting: false } : c));
      setSelectedCellId(cellId);
      
      setQueryHistory(prev => [...prev, {
        id: Date.now().toString(), query: cell.query, timestamp: new Date(),
        success: true, rowCount: result.length, executionTime,
      }]);
      
      if (result.length > 0) {
        const columns = Object.keys(result[0]);
        const categoricalCol = columns.find(col => {
          const value = result[0][col];
          return typeof value === 'string' && !value.includes(':') && !value.includes('-');
        });
        setSelectedColumn(categoricalCol || columns[0]);
      }
      
      toast.success(`Query executed: ${result.length} rows in ${executionTime}ms`);

      // Refresh tables in case query modified schema
      const q = cell.query.trim().toUpperCase();
      if (q.startsWith('CREATE') || q.startsWith('DROP') || q.startsWith('ALTER') || q.startsWith('INSERT')) {
        await refreshTables();
      }
    } catch (error: any) {
      console.error('Query error:', error);
      setCells(prev => prev.map(c => c.id === cellId ? { ...c, isExecuting: false } : c));
      setQueryHistory(prev => [...prev, {
        id: Date.now().toString(), query: cell.query, timestamp: new Date(), success: false,
      }]);
      toast.error(error.message || 'Query execution failed');
    }
  }

  function handleAddCell() {
    const newCell: QueryCell = { id: Date.now().toString(), query: '', results: [], isExecuting: false };
    setCells(prev => [...prev, newCell]);
    toast.success('New query cell added');
  }

  function handleDeleteCell(cellId: string) {
    if (cells.length === 1) { toast.error('Cannot delete the last cell'); return; }
    setCells(prev => prev.filter(c => c.id !== cellId));
    toast.success('Cell deleted');
  }

  function handleUpdateCellQuery(cellId: string, query: string) {
    setCells(prev => prev.map(c => c.id === cellId ? { ...c, query } : c));
  }

  function handleNotebookSelect(notebookId: string) {
    const notebook = getNotebook(notebookId);
    if (!notebook) { toast.error('Notebook not found'); return; }
    const queryCells = notebook.cells.filter(cell => cell.type === 'code').map((cell, index) => ({
      id: `${Date.now()}_${index}`, query: cell.content, results: [], isExecuting: false
    }));
    if (queryCells.length === 0) {
      queryCells.push({ id: Date.now().toString(), query: '', results: [], isExecuting: false });
    }
    setCells(queryCells);
    setCurrentNotebook(notebook);
    toast.success(`Opened notebook: ${notebook.title}`);
  }

  function handleSaveNotebook() {
    if (!currentNotebook) { toast.error('No notebook is currently open'); return; }
    const updatedNotebook: NotebookDoc = {
      ...currentNotebook,
      cells: cells.map(cell => ({ id: cell.id, type: 'code' as const, content: cell.query }))
    };
    saveNotebook(updatedNotebook);
    setCurrentNotebook(updatedNotebook);
    toast.success('Notebook saved');
  }

  async function refreshTables() {
    try {
      if (isBackendMode()) {
        const backendTables = await backendListTables();
        setTables(backendTables || []);
        (window as any).__duckdb_tables__ = (backendTables || []).map((t: any) => t.name);
      } else {
        const tablesResult = await executeQuery(
          "SELECT table_name as name FROM information_schema.tables WHERE table_schema = 'main'"
        );
        const tablesData = [];
        for (const tableRow of tablesResult) {
          const tableName = tableRow.name;
          const countResult = await executeQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
          const rowCount = countResult[0].count;
          const columnsResult = await executeQuery(`PRAGMA table_info('${tableName}')`);
          const columns = columnsResult.map((col: any) => ({ name: col.name, type: col.type }));
          tablesData.push({ name: tableName, rowCount, columns });
        }
        setTables(tablesData);
        (window as any).__duckdb_tables__ = tablesData.map(t => t.name);
      }
    } catch (error) {
      console.error('Failed to refresh tables:', error);
    }
  }

  async function handleImportCSV(tableName: string, data: any[], columns: string[], opts?: { overwrite?: boolean, allVarchar?: boolean }) {
    try {
      if (data && data.length === 1 && data[0] instanceof File) {
        const file = data[0] as File;
        if (opts?.overwrite) await executeQuery(`DROP TABLE IF EXISTS "${tableName.replace(/"/g, '""')}"`);
        const { importCSVFile } = await import('@/lib/duckdb');
        await importCSVFile(file, tableName, columns);
        await refreshTables();
        return;
      }
      
      const safeTable = String(tableName).replace(/"/g, '""');
      
      if (opts?.overwrite) {
        await executeQuery(`DROP TABLE IF EXISTS "${safeTable}"`);
      } else {
        try {
          const existsRes = await executeQuery(
            `SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_name='${safeTable}'`
          );
          if (existsRes && existsRes.length > 0) {
            throw new Error(`Table '${tableName}' already exists.`);
          }
        } catch (e: any) {
          if (e.message.includes('already exists')) throw e;
        }
      }
      
      const sanitizedColumns = columns.map((col, idx) => {
        let sanitized = col && col.trim() ? col.trim() : `column_${idx + 1}`;
        sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');
        if (/^\d/.test(sanitized)) sanitized = 'col_' + sanitized;
        return sanitized;
      });
      const uniqueColumns = sanitizedColumns.map((col, idx) => {
        const duplicates = sanitizedColumns.slice(0, idx).filter(c => c === col);
        return duplicates.length > 0 ? `${col}_${duplicates.length + 1}` : col;
      });
      
      const columnDefs = uniqueColumns.map((col, idx) => {
        if (opts?.allVarchar) return `"${col}" VARCHAR`;
        const originalCol = columns[idx];
        const firstValue = data.find(row => row[originalCol] !== null && row[originalCol] !== undefined)?.[originalCol];
        let type = 'VARCHAR';
        if (typeof firstValue === 'number') type = Number.isInteger(firstValue) ? 'INTEGER' : 'DOUBLE';
        else if (firstValue instanceof Date) type = 'TIMESTAMP';
        return `"${col}" ${type}`;
      }).join(', ');
      
      await executeQuery(`CREATE TABLE "${safeTable}" (${columnDefs})`);
      
      const batchSize = 1000;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const values = batch.map(row => {
          const vals = columns.map((originalCol) => {
            const val = row[originalCol];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return val;
          }).join(', ');
          return `(${vals})`;
        }).join(', ');
        await executeQuery(`INSERT INTO "${safeTable}" VALUES ${values}`);
      }
      
      await refreshTables();
      toast.success(`Imported ${data.length} rows into ${tableName}`);
    } catch (error: any) {
      console.error('CSV import error:', error);
      throw new Error(error.message || 'Failed to import CSV');
    }
  }

  async function handleDeleteTable(tableName: string) {
    try {
      const safeTable = String(tableName).replace(/"/g, '""');
      await executeQuery(`DROP TABLE IF EXISTS "${safeTable}"`);
      await refreshTables();
      toast.success(`Table '${tableName}' deleted`);
    } catch (error: any) {
      toast.error(`Failed to delete table: ${error?.message || 'Unknown error'}`);
    }
  }

  async function handleLoadSampleData() {
    try {
      toast.loading('Loading sample data...', { id: 'sample' });
      
      const trainData = generateTrainData(1000);
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS trains (
          service_id INTEGER, date DATE, type VARCHAR, train_number INTEGER,
          station_code VARCHAR, station_name VARCHAR,
          departure_time TIMESTAMP, arrival_time TIMESTAMP
        )
      `);
      const batchSize = 500;
      for (let i = 0; i < trainData.length; i += batchSize) {
        const batch = trainData.slice(i, i + batchSize);
        const values = batch.map(row =>
          `(${row.service_id}, '${row.date}', '${row.type}', ${row.train_number}, '${row.station_code}', '${row.station_name}', ${row.departure_time ? `'${row.departure_time}'` : 'NULL'}, ${row.arrival_time ? `'${row.arrival_time}'` : 'NULL'})`
        ).join(',');
        await executeQuery(`INSERT INTO trains VALUES ${values}`);
      }
      
      await refreshTables();
      
      // Auto-populate the first cell with a trains query and execute it
      const trainQuery = 'FROM trains;';
      setCells(prev => {
        const first = prev[0];
        // Only replace if the first cell is empty or has the welcome comment
        if (first && (!first.query.trim() || first.query.startsWith('--'))) {
          return [{ ...first, query: trainQuery }, ...prev.slice(1)];
        }
        // Otherwise add a new cell
        return [...prev, { id: Date.now().toString(), query: trainQuery, results: [], isExecuting: false }];
      });
      
      toast.success('Sample data loaded! (trains dataset - 1000 rows)', { id: 'sample' });
      
      // Auto-execute after a brief delay
      setTimeout(() => {
        const firstCell = cells[0];
        if (firstCell) handleExecuteQuery(firstCell.id);
      }, 300);
    } catch (error: any) {
      toast.error(`Failed to load sample data: ${error.message}`, { id: 'sample' });
    }
  }

  async function handleToolbarGenerateQuery(
    query: string,
    options?: {
      applyToTable?: boolean;
      refreshQuery?: string;
      successMessage?: string;
    }
  ) {
    if (options?.applyToTable) {
      const executionCellId = selectedCellId || cells[0]?.id;
      if (!executionCellId) return;

      setCells(prev => prev.map(c => c.id === executionCellId ? { ...c, isExecuting: true } : c));
      try {
        await executeQuery(query);
        const refreshedResults = options.refreshQuery ? await executeQuery(options.refreshQuery) : [];
        setCells(prev => prev.map(c => c.id === executionCellId ? {
          ...c,
          query: options.refreshQuery || c.query,
          results: refreshedResults,
          isExecuting: false,
        } : c));
        await refreshTables();
        toast.success(options.successMessage || 'Transformation applied');
      } catch (error: any) {
        setCells(prev => prev.map(c => c.id === executionCellId ? { ...c, isExecuting: false } : c));
        toast.error(error?.message || 'Failed to apply transformation');
      }
      return;
    }

    const newCell: QueryCell = { id: Date.now().toString(), query, results: [], isExecuting: false };
    setCells(prev => [...prev, newCell]);
    setSelectedCellId(newCell.id);
    setTimeout(() => handleExecuteQuery(newCell.id), 200);
  }

  function handleAttachDatabase() {
    if (isBackendMode()) {
      setAttachDialogOpen(true);
    } else {
      setAttachFileDialogOpen(true);
    }
  }

  const currentColumns = useMemo(() => {
    const cell = cells.find(c => c.id === selectedCellId);
    if (cell && cell.results.length > 0) return Object.keys(cell.results[0]);
    return [];
  }, [cells, selectedCellId]);

  // Extract source table name from the selected cell's query for DataToolbar
  const currentSourceTable = useMemo(() => {
    const cell = cells.find(c => c.id === selectedCellId);
    if (!cell?.query) return undefined;
    const match = cell.query.match(/\bFROM\s+["']?(\w+)["']?/i);
    return match ? match[1] : undefined;
  }, [cells, selectedCellId]);

  return (
    <div className="flex h-screen bg-background">
      {leftSidebarOpen && (
        <DatabaseSidebar 
          tables={tables} 
          onTableClick={(name) => {
            const newCell: QueryCell = { id: Date.now().toString(), query: `SELECT * FROM "${name}";`, results: [], isExecuting: false };
            setCells(prev => [...prev, newCell]);
          }}
          onImportCSV={handleImportCSV}
          onRefresh={refreshTables}
          onDeleteTable={handleDeleteTable}
          onOpenInEditor={(tableName) => setEditingTable(tableName)}
          onImportComplete={refreshTables}
          onTableDetails={(tableName) => setDetailsTable(tableName)}
          onNotebookSelect={handleNotebookSelect}
          onOpenFileManager={() => setFileManagerOpen(true)}
          onOpenConnectors={() => setConnectorsOpen(true)}
          onOpenWorkflows={() => setWorkflowsOpen(true)}
          onAttachDatabase={handleAttachDatabase}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setLeftSidebarOpen(!leftSidebarOpen)} className="h-8 w-8">
              {leftSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">DuckDB Lab</span>
              <button
                onClick={() => { setBackendUrlInput(getBackendUrl()); setModeDialogOpen(true); }}
                className="cursor-pointer"
              >
                <Badge 
                  variant={currentMode === 'backend' ? 'default' : 'secondary'} 
                  className="text-[10px] h-4 px-1.5 hover:opacity-80 transition-opacity"
                >
                  {currentMode === 'backend' ? (
                    <><Server className="w-2.5 h-2.5 mr-0.5" /> Server</>
                  ) : (
                    <><Monitor className="w-2.5 h-2.5 mr-0.5" /> WASM</>
                  )}
                </Badge>
              </button>
              {privacyMode && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-destructive text-destructive">
                  <Shield className="w-2.5 h-2.5 mr-0.5" /> Privacy
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleLoadSampleData} className="h-7 px-2 gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span className="text-xs">Sample Data</span>
            </Button>

            {currentMode === 'backend' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5">
                    <Server className="w-3.5 h-3.5" />
                    <span className="text-xs">Tools</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate('/files')}>
                    <FolderOpen className="w-3.5 h-3.5 mr-2" /> File Manager
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/connectors')}>
                    <Plug className="w-3.5 h-3.5 mr-2" /> Connectors
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/workflows')}>
                    <GitBranch className="w-3.5 h-3.5 mr-2" /> Workflows
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button variant="ghost" size="sm" onClick={handleAddCell} className="h-7 px-2 gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span className="text-xs">New Cell</span>
            </Button>

            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  <span className="text-xs">History ({queryHistory.length})</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0">
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle>Query History</SheetTitle>
                </SheetHeader>
                <QueryHistory 
                  history={queryHistory}
                  onRunQuery={(q) => {
                    const newCell: QueryCell = { id: Date.now().toString(), query: q, results: [], isExecuting: false };
                    setCells(prev => [...prev, newCell]);
                    setHistoryOpen(false);
                    setTimeout(() => handleExecuteQuery(newCell.id), 100);
                  }}
                  onClearHistory={() => setQueryHistory([])}
                />
              </SheetContent>
            </Sheet>

            <AIChatAssistant 
              tables={tables}
              onQuerySelect={(query) => {
                const newCell: QueryCell = { id: Date.now().toString(), query, results: [], isExecuting: false };
                setCells(prev => [...prev, newCell]);
              }}
              renderTrigger={(onClick) => (
                <Button variant="ghost" size="sm" onClick={onClick} className="h-7 px-2 gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-xs">AI Assistant</span>
                </Button>
              )}
            />

            <NotebookManagerEnhanced onNotebookSelect={handleNotebookSelect} />

            {currentNotebook && (
              <Button variant="ghost" size="sm" onClick={handleSaveNotebook} className="h-7 px-2 gap-1.5">
                <span className="text-xs">Save: {currentNotebook.title}</span>
              </Button>
            )}

            <Button variant="ghost" size="icon" onClick={() => setRightSidebarOpen(!rightSidebarOpen)} className="h-8 w-8">
              {rightSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Data Toolbar */}
        {currentColumns.length > 0 && (
          <div className="px-6 pt-4">
            <DataToolbar
              columns={currentColumns}
              tableName={currentSourceTable}
              sourceQuery={cells.find(c => c.id === selectedCellId)?.query}
              onGenerateQuery={handleToolbarGenerateQuery}
            />
          </div>
        )}

        {/* Query and Results */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-20">
          {cells.map((cell) => (
            <QueryCell
              key={cell.id}
              id={cell.id}
              query={cell.query}
              results={cell.results}
              isExecuting={cell.isExecuting}
              onQueryChange={(q) => handleUpdateCellQuery(cell.id, q)}
              onExecute={() => handleExecuteQuery(cell.id)}
              onDelete={() => handleDeleteCell(cell.id)}
              showDelete={cells.length > 1}
              onDataChange={(newData) => {
                setCells(prev => prev.map(c => c.id === cell.id ? { ...c, results: newData } : c));
              }}
              onColumnClick={(col) => { setSelectedColumn(col); setSelectedCellId(cell.id); }}
              selectedColumn={selectedCellId === cell.id ? selectedColumn : undefined}
              onOpenTableEditor={() => {
                const tempTableName = `_temp_results_${Date.now()}`;
                if (cell.results.length > 0) {
                  const cols = Object.keys(cell.results[0]);
                  const colDefs = cols.map(c => `"${c}" VARCHAR`).join(', ');
                  executeQuery(`CREATE TEMP TABLE "${tempTableName}" (${colDefs})`)
                    .then(() => {
                      const values = cell.results.map(row => 
                        '(' + cols.map(c => {
                          const val = row[c];
                          if (val === null || val === undefined) return 'NULL';
                          return `'${String(val).replace(/'/g, "''")}'`;
                        }).join(',') + ')'
                      ).join(',');
                      return executeQuery(`INSERT INTO "${tempTableName}" VALUES ${values}`);
                    })
                    .then(() => { setEditingTable(tempTableName); toast.success('Created temporary table for editing'); })
                    .catch((err: any) => { toast.error(`Failed: ${err.message}`); });
                }
              }}
            />
          ))}
        </div>
        
        <Footer />
      </div>

      {/* Right Sidebar */}
      {rightSidebarOpen && (
        <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
          <ColumnDiagnostics
            data={cells.find(c => c.id === selectedCellId)?.results || []}
            selectedColumn={selectedColumn}
            onColumnSelect={setSelectedColumn}
            cells={cells}
            selectedCellId={selectedCellId}
            onCellSelect={setSelectedCellId}
          />
        </div>
      )}
      
      {editingTable && (
        <TableDataEditor tableName={editingTable} onClose={() => { setEditingTable(null); refreshTables(); }} />
      )}

      {detailsTable && (
        <TableDetailsPanel tableName={detailsTable} onClose={() => setDetailsTable(null)} />
      )}

      {/* Mode Switch Dialog */}
      <Dialog open={modeDialogOpen} onOpenChange={setModeDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              DuckDB Engine Mode
            </DialogTitle>
            <DialogDescription>
              Choose between local WASM engine or a remote Server engine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleSwitchMode('wasm')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  currentMode === 'wasm' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <Monitor className="w-6 h-6 mb-2" />
                <div className="font-medium text-sm">WASM</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Runs in browser. No server needed. Limited extensions.
                </p>
              </button>

              <button
                onClick={() => handleSwitchMode('backend')}
                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                  currentMode === 'backend' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                }`}
              >
                <Server className="w-6 h-6 mb-2" />
                <div className="font-medium text-sm">Server</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Full DuckDB. MySQL, Postgres, S3, all extensions.
                </p>
              </button>
            </div>

            <div>
              <Label className="text-xs">Backend URL</Label>
              <Input
                value={backendUrlInput}
                onChange={(e) => setBackendUrlInput(e.target.value)}
                placeholder="http://localhost:9876"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used when Server mode is selected. Leave empty for Docker (uses nginx proxy).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attach Database Dialog (Server mode) */}
      {attachDialogOpen && (
        <DatabaseConnector onImportComplete={() => { refreshTables(); setAttachDialogOpen(false); }} />
      )}

      {/* Attach File Dialog (WASM mode) */}
      {attachFileDialogOpen && (
        <DuckDBFileAttacher onAttach={() => { refreshTables(); setAttachFileDialogOpen(false); }} />
      )}
    </div>
  );
};

export default Index;
