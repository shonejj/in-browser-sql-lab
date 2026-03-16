import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Cloud, FolderOpen, Upload, Download, FileText, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { 
  isBackendMode, backendConfigureS3, backendListS3, 
  backendImportFromS3, backendExportToS3 
} from '@/lib/duckdb';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

interface S3ConnectorProps {
  onImportComplete?: () => void;
}

export function S3Connector({ onImportComplete }: S3ConnectorProps) {
  const [open, setOpen] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [s3Config, setS3Config] = useState({
    endpoint: 'minio:9000',
    access_key: 'minioadmin',
    secret_key: 'minioadmin123',
    region: 'us-east-1',
    use_ssl: false,
    url_style: 'path',
  });
  const [bucket, setBucket] = useState('duckdb-data');
  const [prefix, setPrefix] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [tableName, setTableName] = useState('');

  // Export state
  const [exportQuery, setExportQuery] = useState('');
  const [exportKey, setExportKey] = useState('');

  if (!isBackendMode()) return null;

  const handleConfigure = async () => {
    setConfiguring(true);
    try {
      await backendConfigureS3(s3Config);
      setConfigured(true);
      toast.success('S3/MinIO configured');
      handleListFiles();
    } catch (err: any) {
      toast.error(`Configuration failed: ${err.message}`);
    } finally {
      setConfiguring(false);
    }
  };

  const handleListFiles = async () => {
    setLoading(true);
    try {
      const result = await backendListS3(bucket, prefix);
      setFiles(result.files || []);
    } catch (err: any) {
      toast.error(`Failed to list files: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !tableName.trim()) {
      toast.error('Select a file and enter a table name');
      return;
    }
    try {
      const key = selectedFile.replace(`s3://${bucket}/`, '');
      const result = await backendImportFromS3(bucket, key, tableName, true);
      toast.success(result.message);
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    }
  };

  const handleExport = async () => {
    if (!exportKey.trim()) {
      toast.error('Enter an export file path');
      return;
    }
    try {
      const result = await backendExportToS3(bucket, exportKey, exportQuery || undefined);
      toast.success(result.message);
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`);
    }
  };

  const getFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  const getFileExt = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return ext;
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
        title="S3 / MinIO"
      >
        <Cloud className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              S3 / MinIO Connector
              <Badge variant="default" className="text-[10px] h-4 px-1.5 ml-2">Server Mode</Badge>
            </DialogTitle>
          </DialogHeader>

          {!configured ? (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Configure your S3/MinIO connection. Default values are set for the Docker Compose MinIO instance.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Endpoint</Label>
                  <Input
                    value={s3Config.endpoint}
                    onChange={(e) => setS3Config({ ...s3Config, endpoint: e.target.value })}
                    placeholder="minio:9000"
                  />
                </div>
                <div>
                  <Label>Region</Label>
                  <Input
                    value={s3Config.region}
                    onChange={(e) => setS3Config({ ...s3Config, region: e.target.value })}
                    placeholder="us-east-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Access Key</Label>
                  <Input
                    value={s3Config.access_key}
                    onChange={(e) => setS3Config({ ...s3Config, access_key: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={s3Config.secret_key}
                    onChange={(e) => setS3Config({ ...s3Config, secret_key: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={s3Config.use_ssl}
                    onChange={(e) => setS3Config({ ...s3Config, use_ssl: e.target.checked })}
                    className="rounded"
                  />
                  Use SSL
                </label>
                <label className="flex items-center gap-2 text-sm">
                  URL Style:
                  <select
                    value={s3Config.url_style}
                    onChange={(e) => setS3Config({ ...s3Config, url_style: e.target.value })}
                    className="border rounded px-2 py-1 text-xs bg-background"
                  >
                    <option value="path">Path</option>
                    <option value="vhost">Virtual Host</option>
                  </select>
                </label>
              </div>
              <Button onClick={handleConfigure} disabled={configuring} className="w-full">
                {configuring ? 'Configuring...' : 'Connect to S3/MinIO'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Browse files */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Browse Files</Label>
                <div className="flex gap-2">
                  <Input
                    value={bucket}
                    onChange={(e) => setBucket(e.target.value)}
                    placeholder="bucket-name"
                    className="flex-1"
                  />
                  <Input
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="prefix/ (optional)"
                    className="flex-1"
                  />
                  <Button variant="outline" size="icon" onClick={handleListFiles} disabled={loading}>
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {files.length > 0 && (
                  <ScrollArea className="h-48 border rounded-lg">
                    <div className="divide-y">
                      {files.map((file) => (
                        <button
                          key={file}
                          className={`flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 text-left ${
                            selectedFile === file ? 'bg-primary/10' : ''
                          }`}
                          onClick={() => {
                            setSelectedFile(file);
                            const name = getFileName(file).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
                            setTableName(name);
                          }}
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="flex-1 truncate">{getFileName(file)}</span>
                          <Badge variant="secondary" className="text-[9px] h-3.5 px-1">
                            {getFileExt(file)}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {files.length === 0 && configured && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No files found. Click refresh or check bucket name.
                  </p>
                )}
              </div>

              {/* Import */}
              {selectedFile && (
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <Label className="text-xs">Import to Table</Label>
                  <div className="flex gap-2">
                    <Input
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      placeholder="table_name"
                      className="flex-1"
                    />
                    <Button onClick={handleImport} size="sm">
                      <Upload className="w-3 h-3 mr-1" /> Import
                    </Button>
                  </div>
                </div>
              )}

              {/* Export */}
              <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <Label className="text-xs">Export to S3</Label>
                <Input
                  value={exportKey}
                  onChange={(e) => setExportKey(e.target.value)}
                  placeholder="export/data.parquet"
                  className="text-xs"
                />
                <Input
                  value={exportQuery}
                  onChange={(e) => setExportQuery(e.target.value)}
                  placeholder="SELECT * FROM my_table (optional, exports full DB if empty)"
                  className="text-xs"
                />
                <Button onClick={handleExport} size="sm" variant="outline">
                  <Download className="w-3 h-3 mr-1" /> Export
                </Button>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setConfigured(false)} className="text-xs">
                Reconfigure S3
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
