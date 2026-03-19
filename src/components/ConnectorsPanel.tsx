import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import { getBackendUrl, backendListConnections, backendSaveConnection, backendDeleteConnection } from '@/lib/duckdb';
import { Database, Cloud, Server, Globe, Trash2, Plus, TestTube, Webhook, HardDrive, Clock } from 'lucide-react';

interface ConnectorsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

interface ConnectorForm {
  name: string;
  type: string;
  host: string;
  port: string;
  database_name: string;
  username: string;
  password: string;
  // S3
  s3_endpoint: string;
  s3_access_key: string;
  s3_secret_key: string;
  s3_bucket: string;
  s3_region: string;
  // FTP
  path: string;
}

const emptyForm: ConnectorForm = {
  name: '', type: 'mysql', host: '', port: '', database_name: '',
  username: '', password: '', s3_endpoint: '', s3_access_key: '',
  s3_secret_key: '', s3_bucket: '', s3_region: 'us-east-1', path: '',
};

export function ConnectorsPanel({ open, onOpenChange, onImportComplete }: ConnectorsPanelProps) {
  const [connections, setConnections] = useState<any[]>([]);
  const [form, setForm] = useState<ConnectorForm>({ ...emptyForm });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [platformInfo, setPlatformInfo] = useState<any>(null);

  const backendUrl = getBackendUrl();

  useEffect(() => {
    if (open) {
      loadConnections();
      loadPlatformInfo();
    }
  }, [open]);

  async function loadPlatformInfo() {
    try {
      const res = await fetch(`${backendUrl}/api/health`);
      if (res.ok) setPlatformInfo(await res.json());
    } catch { /* ignore */ }
  }

  async function loadConnections() {
    try {
      const conns = await backendListConnections();
      setConnections(conns || []);
    } catch { /* ignore */ }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch(`${backendUrl}/api/connectors/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Connection successful!');
      } else {
        toast.error(data.detail || 'Connection failed');
      }
    } catch (err: any) {
      toast.error(`Test failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Enter a connector name'); return; }
    setSaving(true);
    try {
      await backendSaveConnection({
        name: form.name,
        type: form.type,
        host: form.host || undefined,
        port: form.port ? parseInt(form.port) : undefined,
        database_name: form.database_name || undefined,
        username: form.username || undefined,
        password: form.password || undefined,
        path: form.path || undefined,
        s3_endpoint: form.s3_endpoint || undefined,
        s3_access_key: form.s3_access_key || undefined,
        s3_secret_key: form.s3_secret_key || undefined,
        s3_bucket: form.s3_bucket || undefined,
        s3_region: form.s3_region || undefined,
      });
      toast.success('Connector saved');
      setForm({ ...emptyForm });
      loadConnections();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this connector?')) return;
    try {
      await backendDeleteConnection(id);
      toast.success('Deleted');
      loadConnections();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const connectorTypes = [
    { value: 'mysql', label: 'MySQL', icon: <Database className="w-3.5 h-3.5" /> },
    { value: 'postgresql', label: 'PostgreSQL', icon: <Database className="w-3.5 h-3.5" /> },
    { value: 's3', label: 'S3/MinIO', icon: <Cloud className="w-3.5 h-3.5" /> },
    { value: 'ftp', label: 'FTP/SFTP', icon: <Server className="w-3.5 h-3.5" /> },
    { value: 'webhook', label: 'Webhook', icon: <Webhook className="w-3.5 h-3.5" /> },
    { value: 'http', label: 'HTTP API', icon: <Globe className="w-3.5 h-3.5" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            Connectors
          </DialogTitle>
          <DialogDescription>
            Manage external data sources, storage, and orchestration connections.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manage" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manage" className="text-xs">Saved Connectors</TabsTrigger>
            <TabsTrigger value="new" className="text-xs">New Connector</TabsTrigger>
            <TabsTrigger value="platform" className="text-xs">Platform</TabsTrigger>
          </TabsList>

          <TabsContent value="manage" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-[400px]">
              {connections.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No connectors configured. Create one in the "New Connector" tab.
                </div>
              ) : (
                <div className="space-y-2 p-1">
                  {connections.map((conn: any) => (
                    <div key={conn.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{conn.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{conn.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {conn.host && `${conn.host}:${conn.port}`}
                          {conn.s3_endpoint && conn.s3_endpoint}
                          {conn.database_name && ` / ${conn.database_name}`}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDelete(conn.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="new" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 p-1">
                <div>
                  <Label className="text-xs">Connector Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My MySQL DB" className="mt-1" />
                </div>

                <div>
                  <Label className="text-xs">Type</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {connectorTypes.map((ct) => (
                      <Button
                        key={ct.value}
                        variant={form.type === ct.value ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-7 gap-1"
                        onClick={() => setForm({ ...form, type: ct.value })}
                      >
                        {ct.icon} {ct.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {(form.type === 'mysql' || form.type === 'postgresql') && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Host</Label>
                        <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="localhost" className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Port</Label>
                        <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder={form.type === 'mysql' ? '3306' : '5432'} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Database</Label>
                      <Input value={form.database_name} onChange={(e) => setForm({ ...form, database_name: e.target.value })} className="mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Username</Label>
                        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Password</Label>
                        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" />
                      </div>
                    </div>
                  </>
                )}

                {form.type === 's3' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Endpoint</Label>
                        <Input value={form.s3_endpoint} onChange={(e) => setForm({ ...form, s3_endpoint: e.target.value })} placeholder="minio:9000" className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Region</Label>
                        <Input value={form.s3_region} onChange={(e) => setForm({ ...form, s3_region: e.target.value })} className="mt-1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Access Key</Label>
                        <Input value={form.s3_access_key} onChange={(e) => setForm({ ...form, s3_access_key: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Secret Key</Label>
                        <Input type="password" value={form.s3_secret_key} onChange={(e) => setForm({ ...form, s3_secret_key: e.target.value })} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Bucket</Label>
                      <Input value={form.s3_bucket} onChange={(e) => setForm({ ...form, s3_bucket: e.target.value })} placeholder="duckdb-data" className="mt-1" />
                    </div>
                  </>
                )}

                {form.type === 'ftp' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Host</Label>
                        <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="ftp.example.com" className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Port</Label>
                        <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="21" className="mt-1" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Username</Label>
                        <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1" />
                      </div>
                      <div>
                        <Label className="text-xs">Password</Label>
                        <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Remote Path</Label>
                      <Input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/data/" className="mt-1" />
                    </div>
                  </>
                )}

                {(form.type === 'webhook' || form.type === 'http') && (
                  <div>
                    <Label className="text-xs">URL / Endpoint</Label>
                    <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="https://api.example.com/data" className="mt-1" />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                    <TestTube className="w-3 h-3 mr-1" /> {testing ? 'Testing...' : 'Test'}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Plus className="w-3 h-3 mr-1" /> {saving ? 'Saving...' : 'Save Connector'}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="platform" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 p-1">
                {/* Storage Configuration */}
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4" />
                    <span className="text-sm font-medium">Storage (S3/MinIO)</span>
                    <Badge variant={platformInfo?.minio_configured ? 'default' : 'secondary'} className="text-[10px]">
                      {platformInfo?.minio_configured ? 'Connected' : 'Not configured'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configure via <code className="bg-muted px-1 rounded">MINIO_ENDPOINT</code> env var in docker-compose.
                    Users can bring their own S3-compatible storage — no data stays on the platform.
                  </p>
                </div>

                {/* Temporal Configuration */}
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium">Workflow Engine (Temporal)</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {platformInfo?.temporal_host || 'temporal:7233'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Configure via <code className="bg-muted px-1 rounded">TEMPORAL_HOST</code> and <code className="bg-muted px-1 rounded">TEMPORAL_NAMESPACE</code> env vars.
                    Connect your own Temporal cluster for workflow orchestration.
                  </p>
                </div>

                {/* Privacy Mode */}
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    <span className="text-sm font-medium">Privacy Mode</span>
                    <Badge variant={platformInfo?.privacy_mode ? 'destructive' : 'secondary'} className="text-[10px]">
                      {platformInfo?.privacy_mode ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    When enabled via <code className="bg-muted px-1 rounded">PRIVACY_MODE=true</code>, DuckDB runs in-memory only.
                    No data is persisted — all operations pass through without storage.
                  </p>
                </div>

                {/* Platform Info */}
                {platformInfo && (
                  <div className="border rounded-lg p-4 space-y-2">
                    <span className="text-sm font-medium">Backend Info</span>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>DuckDB Version</span>
                        <span className="font-mono">{platformInfo.version}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Engine</span>
                        <span className="font-mono">{platformInfo.engine}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
