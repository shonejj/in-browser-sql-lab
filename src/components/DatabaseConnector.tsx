import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Database, Link2, AlertCircle, Cloud, HardDrive, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { 
  getConnection, executeQuery, isBackendMode, backendAttachDatabase,
  backendListConnections, backendSaveConnection, backendDeleteConnection
} from '@/lib/duckdb';
import { Badge } from './ui/badge';

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

interface SavedConnection {
  id: string;
  name: string;
  type: string;
  host?: string;
  port?: number;
  database_name?: string;
  username?: string;
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
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>([]);
  const [connectionName, setConnectionName] = useState('');

  const backend = isBackendMode();

  // Load saved connections when dialog opens in backend mode
  useEffect(() => {
    if (open && backend) {
      loadSavedConnections();
    }
  }, [open, backend]);

  async function loadSavedConnections() {
    try {
      const conns = await backendListConnections();
      setSavedConnections(conns || []);
    } catch {
      // ignore
    }
  }

  // Docker compose defaults
  const quickConnections = [
    {
      label: 'Docker MySQL (sampledb)',
      type: 'mysql' as ConnectionType,
      host: 'mysql',
      port: '3306',
      database: 'sampledb',
      username: 'duckdb',
      password: 'duckdblab',
    },
  ];

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
      
      await db.registerFileBuffer(dbPath, uint8Array);
      
      try {
        await executeQuery(`ATTACH '${dbPath}' AS attached_db`);
        const tables = await executeQuery(`
          SELECT table_name 
          FROM attached_db.information_schema.tables 
          WHERE table_schema = 'main'
        `);
        
        if (tables.length > 0) {
          setAvailableTables(tables.map(t => t.table_name));
          setConnectionStep('select');
          toast.success(`Found ${tables.length} table(s)!`);
        } else {
          toast.error('No tables found in the database file');
        }
      } catch {
        try {
          await executeQuery(`INSTALL sqlite; LOAD sqlite;`);
          await executeQuery(`ATTACH '${dbPath}' AS attached_db (TYPE SQLITE)`);
          const tables = await executeQuery(`
            SELECT name as table_name FROM attached_db.sqlite_master WHERE type='table'
          `);
          if (tables.length > 0) {
            setAvailableTables(tables.map(t => t.table_name));
            setConnectionStep('select');
            toast.success(`Found ${tables.length} table(s)!`);
          } else {
            toast.error('No tables found');
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
    if (backend) {
      toast.info('Connecting via backend...');
      try {
        const result = await backendAttachDatabase({
          type: connectionType,
          host: config.host,
          port: config.port ? parseInt(config.port) : undefined,
          database: config.database,
          username: config.username,
          password: config.password,
        });
        toast.success(result.message);

        const alias = result.alias;
        const tables = await executeQuery(
          `SELECT table_name FROM ${alias}.information_schema.tables WHERE table_schema = 'main' OR table_schema = 'public'`
        );
        if (tables.length > 0) {
          setAvailableTables(tables.map((t: any) => t.table_name));
          setConnectionStep('select');
        } else {
          toast.warning('Connected but no tables found');
        }
      } catch (err: any) {
        toast.error(`Connection failed: ${err.message}`);
      }
      return;
    }

    toast.error(
      'Direct database connections require the backend service. ' +
      'Start the Docker stack (docker-compose up) or switch to Server mode.'
    );
  };

  const handleImportTables = async () => {
    if (selectedTables.length === 0) {
      toast.error('Please select at least one table');
      return;
    }

    setConnectionStep('importing');
    
    try {
      for (const table of selectedTables) {
        const sanitizedName = table.replace(/[^a-zA-Z0-9_]/g, '_');
        await executeQuery(`CREATE TABLE ${sanitizedName} AS SELECT * FROM attached_db.${table}`);
        toast.success(`Imported table: ${sanitizedName}`);
      }
      
      try { await executeQuery(`DETACH attached_db`); } catch {}
      
      toast.success(`Imported ${selectedTables.length} table(s)!`);
      setOpen(false);
      if (onImportComplete) onImportComplete();
      resetConnection();
    } catch (error: any) {
      toast.error(`Import failed: ${error.message}`);
      setConnectionStep('select');
    }
  };

  const handleSaveConnection = async () => {
    if (!connectionName.trim()) {
      toast.error('Please enter a connection name');
      return;
    }
    try {
      await backendSaveConnection({
        name: connectionName,
        type: connectionType,
        host: config.host,
        port: config.port ? parseInt(config.port) : undefined,
        database_name: config.database,
        username: config.username,
        password: config.password,
      });
      toast.success('Connection saved');
      setConnectionName('');
      loadSavedConnections();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteSavedConnection = async (id: string) => {
    try {
      await backendDeleteConnection(id);
      toast.success('Connection deleted');
      loadSavedConnections();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLoadSavedConnection = (conn: SavedConnection) => {
    setConnectionType(conn.type as ConnectionType);
    setConfig({
      type: conn.type as ConnectionType,
      host: conn.host || 'localhost',
      port: conn.port?.toString() || '3306',
      database: conn.database_name || '',
      username: conn.username || '',
      password: '',
    });
    toast.info(`Loaded connection: ${conn.name}`);
  };

  const resetConnection = () => {
    setConnectionStep('config');
    setSelectedTables([]);
    setAvailableTables([]);
    setConnectionName('');
  };

  const applyQuickConnection = (qc: typeof quickConnections[0]) => {
    setConnectionType(qc.type);
    setConfig({
      type: qc.type,
      host: qc.host,
      port: qc.port,
      database: qc.database,
      username: qc.username,
      password: qc.password,
    });
    toast.info(`Loaded: ${qc.label}`);
  };

  const renderConnectionForm = (type: 'mysql' | 'postgresql') => {
    const defaultPort = type === 'mysql' ? '3306' : '5432';
    return (
      <div className="space-y-4">
        {!backend && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100">WASM Mode</p>
                <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                  Direct {type === 'mysql' ? 'MySQL' : 'PostgreSQL'} connections require Server mode. 
                  Switch to Server mode or export data as CSV/Parquet.
                </p>
              </div>
            </div>
          </div>
        )}
        {backend && (
          <div className="flex flex-wrap gap-1.5">
            {quickConnections
              .filter(qc => qc.type === type)
              .map(qc => (
                <Button 
                  key={qc.label} 
                  variant="outline" 
                  size="sm" 
                  className="text-xs h-7"
                  onClick={() => applyQuickConnection(qc)}
                >
                  <HardDrive className="w-3 h-3 mr-1" /> {qc.label}
                </Button>
              ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Host</Label>
            <Input value={config.host} onChange={(e) => setConfig({ ...config, host: e.target.value })} placeholder="localhost" />
          </div>
          <div>
            <Label>Port</Label>
            <Input value={config.port} onChange={(e) => setConfig({ ...config, port: e.target.value })} placeholder={defaultPort} />
          </div>
        </div>
        <div>
          <Label>Database</Label>
          <Input value={config.database} onChange={(e) => setConfig({ ...config, database: e.target.value })} placeholder="database_name" />
        </div>
        <div>
          <Label>Username</Label>
          <Input value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} placeholder={type === 'mysql' ? 'root' : 'postgres'} />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" value={config.password} onChange={(e) => setConfig({ ...config, password: e.target.value })} placeholder="••••••••" />
        </div>
        {backend && (
          <div className="flex items-center gap-2">
            <Input
              value={connectionName}
              onChange={(e) => setConnectionName(e.target.value)}
              placeholder="Save as..."
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleSaveConnection} disabled={!connectionName.trim()}>
              Save
            </Button>
          </div>
        )}
      </div>
    );
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database Connector
              <Badge variant={backend ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5 ml-2">
                {backend ? 'Server' : 'WASM'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          {connectionStep === 'config' && (
            <div className="space-y-4 py-2">
              {/* Saved connections */}
              {backend && savedConnections.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Saved Connections</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {savedConnections.map(sc => (
                      <div key={sc.id} className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleLoadSavedConnection(sc)}
                        >
                          <Cloud className="w-3 h-3 mr-1" />
                          {sc.name}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleDeleteSavedConnection(sc.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Tabs value={connectionType} onValueChange={(v) => setConnectionType(v as ConnectionType)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="duckdb-file">DuckDB File</TabsTrigger>
                  <TabsTrigger value="mysql">MySQL</TabsTrigger>
                  <TabsTrigger value="postgresql">PostgreSQL</TabsTrigger>
                </TabsList>

                <TabsContent value="duckdb-file" className="space-y-4">
                  <div>
                    <Label>Upload DuckDB or SQLite Database File</Label>
                    <Input type="file" accept=".db,.duckdb,.sqlite,.sqlite3" onChange={handleFileSelect} className="mt-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Supported: .db, .duckdb, .sqlite, .sqlite3
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="mysql">{renderConnectionForm('mysql')}</TabsContent>
                <TabsContent value="postgresql">{renderConnectionForm('postgresql')}</TabsContent>
              </Tabs>
            </div>
          )}

          {connectionStep === 'select' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Select Tables to Import</h4>
                <Button variant="ghost" size="sm" onClick={resetConnection}>Back</Button>
              </div>
              <div className="border rounded-lg divide-y max-h-96 overflow-auto">
                {availableTables.map((table) => (
                  <label key={table} className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer">
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
                  <Button variant="link" size="sm" onClick={() => setSelectedTables([])}>Clear</Button>
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
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleConnect} disabled={connecting}>
                  {connecting ? 'Connecting...' : 'Connect'}
                </Button>
              </>
            )}
            {connectionStep === 'select' && (
              <Button onClick={handleImportTables} disabled={selectedTables.length === 0}>
                Import {selectedTables.length} Table(s)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
