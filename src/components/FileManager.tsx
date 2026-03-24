import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/duckdb';
import {
  FolderOpen, File, Upload, Download, Trash2, FolderPlus,
  RefreshCw, Copy, Link, ChevronRight, Home, ArrowUp
} from 'lucide-react';

interface FileManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

interface FileItem {
  name: string;
  key: string;
  size: number;
  is_folder: boolean;
  last_modified?: string;
}

export function FileManager({ open, onOpenChange, onImportComplete }: FileManagerProps) {
  const [bucket, setBucket] = useState('duckdb-data');
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const backendUrl = getBackendUrl();

  const loadFiles = useCallback(async (path?: string) => {
    const p = path ?? currentPath;
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/files/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, prefix: p }),
      });
      if (!res.ok) throw new Error('Failed to list files');
      const data = await res.json();
      setFiles(data.files || []);
      setSelectedFiles(new Set());
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [backendUrl, bucket, currentPath]);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    loadFiles(path);
  };

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    navigateTo(parts.length ? parts.join('/') + '/' : '');
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    for (const file of Array.from(fileList)) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', bucket);
      formData.append('key', currentPath + file.name);
      
      try {
        const res = await fetch(`${backendUrl}/api/files/upload`, { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Upload failed');
        toast.success(`Uploaded: ${file.name}`);
      } catch (err: any) {
        toast.error(`Upload failed: ${err.message}`);
      }
    }
    loadFiles();
    e.target.value = '';
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete "${key}"?`)) return;
    try {
      const res = await fetch(`${backendUrl}/api/files/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, key }),
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Deleted');
      loadFiles();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch(`${backendUrl}/api/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, key: currentPath + newFolderName.trim() + '/' }),
      });
      if (!res.ok) throw new Error('Failed to create folder');
      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolder(false);
      loadFiles();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCopyLink = async (key: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/files/copy-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, key }),
      });
      if (!res.ok) throw new Error('Failed to generate link');
      const data = await res.json();
      await navigator.clipboard.writeText(data.url);
      toast.success('Link copied to clipboard');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDownload = (key: string) => {
    const url = `${backendUrl}/api/files/download?bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`;
    window.open(url, '_blank');
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const breadcrumbs = ['root', ...currentPath.split('/').filter(Boolean)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5" />
            File Manager
            <Badge variant="secondary" className="text-[10px] ml-2">MinIO</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={bucket}
            onChange={(e) => setBucket(e.target.value)}
            placeholder="bucket"
            className="w-32 h-8 text-xs"
          />
          <Button variant="outline" size="sm" className="h-8" onClick={() => loadFiles()}>
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={navigateUp} disabled={!currentPath}>
            <ArrowUp className="w-3 h-3 mr-1" /> Up
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setShowNewFolder(!showNewFolder)}>
            <FolderPlus className="w-3 h-3 mr-1" /> New Folder
          </Button>
          <label>
            <Button variant="outline" size="sm" className="h-8 cursor-pointer" asChild>
              <span><Upload className="w-3 h-3 mr-1" /> Upload</span>
            </Button>
            <input type="file" multiple className="hidden" onChange={handleUpload} />
          </label>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          <button onClick={() => navigateTo('')} className="hover:text-foreground flex items-center gap-0.5">
            <Home className="w-3 h-3" /> {bucket}
          </button>
          {currentPath.split('/').filter(Boolean).map((part, idx, arr) => (
            <span key={idx} className="flex items-center gap-0.5">
              <ChevronRight className="w-3 h-3" />
              <button
                onClick={() => navigateTo(arr.slice(0, idx + 1).join('/') + '/')}
                className="hover:text-foreground"
              >
                {part}
              </button>
            </span>
          ))}
        </div>

        {showNewFolder && (
          <div className="flex gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="h-8 text-xs flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <Button size="sm" className="h-8" onClick={handleCreateFolder}>Create</Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowNewFolder(false)}>Cancel</Button>
          </div>
        )}

        {/* File List */}
        <ScrollArea className="flex-1 min-h-0 border rounded-lg">
          <div className="min-w-0">
            <div className="grid grid-cols-[1fr_80px_120px_100px] gap-2 px-3 py-2 border-b text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Name</span>
              <span>Size</span>
              <span>Modified</span>
              <span className="text-right">Actions</span>
            </div>
            {files.length === 0 && !loading && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {currentPath ? 'Empty folder' : 'Click Refresh to load files'}
              </div>
            )}
            {files.map((file) => (
              <div
                key={file.key}
                className="grid grid-cols-[1fr_80px_120px_100px] gap-2 px-3 py-2 hover:bg-muted/50 items-center text-xs border-b last:border-0"
              >
                <button
                  className="flex items-center gap-2 text-left min-w-0 truncate"
                  onClick={() => {
                    if (file.is_folder) {
                      navigateTo(file.key);
                    }
                  }}
                >
                  {file.is_folder ? (
                    <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{file.name}</span>
                </button>
                <span className="text-muted-foreground">{formatSize(file.size)}</span>
                <span className="text-muted-foreground text-[10px]">
                  {file.last_modified ? new Date(file.last_modified).toLocaleDateString() : '-'}
                </span>
                <div className="flex items-center gap-0.5 justify-end">
                  {!file.is_folder && (
                    <>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleImportToDuckDB(file)} title="Import to DuckDB">
                        <Database className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(file.key)} title="Download">
                        <Download className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyLink(file.key)} title="Copy Link">
                        <Link className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDelete(file.key)} title="Delete">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
