import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Database, Upload, Link2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { getConnection, executeQuery } from '@/lib/duckdb';

interface DatabaseConnectorProps {
  onImportComplete?: () => void;
}

type ConnectionType = 'mysql' | 'postgresql' | 'duckdb-file' | 'sqlite';

interface ConnectionConfig {
  type: ConnectionType;
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  file?: File;
}

export function DatabaseConnector({ onImportComplete }: DatabaseConnectorProps) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionType, setConnectionType] = useState<ConnectionType>('duckdb-file');
  const [config, setConfig] = useState<ConnectionConfig>({
    type: 'duckdb-file',
    host: 'localhost',
    port: '3306',
    database: '',
    username: '',
    password: '',
  });
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [connectionStep, setConnectionStep] = useState<'config' | 'select' | 'importing'>('config');

  // Sample database connections for testing
  const sampleConnections = {
    mysql: {
      name: 'Sample MySQL (Chinook)',
      host: 'mysql-rfam-public.ebi.ac.uk',
      port: '4497',
      database: 'Rfam',
      username: 'rfamro',
      password: '',
      note: 'Public Rfam database from EBI'
    },
    postgresql: {
      name: 'Sample PostgreSQL',
      host: 'demo.enterprisedb.com',
      port: '5432',
      database: 'postgres',
      username: 'enterprisedb',
      password: 'PostgreSQL123',
      note: 'EnterpriseDB demo database (may have limited access)'
    }
  };

  const loadSampleConnection = (type: 'mysql' | 'postgresql') => {
    const sample = sampleConnections[type];
    setConfig({
      type,
      host: sample.host,
      port: sample.port,
      database: sample.database,
      username: sample.username,
      password: sample.password,
    });
    setConnectionType(type);
    toast.info(`Loaded ${sample.name}. Click Connect to test.`);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setConfig({ ...config, file });
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      if (connectionType === 'duckdb-file') {
        await handleDuckDBFileImport();
      } else {
        await handleRemoteDatabaseConnect();
      }
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDuckDBFileImport = async () => {
    if (!config.file) {
      toast.error('Please select a DuckDB file');
      return;
    }

    try {
      const conn = await getConnection();
      const db = await (await import('@/lib/duckdb')).getDatabase();
      const arrayBuffer = await config.file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const fileName = config.file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const dbPath = `/${fileName}`;
      
      // Register the file with DuckDB WASM
      await db.registerFileBuffer(dbPath, uint8Array);
      
      // Try to attach the database
      try {
        await executeQuery(`ATTACH '${dbPath}' AS attached_db`);
        
        // Get tables from the attached database
        const tables = await executeQuery(`
          SELECT table_name 
          FROM attached_db.information_schema.tables 
          WHERE table_schema = 'main'
        `);
        
        if (tables.length > 0) {
          setAvailableTables(tables.map(t => t.table_name));
          setConnectionStep('select');
          toast.success(`Found ${tables.length} table(s)! Select tables to import.`);
        } else {
          toast.error('No tables found in the database file');
        }
      } catch (error: any) {
        // If attach fails, try reading as SQLite
        try {
          await executeQuery(`INSTALL sqlite; LOAD sqlite;`);
          await executeQuery(`ATTACH '${dbPath}' AS attached_db (TYPE SQLITE)`);
          
          const tables = await executeQuery(`
            SELECT name as table_name 
            FROM attached_db.sqlite_master 
            WHERE type='table'
          `);
          
          if (tables.length > 0) {
            setAvailableTables(tables.map(t => t.table_name));
            setConnectionStep('select');
            toast.success(`Found ${tables.length} table(s)! Select tables to import.`);
          } else {
            toast.error('No tables found in the database file');
          }
        } catch (sqliteError: any) {
          toast.error(`Failed to read database: ${sqliteError.message}`);
          throw sqliteError;
        }
      }
    } catch (error: any) {
      toast.error(`File import failed: ${error.message}`);
      throw error;
    }
  };


  const handleRemoteDatabaseConnect = async () => {
    toast.info('Connecting to remote database...');
    
    try {
      if (connectionType === 'mysql' || connectionType === 'postgresql') {
        // Note: DuckDB WASM in browser doesn't support direct MySQL/PostgreSQL connections
        // This would require a backend proxy or using DuckDB's httpfs extension
        toast.error(
          'Direct database connections are not supported in the browser version. ' +
          'Please export your data as CSV/Parquet and upload it, or use the DuckDB file upload option.'
        );
        return;
      } else if (connectionType === 'sqlite') {
        toast.info('Use DuckDB file upload for SQLite databases');
      }
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
      throw error;
    }
  };

  const handleImportTables = async () => {
    if (selectedTables.length === 0) {
      toast.error('Please select at least one table to import');
      return;
    }

    setConnectionStep('importing');
    
    try {
      for (const table of selectedTables) {
        const sanitizedName = table.replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Import from attached database
        await executeQuery(`CREATE TABLE ${sanitizedName} AS SELECT * FROM attached_db.${table}`);
        toast.success(`Imported table: ${sanitizedName}`);
      }
      
      // Detach the database
      try {
        await executeQuery(`DETACH attached_db`);
      } catch (e) {
        // Ignore detach errors
      }
      
      toast.success(`Successfully imported ${selectedTables.length} table(s)!`);
      setOpen(false);
      if (onImportComplete) onImportComplete();
      
      // Reset state
      setConnectionStep('config');
      setSelectedTables([]);
      setAvailableTables([]);
    } catch (error: any) {
      toast.error(`Import failed: ${error.message}`);
      setConnectionStep('select');
    }
  };

  const resetConnection = () => {
    setConnectionStep('config');
    setSelectedTables([]);
    setAvailableTables([]);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
        title="Connect to Database"
      >
        <Link2 className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database Connector
            </DialogTitle>
          </DialogHeader>

          {connectionStep === 'config' && (
            <div className="space-y-4 py-4">
              <Tabs value={connectionType} onValueChange={(v) => setConnectionType(v as ConnectionType)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="duckdb-file">DuckDB File</TabsTrigger>
                  <TabsTrigger value="mysql">MySQL</TabsTrigger>
                  <TabsTrigger value="postgresql">PostgreSQL</TabsTrigger>
                </TabsList>

                <TabsContent value="duckdb-file" className="space-y-4">
                  <div>
                    <Label>Upload DuckDB or SQLite Database File</Label>
                    <Input
                      type="file"
                      accept=".db,.duckdb,.sqlite,.sqlite3"
                      onChange={handleFileSelect}
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Supported formats: .db, .duckdb, .sqlite, .sqlite3
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="mysql" className="space-y-4">
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Browser Limitation</p>
                        <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                          Direct MySQL connections are not supported in browser. Please export your data as CSV, Parquet, or DuckDB file and use the file upload option instead.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Host</Label>
                      <Input
                        value={config.host}
                        onChange={(e) => setConfig({ ...config, host: e.target.value })}
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <Label>Port</Label>
                      <Input
                        value={config.port}
                        onChange={(e) => setConfig({ ...config, port: e.target.value })}
                        placeholder="3306"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Database</Label>
                    <Input
                      value={config.database}
                      onChange={(e) => setConfig({ ...config, database: e.target.value })}
                      placeholder="database_name"
                    />
                  </div>
                  <div>
                    <Label>Username</Label>
                    <Input
                      value={config.username}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="root"
                    />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={config.password}
                      onChange={(e) => setConfig({ ...config, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        Note: Remote database connections require DuckDB extensions. Connection may be slow depending on your network and database size.
                      </p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="postgresql" className="space-y-4">
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Browser Limitation</p>
                        <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                          Direct PostgreSQL connections are not supported in browser. Please export your data as CSV, Parquet, or DuckDB file and use the file upload option instead.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Host</Label>
                      <Input
                        value={config.host}
                        onChange={(e) => setConfig({ ...config, host: e.target.value })}
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <Label>Port</Label>
                      <Input
                        value={config.port}
                        onChange={(e) => setConfig({ ...config, port: e.target.value })}
                        placeholder="5432"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Database</Label>
                    <Input
                      value={config.database}
                      onChange={(e) => setConfig({ ...config, database: e.target.value })}
                      placeholder="database_name"
                    />
                  </div>
                  <div>
                    <Label>Username</Label>
                    <Input
                      value={config.username}
                      onChange={(e) => setConfig({ ...config, username: e.target.value })}
                      placeholder="postgres"
                    />
                  </div>
                  <div>
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={config.password}
                      onChange={(e) => setConfig({ ...config, password: e.target.value })}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                    <div className="flex gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800 dark:text-amber-200">
                        Note: Remote database connections require DuckDB extensions. Connection may be slow depending on your network and database size.
                      </p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {connectionStep === 'select' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Select Tables to Import</h4>
                <Button variant="ghost" size="sm" onClick={resetConnection}>
                  Back
                </Button>
              </div>
              
              <div className="border rounded-lg divide-y max-h-96 overflow-auto">
                {availableTables.map((table) => (
                  <label
                    key={table}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTables.includes(table)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTables([...selectedTables, table]);
                        } else {
                          setSelectedTables(selectedTables.filter(t => t !== table));
                        }
                      }}
                      className="rounded border-border"
                    />
                    <span className="flex-1">{table}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{selectedTables.length} table(s) selected</span>
                {selectedTables.length > 0 && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setSelectedTables([])}
                  >
                    Clear selection
                  </Button>
                )}
              </div>
            </div>
          )}

          {connectionStep === 'importing' && (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Importing tables...</p>
            </div>
          )}

          <DialogFooter>
            {connectionStep === 'config' && (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Connecting...' : 'Connect'}
                </Button>
              </>
            )}
            {connectionStep === 'select' && (
              <Button 
                onClick={handleImportTables}
                disabled={selectedTables.length === 0}
              >
                Import {selectedTables.length} Table(s)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
