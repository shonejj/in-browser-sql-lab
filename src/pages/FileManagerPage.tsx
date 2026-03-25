import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/duckdb';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  FolderOpen, File, Upload, Trash2, FolderPlus,
  RefreshCw, Copy, Home, ArrowUp, Database,
  ArrowLeft, Search
} from 'lucide-react';

interface FileItem {
  name: string;
  key: string;
  size: number;
  is_folder: boolean;
  last_modified?: string;
}

export function FileManagerPage() {
  const navigate = useNavigate();
  const [bucket, setBucket] = useState('duckdb-data');
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tableName, setTableName] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importingFile, setImportingFile] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const backendUrl = getBackendUrl();

  const loadFiles = useCallback(async (path?: string) => {
    const p = path ?? currentPath;
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/files/list`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, prefix: p }),
      });
      if (!res.ok) throw new Error('Failed to list files');
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [backendUrl, bucket, currentPath]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const navigateTo = (path: string) => { setCurrentPath(path); loadFiles(path); };
  const navigateUp = () => { const parts = currentPath.split('/').filter(Boolean); parts.pop(); navigateTo(parts.length ? parts.join('/') + '/' : ''); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    let successCount = 0;
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', bucket);
      formData.append('key', currentPath + file.name);
      try {
        const res = await fetch(`${backendUrl}/api/files/upload`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        successCount++;
      } catch (err: any) { toast.error(`Upload failed: ${file.name} - ${err.message}`); }
    }
    if (successCount > 0) { toast.success(`Uploaded ${successCount} file(s)`); loadFiles(); }
    e.target.value = '';
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`${backendUrl}/api/files/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, key: deleteTarget }),
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Deleted');
      loadFiles();
    } catch (err: any) { toast.error(err.message); }
    finally { setDeleteTarget(null); }
  };

  const handleImport = async (file: FileItem) => {
    if (!tableName.trim()) { toast.error('Enter a table name'); return; }
    setImportingFile(file.key);
    try {
      const res = await fetch(`${backendUrl}/api/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3_path: `s3://${bucket}/${file.key}`, table_name: tableName }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Import failed'); }
      const result = await res.json();
      toast.success(result.message);
      setShowImportDialog(false);
      setTableName('');
    } catch (err: any) { toast.error(err.message); }
    finally { setImportingFile(null); }
  };

  const handleCopyLink = async (key: string) => {
    const link = `s3://${bucket}/${key}`;
    try { await navigator.clipboard.writeText(link); toast.success('Link copied'); }
    catch { toast.error('Failed to copy link'); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) { toast.error('Enter a folder name'); return; }
    try {
      const res = await fetch(`${backendUrl}/api/files/mkdir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, key: currentPath + newFolderName + '/' }),
      });
      if (!res.ok) throw new Error('Create folder failed');
      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolder(false);
      loadFiles();
    } catch (err: any) { toast.error(err.message); }
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="p-2 hover:bg-muted rounded-lg transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  <FolderOpen className="w-7 h-7 text-primary" />
                  File Manager
                </h1>
                <p className="text-sm text-muted-foreground">Manage files in MinIO S3 storage</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader><CardTitle>Buckets</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <button onClick={() => { setBucket('duckdb-data'); setCurrentPath(''); }}
                    className={`w-full px-4 py-2 rounded-lg text-left transition ${bucket === 'duckdb-data' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-accent'}`}>
                    <Database className="w-4 h-4 inline mr-2" /> duckdb-data
                  </button>
                </div>
                <div className="mt-6 pt-6 border-t">
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-3">Navigation</p>
                  <button onClick={() => navigateTo('')} className="w-full px-4 py-2 rounded-lg text-left hover:bg-muted transition flex items-center gap-2">
                    <Home className="w-4 h-4" /> Root
                  </button>
                  {currentPath && (
                    <button onClick={navigateUp} className="w-full px-4 py-2 rounded-lg text-left hover:bg-muted transition flex items-center gap-2">
                      <ArrowUp className="w-4 h-4" /> Up
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle>{bucket}{currentPath && ` / ${currentPath}`}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{files.length} item{files.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="outline" onClick={() => loadFiles()} disabled={loading}>
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <label>
                      <Button size="icon" asChild><span><Upload className="w-4 h-4" /></span></Button>
                      <input type="file" multiple onChange={handleUpload} className="hidden" />
                    </label>
                    <Button size="icon" variant="outline" onClick={() => setShowNewFolder(true)}>
                      <FolderPlus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search files..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
                {showNewFolder && (
                  <div className="mt-4 p-4 bg-muted rounded-lg flex gap-2">
                    <Input placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
                    <Button onClick={handleCreateFolder} size="sm">Create</Button>
                    <Button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} size="sm" variant="outline">Cancel</Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-1">
                    {filteredFiles.length === 0 ? (
                      <div className="text-center py-12">
                        <File className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No files found</p>
                      </div>
                    ) : (
                      filteredFiles.map((file) => (
                        <div key={file.key} className="p-3 bg-muted/30 hover:bg-muted rounded-lg transition group">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {file.is_folder ? <FolderOpen className="w-5 h-5 text-amber-500 flex-shrink-0" /> : <File className="w-5 h-5 text-primary flex-shrink-0" />}
                              <div className="min-w-0">
                                <button onClick={() => { if (file.is_folder) navigateTo(file.key); }} className="hover:text-primary transition truncate">
                                  {file.name}
                                </button>
                                <p className="text-xs text-muted-foreground">{file.is_folder ? 'Folder' : formatSize(file.size)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition ml-2">
                              {!file.is_folder && (
                                <>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setImportingFile(file.key); setShowImportDialog(true); }} title="Import to DuckDB">
                                    <Database className="w-4 h-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleCopyLink(file.key)} title="Copy S3 path">
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(file.key)} title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(o) => { if (!o) { setShowImportDialog(false); setTableName(''); setImportingFile(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import to DuckDB</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm text-muted-foreground block mb-2">File</label><Input value={importingFile || ''} disabled /></div>
            <div><label className="text-sm text-muted-foreground block mb-2">Table Name</label><Input placeholder="Enter table name" value={tableName} onChange={(e) => setTableName(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setTableName(''); setImportingFile(null); }}>Cancel</Button>
            <Button onClick={() => handleImport(files.find(f => f.key === importingFile)!)} disabled={!tableName.trim()}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete File"
        description={`Are you sure you want to delete "${deleteTarget}"?`}
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
