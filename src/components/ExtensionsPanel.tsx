import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Puzzle, Download, CheckCircle2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { isBackendMode, backendListExtensions, backendManageExtension, executeQuery } from '@/lib/duckdb';

interface Extension {
  name: string;
  loaded: boolean;
  installed: boolean;
  description?: string;
}

const KNOWN_EXTENSIONS: Record<string, string> = {
  httpfs: 'HTTP/S3 file system access',
  json: 'JSON file reading and writing',
  parquet: 'Parquet file support',
  excel: 'Excel file reading',
  fts: 'Full-text search',
  mysql: 'MySQL database scanner',
  postgres: 'PostgreSQL database scanner',
  sqlite: 'SQLite database scanner',
  spatial: 'Spatial/GIS functions',
  icu: 'International Components for Unicode',
  autocomplete: 'SQL autocomplete',
  tpch: 'TPC-H benchmark data generator',
  tpcds: 'TPC-DS benchmark data generator',
  inet: 'IP address functions',
  substrait: 'Substrait integration',
};

export function ExtensionsPanel() {
  const [open, setOpen] = useState(false);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const backend = isBackendMode();

  const loadExtensions = async () => {
    setLoading(true);
    try {
      if (backend) {
        const exts = await backendListExtensions();
        setExtensions(exts.map((e: any) => ({
          ...e,
          description: KNOWN_EXTENSIONS[e.name] || ''
        })));
      } else {
        // WASM mode - limited extensions
        try {
          const result = await executeQuery("SELECT extension_name, loaded, installed FROM duckdb_extensions()");
          setExtensions(result.map((r: any) => ({
            name: r.extension_name,
            loaded: r.loaded,
            installed: r.installed,
            description: KNOWN_EXTENSIONS[r.extension_name] || ''
          })));
        } catch {
          // Fallback - show known extensions
          setExtensions(Object.entries(KNOWN_EXTENSIONS).map(([name, desc]) => ({
            name, loaded: false, installed: false, description: desc
          })));
        }
      }
    } catch (err: any) {
      toast.error(`Failed to load extensions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadExtensions();
  }, [open]);

  const handleInstall = async (name: string) => {
    setInstalling(name);
    try {
      if (backend) {
        await backendManageExtension(name);
      } else {
        await executeQuery(`INSTALL '${name}'; LOAD '${name}';`);
      }
      toast.success(`Extension '${name}' installed and loaded`);
      await loadExtensions();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setInstalling(null);
    }
  };

  const filtered = extensions.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
        title="DuckDB Extensions"
      >
        <Puzzle className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Puzzle className="w-5 h-5" />
              DuckDB Extensions
              <Badge variant={backend ? 'default' : 'secondary'} className="text-xs">
                {backend ? 'Backend (Full)' : 'WASM (Limited)'}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search extensions..."
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading extensions...</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No extensions found</p>
              ) : (
                filtered.map(ext => (
                  <div key={ext.name} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ext.name}</span>
                        {ext.loaded && (
                          <Badge variant="default" className="text-[10px] h-4 px-1">Loaded</Badge>
                        )}
                        {ext.installed && !ext.loaded && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">Installed</Badge>
                        )}
                      </div>
                      {ext.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{ext.description}</p>
                      )}
                    </div>
                    {!ext.loaded && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs ml-2"
                        disabled={installing === ext.name}
                        onClick={() => handleInstall(ext.name)}
                      >
                        {installing === ext.name ? '...' : <><Download className="w-3 h-3 mr-1" />Install</>}
                      </Button>
                    )}
                    {ext.loaded && (
                      <CheckCircle2 className="w-4 h-4 text-green-500 ml-2 shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {!backend && (
            <p className="text-xs text-muted-foreground text-center">
              Some extensions (mysql, postgres) require the backend service. Run the FastAPI backend for full support.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
