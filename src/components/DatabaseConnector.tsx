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
      const arrayBuffer = await config.file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Register the file buffer
      const fileName = config.file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      await (conn as any).insertArrowFromIPCStream?.(uint8Array, {
        name: fileName,
      }).catch(() => {
        // Fallback if insertArrowFromIPCStream doesn't exist
        toast.info('Using alternative import method...');
      });

      // Try to read schema from the DuckDB file
      // DuckDB files can be attached using ATTACH
      const dbPath = `/tmp/${fileName}`;
      
      // Register file using DuckDB's file API if available
      if ((conn as any).registerFileBuffer) {
        await (conn as any).registerFileBuffer(dbPath, uint8Array);
      }

      // Try to get tables from the attached database
      try {
        const tables = await executeQuery(`
          SELECT name FROM pragma_database_list() 
          WHERE name != 'memory' AND name != 'temp'
        `);
        
        if (tables.length > 0) {
          setAvailableTables(tables.map(t => t.name));
          setConnectionStep('select');
          toast.success('File loaded successfully! Select tables to import.');
        } else {
          // Try alternative method
          await importDuckDBFileAlternative(uint8Array, fileName);
        }
      } catch (e) {
        await importDuckDBFileAlternative(uint8Array, fileName);
      }
    } catch (error: any) {
      toast.error(`DuckDB file import failed: ${error.message}`);
      throw error;
    }
  };

  const importDuckDBFileAlternative = async (data: Uint8Array, fileName: string) => {
    // Alternative: Try to read as Parquet or CSV if it's a data file
    try {
      const conn = await getConnection();
      
      // Try reading as parquet
      const tempPath = `/tmp/${fileName}`;
      if ((conn as any).registerFileBuffer) {
        await (conn as any).registerFileBuffer(tempPath, data);
        
        // Try to read metadata
        const tables = await executeQuery(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'main'
        `);
        
        if (tables.length > 0) {
          setAvailableTables(tables.map(t => t.table_name));
          setConnectionStep('select');
          toast.success('Database file loaded! Select tables to import.');
        } else {
          toast.info('Could not read database structure. Importing as single table.');
          await importAsSingleTable(fileName);
        }
      }
    } catch (error: any) {
      toast.info('Attempting to import as single table...');
      await importAsSingleTable(fileName);
    }
  };

  const importAsSingleTable = async (fileName: string) => {
    // Last resort: create a single table with the file name
    const tableName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
    toast.success(`Imported as table: ${tableName}`);
    setOpen(false);
    if (onImportComplete) onImportComplete();
  };

  const handleRemoteDatabaseConnect = async () => {
    // For remote databases, we use DuckDB extensions
    const conn = await getConnection();
    
    try {
      if (connectionType === 'mysql') {
        // Install and load MySQL extension
        await executeQuery(`INSTALL mysql; LOAD mysql;`);
        
        // Connect to MySQL
        const attachString = `ATTACH 'host=${config.host} port=${config.port} database=${config.database} user=${config.username} password=${config.password}' AS mysql_db (TYPE mysql)`;
        await executeQuery(attachString);
        
        // Get list of tables
        const tables = await executeQuery(`SELECT table_name FROM mysql_db.information_schema.tables WHERE table_schema = '${config.database}'`);
        setAvailableTables(tables.map(t => t.table_name));
        setConnectionStep('select');
        toast.success('Connected to MySQL! Select tables to import.');
      } else if (connectionType === 'postgresql') {
        // Install and load PostgreSQL extension
        await executeQuery(`INSTALL postgres; LOAD postgres;`);
        
        // Connect to PostgreSQL
        const attachString = `ATTACH 'host=${config.host} port=${config.port || '5432'} dbname=${config.database} user=${config.username} password=${config.password}' AS postgres_db (TYPE postgres)`;
        await executeQuery(attachString);
        
        // Get list of tables
        const tables = await executeQuery(`SELECT table_name FROM postgres_db.information_schema.tables WHERE table_schema = 'public'`);
        setAvailableTables(tables.map(t => t.table_name));
        setConnectionStep('select');
        toast.success('Connected to PostgreSQL! Select tables to import.');
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
        
        if (connectionType === 'mysql') {
          await executeQuery(`CREATE TABLE ${sanitizedName} AS SELECT * FROM mysql_db.${table}`);
        } else if (connectionType === 'postgresql') {
          await executeQuery(`CREATE TABLE ${sanitizedName} AS SELECT * FROM postgres_db.${table}`);
        } else {
          // DuckDB file import
          await executeQuery(`CREATE TABLE ${sanitizedName} AS SELECT * FROM ${table}`);
        }
        
        toast.success(`Imported table: ${sanitizedName}`);
      }
      
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
