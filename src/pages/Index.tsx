import { useState, useEffect } from 'react';
import { DatabaseSidebar } from '@/components/DatabaseSidebar';
import { QueryEditor } from '@/components/QueryEditor';
import { ResultsTable } from '@/components/ResultsTable';
import { ColumnDiagnostics } from '@/components/ColumnDiagnostics';
import { DataVisualization } from '@/components/DataVisualization';
import { ChartBuilder } from '@/components/ChartBuilder';
import { QueryHistory, QueryHistoryItem } from '@/components/QueryHistory';
import { AIChatAssistant } from '@/components/AIChatAssistant';
import { initDuckDB, executeQuery, getConnection, importCSVFile } from '@/lib/duckdb';
import { generateTrainData, initialQuery } from '@/lib/sampleData';
import { toast } from 'sonner';
import { History, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface QueryCell {
  id: string;
  query: string;
  results: any[];
  isExecuting: boolean;
}

const Index = () => {
  const [cells, setCells] = useState<QueryCell[]>([
    { id: '1', query: initialQuery, results: [], isExecuting: false }
  ]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string>();
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [tables, setTables] = useState<Array<{ name: string; rowCount: number; columns: any[] }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [showVisualization, setShowVisualization] = useState(false);

  useEffect(() => {
    initializeDatabase();
  }, []);

  async function initializeDatabase() {
    try {
      toast.loading('Initializing DuckDB...', { id: 'init' });
      
      await initDuckDB();
      
      // Generate and insert sample data
      const trainData = generateTrainData(10000);
      
      // Create trains table
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS trains (
          service_id INTEGER,
          date DATE,
          type VARCHAR,
          train_number INTEGER,
          station_code VARCHAR,
          station_name VARCHAR,
          departure_time TIMESTAMP,
          arrival_time TIMESTAMP
        )
      `);

      // Insert train data in batches
      const batchSize = 1000;
      for (let i = 0; i < trainData.length; i += batchSize) {
        const batch = trainData.slice(i, i + batchSize);
        const values = batch.map(row => 
          `(${row.service_id}, '${row.date}', '${row.type}', ${row.train_number}, '${row.station_code}', '${row.station_name}', ${row.departure_time ? `'${row.departure_time}'` : 'NULL'}, ${row.arrival_time ? `'${row.arrival_time}'` : 'NULL'})`
        ).join(',');
        
        await executeQuery(`INSERT INTO trains VALUES ${values}`);
      }

      // Create NYC taxi trips table from remote CSV
      try {
        await executeQuery(`
          CREATE TABLE nyc_taxi_trips AS
          SELECT *
          FROM read_csv_auto('https://raw.githubusercontent.com/mwaskom/seaborn-data/master/taxis.csv')
        `);
      } catch (error) {
        console.warn('Failed to load NYC taxi data:', error);
      }

      setIsInitialized(true);
      toast.success('Database initialized with 10k sample records', { id: 'init' });
      
      // Update tables list
      await refreshTables();
      
      // Auto-execute initial query
      setTimeout(() => handleExecuteQuery(cells[0].id), 100);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      toast.error(`Failed to initialize database: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: 'init' });
    }
  }

  async function handleExecuteQuery(cellId: string) {
    if (!isInitialized) {
      toast.error('Database is still initializing...');
      return;
    }

    const cell = cells.find(c => c.id === cellId);
    if (!cell) return;

    setCells(prev => prev.map(c => 
      c.id === cellId ? { ...c, isExecuting: true } : c
    ));

    const startTime = performance.now();
    
    try {
      const result = await executeQuery(cell.query);
      const executionTime = Math.round(performance.now() - startTime);
      
      setCells(prev => prev.map(c => 
        c.id === cellId ? { ...c, results: result, isExecuting: false } : c
      ));
      
      // Add to history
      setQueryHistory(prev => [...prev, {
        id: Date.now().toString(),
        query: cell.query,
        timestamp: new Date(),
        success: true,
        rowCount: result.length,
        executionTime,
      }]);
      
      // Auto-select first column with categorical data
      if (result.length > 0) {
        const columns = Object.keys(result[0]);
        const categoricalCol = columns.find(col => {
          const value = result[0][col];
          return typeof value === 'string' && !value.includes(':') && !value.includes('-');
        });
        setSelectedColumn(categoricalCol || columns[0]);
      }
      
      toast.success(`Query executed: ${result.length} rows in ${executionTime}ms`);
    } catch (error: any) {
      console.error('Query error:', error);
      
      setCells(prev => prev.map(c => 
        c.id === cellId ? { ...c, isExecuting: false } : c
      ));
      
      // Add failed query to history
      setQueryHistory(prev => [...prev, {
        id: Date.now().toString(),
        query: cell.query,
        timestamp: new Date(),
        success: false,
      }]);
      
      toast.error(error.message || 'Query execution failed');
    }
  }

  function handleAddCell() {
    const newCell: QueryCell = {
      id: Date.now().toString(),
      query: '',
      results: [],
      isExecuting: false
    };
    setCells(prev => [...prev, newCell]);
    toast.success('New query cell added');
  }

  function handleDeleteCell(cellId: string) {
    if (cells.length === 1) {
      toast.error('Cannot delete the last cell');
      return;
    }
    setCells(prev => prev.filter(c => c.id !== cellId));
    toast.success('Cell deleted');
  }

  function handleUpdateCellQuery(cellId: string, query: string) {
    setCells(prev => prev.map(c => 
      c.id === cellId ? { ...c, query } : c
    ));
  }

  async function refreshTables() {
    try {
      // Get tables using the executeQuery helper which handles BigInt conversion
      const tablesResult = await executeQuery("SELECT name FROM sqlite_master WHERE type='table'");
      
      const tablesData = [];
      
      for (const tableRow of tablesResult) {
        const tableName = tableRow.name;
        
        // Get row count - using executeQuery for proper BigInt handling
        const countResult = await executeQuery(`SELECT COUNT(*) as count FROM ${tableName}`);
        const rowCount = countResult[0].count;
        
        // Get columns - using executeQuery for proper BigInt handling
        const columnsResult = await executeQuery(`PRAGMA table_info('${tableName}')`);
        const columns = columnsResult.map((col: any) => ({
          name: col.name,
          type: col.type,
        }));
        
        tablesData.push({
          name: tableName,
          rowCount,
          columns,
        });
      }
      
      setTables(tablesData);
    } catch (error) {
      console.error('Failed to refresh tables:', error);
    }
  }

  async function handleImportCSV(tableName: string, data: any[], columns: string[], opts?: { overwrite?: boolean }) {
    try {
      // If data is a File passed for large import
      if (data && data.length === 1 && data[0] instanceof File) {
        const file = data[0] as File;
        if (opts?.overwrite) {
          await executeQuery(`DROP TABLE IF EXISTS "${tableName.replace(/"/g, '""')}"`);
        }
        await importCSVFile(file, tableName, columns);
        await refreshTables();
        return;
      }
      
      // Protect table name
      const safeTable = String(tableName).replace(/"/g, '""');
      
      // Check if table already exists
      const existsRes = await executeQuery(`SELECT name FROM sqlite_master WHERE type='table' AND name='${safeTable}'`);
      if (existsRes && existsRes.length > 0) {
        if (opts?.overwrite) {
          await executeQuery(`DROP TABLE IF EXISTS "${safeTable}"`);
        } else {
          throw new Error(`Table '${tableName}' already exists. Please delete it first or choose a different name.`);
        }
      }
      
      // Sanitize column names - remove empty strings, invalid characters, and ensure uniqueness
      const sanitizedColumns = columns.map((col, idx) => {
        // Handle empty or whitespace-only column names
        let sanitized = col && col.trim() ? col.trim() : `column_${idx + 1}`;
        
        // Remove invalid characters and replace with underscore
        sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Ensure it doesn't start with a number
        if (/^\d/.test(sanitized)) {
          sanitized = 'col_' + sanitized;
        }
        
        return sanitized;
      });
      
      // Ensure unique column names
      const uniqueColumns = sanitizedColumns.map((col, idx) => {
        const duplicates = sanitizedColumns.slice(0, idx).filter(c => c === col);
        return duplicates.length > 0 ? `${col}_${duplicates.length + 1}` : col;
      });
      
      // Create column definitions with type inference
      const columnDefs = uniqueColumns.map((col, idx) => {
        // Infer type from first non-null value
        const originalCol = columns[idx];
        const firstValue = data.find(row => row[originalCol] !== null && row[originalCol] !== undefined)?.[originalCol];
        let type = 'VARCHAR';
        
        if (typeof firstValue === 'number') {
          type = Number.isInteger(firstValue) ? 'INTEGER' : 'DOUBLE';
        } else if (firstValue instanceof Date) {
          type = 'TIMESTAMP';
        }
        
        return `"${col}" ${type}`;
      }).join(', ');
      
      // Create table using executeQuery for consistent handling
      await executeQuery(`CREATE TABLE "${safeTable}" (${columnDefs})`);
      
      // Insert data in batches, mapping old column names to new ones
      const batchSize = 1000;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const values = batch.map(row => {
          const vals = columns.map((originalCol, idx) => {
            const val = row[originalCol];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return val;
          }).join(', ');
          return `(${vals})`;
        }).join(', ');
        
        await executeQuery(`INSERT INTO "${safeTable}" VALUES ${values}`);
      }
      
      // Refresh tables list
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
      console.error('Failed to delete table:', error);
      toast.error(`Failed to delete table: ${error?.message || 'Unknown error'}`);
    }
  }


  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Collapsible */}
      {leftSidebarOpen && (
        <DatabaseSidebar 
          tables={tables} 
          onTableClick={(name) => {
            // Add query to a new cell
            const newCell: QueryCell = {
              id: Date.now().toString(),
              query: `SELECT * FROM ${name};`,
              results: [],
              isExecuting: false
            };
            setCells(prev => [...prev, newCell]);
          }}
          onImportCSV={handleImportCSV}
          onRefresh={refreshTables}
          onDeleteTable={handleDeleteTable}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className="h-8 w-8"
            >
              {leftSidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeftOpen className="w-4 h-4" />
              )}
            </Button>
            <div className="text-xs text-muted-foreground">
              DuckDB Web Interface
            </div>
          </div>
          
          <div className="flex items-center gap-2">
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
                    // Add query to a new cell
                    const newCell: QueryCell = {
                      id: Date.now().toString(),
                      query: q,
                      results: [],
                      isExecuting: false
                    };
                    setCells(prev => [...prev, newCell]);
                    setHistoryOpen(false);
                    setTimeout(() => handleExecuteQuery(newCell.id), 100);
                  }}
                  onClearHistory={() => setQueryHistory([])}
                />
              </SheetContent>
            </Sheet>

            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
              className="h-8 w-8"
            >
              {rightSidebarOpen ? (
                <PanelRightClose className="w-4 h-4" />
              ) : (
                <PanelRightOpen className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Query and Results */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {cells.map((cell, index) => (
            <div key={cell.id} className="space-y-4">
              <QueryEditor
                query={cell.query}
                onQueryChange={(q) => handleUpdateCellQuery(cell.id, q)}
                onExecute={() => handleExecuteQuery(cell.id)}
                isExecuting={cell.isExecuting}
                onDelete={() => handleDeleteCell(cell.id)}
                showDelete={cells.length > 1}
              />

              {cell.results.length > 0 && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Showing {Math.min(cell.results.length, 50)} of {cell.results.length.toLocaleString()} rows
                    </div>
                  </div>
                  
                  <Tabs defaultValue="table" className="w-full">
                    <TabsList className="mb-3">
                      <TabsTrigger value="table">Table</TabsTrigger>
                      <TabsTrigger value="quick-chart">Quick Chart</TabsTrigger>
                      <TabsTrigger value="chart-builder">Chart Builder</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="table">
                      <ResultsTable data={cell.results} onColumnClick={setSelectedColumn} />
                    </TabsContent>
                    
                    <TabsContent value="quick-chart">
                      <DataVisualization data={cell.results} selectedColumn={selectedColumn} />
                    </TabsContent>
                    
                    <TabsContent value="chart-builder">
                      <ChartBuilder data={cell.results} />
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </div>
          ))}

          {/* Add Cell Button */}
          <Button
            onClick={handleAddCell}
            variant="outline"
            className="w-full border-dashed"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Query Cell
          </Button>
        </div>
      </div>

      {/* Right Diagnostics Panel - Collapsible */}
      {rightSidebarOpen && (
        <ColumnDiagnostics 
          data={cells.flatMap(c => c.results)} 
          selectedColumn={selectedColumn}
          onColumnSelect={setSelectedColumn}
        />
      )}

      {/* AI Chat Assistant */}
      <AIChatAssistant 
        tables={tables}
        onQuerySelect={(query) => {
          // Add query to a new cell
          const newCell: QueryCell = {
            id: Date.now().toString(),
            query,
            results: [],
            isExecuting: false
          };
          setCells(prev => [...prev, newCell]);
          toast.success('Query loaded from AI assistant');
        }}
      />
    </div>
  );
};

export default Index;
