import { useState, useEffect } from 'react';
import { DatabaseSidebar } from '@/components/DatabaseSidebar';
import { QueryEditor } from '@/components/QueryEditor';
import { ResultsTable } from '@/components/ResultsTable';
import { ColumnDiagnostics } from '@/components/ColumnDiagnostics';
import { initDuckDB, executeQuery } from '@/lib/duckdb';
import { generateTrainData, initialQuery } from '@/lib/sampleData';
import { toast } from 'sonner';

const Index = () => {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<any[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string>();

  useEffect(() => {
    initializeDatabase();
  }, []);

  async function initializeDatabase() {
    try {
      toast.loading('Initializing DuckDB...', { id: 'init' });
      
      const { conn } = await initDuckDB();
      
      // Generate and insert sample data
      const trainData = generateTrainData(10000);
      
      // Create table
      await conn.query(`
        CREATE TABLE trains (
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

      // Insert data in batches
      const batchSize = 1000;
      for (let i = 0; i < trainData.length; i += batchSize) {
        const batch = trainData.slice(i, i + batchSize);
        const values = batch.map(row => 
          `(${row.service_id}, '${row.date}', '${row.type}', ${row.train_number}, '${row.station_code}', '${row.station_name}', ${row.departure_time ? `'${row.departure_time}'` : 'NULL'}, ${row.arrival_time ? `'${row.arrival_time}'` : 'NULL'})`
        ).join(',');
        
        await conn.query(`INSERT INTO trains VALUES ${values}`);
      }

      toast.success('Database initialized with 10k sample records', { id: 'init' });
      setIsInitialized(true);
      
      // Auto-execute initial query
      handleExecuteQuery();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      toast.error('Failed to initialize database', { id: 'init' });
    }
  }

  async function handleExecuteQuery() {
    if (!isInitialized) {
      toast.error('Database is still initializing...');
      return;
    }

    setIsExecuting(true);
    try {
      const result = await executeQuery(query);
      setResults(result);
      
      // Auto-select first column with categorical data
      if (result.length > 0) {
        const columns = Object.keys(result[0]);
        const categoricalCol = columns.find(col => {
          const value = result[0][col];
          return typeof value === 'string' && !value.includes(':') && !value.includes('-');
        });
        setSelectedColumn(categoricalCol || columns[0]);
      }
      
      toast.success(`Query executed: ${result.length} rows returned`);
    } catch (error: any) {
      console.error('Query error:', error);
      toast.error(error.message || 'Query execution failed');
    } finally {
      setIsExecuting(false);
    }
  }

  const tables = [
    {
      name: 'trains',
      rowCount: 10000,
      columns: [
        { name: 'service_id', type: 'INTEGER', uniqueCount: 2000 },
        { name: 'date', type: 'DATE' },
        { name: 'type', type: 'VARCHAR', uniqueCount: 17 },
        { name: 'train_number', type: 'INTEGER' },
        { name: 'station_code', type: 'VARCHAR', uniqueCount: 573 },
        { name: 'station_name', type: 'VARCHAR', uniqueCount: 657 },
        { name: 'departure_time', type: 'TIMESTAMP', completeness: 11 },
        { name: 'arrival_time', type: 'TIMESTAMP', completeness: 11 },
      ],
    },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar */}
      <DatabaseSidebar tables={tables} onTableClick={(name) => setQuery(`SELECT * FROM ${name};`)} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="h-12 border-b border-border flex items-center justify-end px-4 bg-card">
          <div className="text-xs text-muted-foreground">
            DuckDB Web Interface
          </div>
        </div>

        {/* Query and Results */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <QueryEditor
            query={query}
            onQueryChange={setQuery}
            onExecute={handleExecuteQuery}
            isExecuting={isExecuting}
          />

          {results.length > 0 && (
            <>
              <div className="text-xs font-medium text-muted-foreground">Query results</div>
              <ResultsTable data={results} onColumnClick={setSelectedColumn} />
            </>
          )}
        </div>
      </div>

      {/* Right Diagnostics Panel */}
      <ColumnDiagnostics data={results} selectedColumn={selectedColumn} />
    </div>
  );
};

export default Index;
