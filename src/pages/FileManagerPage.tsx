import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/duckdb';
import {
  FolderOpen, File, Upload, Download, Trash2, FolderPlus,
  RefreshCw, Copy, Link, ChevronRight, Home, ArrowUp, Database,
  ArrowLeft, Search, Filter
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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tableName, setTableName] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importingFile, setImportingFile] = useState<string | null>(null);

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

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

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
      } catch (err: any) {
        toast.error(`Upload failed: ${file.name} - ${err.message}`);
      }
    }
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file(s)`);
      loadFiles();
    }
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

  const handleImport = async (file: FileItem) => {
    if (!tableName.trim()) {
      toast.error('Enter a table name');
      return;
    }
    setImportingFile(file.key);
    try {
      const res = await fetch(`${backendUrl}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3_path: `s3://${bucket}/${file.key}`, table_name: tableName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Import failed');
      }
      const result = await res.json();
      toast.success(result.message);
      setShowImportDialog(false);
      setTableName('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImportingFile(null);
    }
  };

  const handleCopyLink = async (key: string) => {
    const link = `s3://${bucket}/${key}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Enter a folder name');
      return;
    }
    try {
      const res = await fetch(`${backendUrl}/api/files/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, key: currentPath + newFolderName + '/' }),
      });
      if (!res.ok) throw new Error('Create folder failed');
      toast.success('Folder created');
      setNewFolderName('');
      setShowNewFolder(false);
      loadFiles();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const filteredFiles = files.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FolderOpen className="w-7 h-7 text-blue-400" />
                  File Manager
                </h1>
                <p className="text-sm text-slate-400">Manage files in MinIO S3 storage</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar */}
          <div className="lg:col-span-1">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Buckets</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setBucket('duckdb-data');
                      setCurrentPath('');
                    }}
                    className={`w-full px-4 py-2 rounded-lg text-left transition ${
                      bucket === 'duckdb-data'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    <Database className="w-4 h-4 inline mr-2" />
                    duckdb-data
                  </button>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-700">
                  <p className="text-xs text-slate-400 uppercase font-semibold mb-3">Navigation</p>
                  <button
                    onClick={() => navigateTo('')}
                    className="w-full px-4 py-2 rounded-lg text-left text-slate-300 hover:bg-slate-700 transition flex items-center gap-2"
                  >
                    <Home className="w-4 h-4" />
                    Root
                  </button>
                  {currentPath && (
                    <button
                      onClick={navigateUp}
                      className="w-full px-4 py-2 rounded-lg text-left text-slate-300 hover:bg-slate-700 transition flex items-center gap-2"
                    >
                      <ArrowUp className="w-4 h-4" />
                      Up
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-white">
                      {bucket}{currentPath && ` / ${currentPath}`}
                    </CardTitle>
                    <p className="text-sm text-slate-400 mt-1">
                      {files.length} item{files.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadFiles()}
                      disabled={loading}
                      className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <label className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition cursor-pointer">
                      <Upload className="w-4 h-4" />
                      <input
                        type="file"
                        multiple
                        onChange={handleUpload}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => setShowNewFolder(true)}
                      className="p-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="mt-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* New Folder Dialog */}
                {showNewFolder && (
                  <div className="mt-4 p-4 bg-slate-700 rounded-lg">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Folder name"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="bg-slate-600 border-slate-500 text-white"
                      />
                      <Button
                        onClick={handleCreateFolder}
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        Create
                      </Button>
                      <Button
                        onClick={() => {
                          setShowNewFolder(false);
                          setNewFolderName('');
                        }}
                        size="sm"
                        variant="outline"
                        className="border-slate-600"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </CardHeader>

              <CardContent>
                {/* Files List */}
                <ScrollArea className="h-[500px] pr-4">
                  <div className="space-y-1">
                    {filteredFiles.length === 0 ? (
                      <div className="text-center py-12">
                        <File className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400">No files found</p>
                      </div>
                    ) : (
                      filteredFiles.map((file) => (
                        <div
                          key={file.key}
                          className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              {file.is_folder ? (
                                <FolderOpen className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                              ) : (
                                <File className="w-5 h-5 text-blue-400 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <button
                                  onClick={() => {
                                    if (file.is_folder) {
                                      navigateTo(file.key);
                                    }
                                  }}
                                  className="text-white hover:text-blue-400 transition truncate"
                                >
                                  {file.name}
                                </button>
                                <p className="text-xs text-slate-400">
                                  {file.is_folder ? 'Folder' : formatSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition ml-2">
                              {!file.is_folder && (
                                <>
                                  <button
                                    onClick={() => {
                                      setImportingFile(file.key);
                                      setShowImportDialog(true);
                                    }}
                                    className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 rounded transition"
                                    title="Import to DuckDB"
                                  >
                                    <Database className="w-4 h-4 text-blue-400" />
                                  </button>
                                  <button
                                    onClick={() => handleCopyLink(file.key)}
                                    className="p-1.5 bg-slate-600/50 hover:bg-slate-600 rounded transition"
                                    title="Copy S3 path"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleDelete(file.key)}
                                className="p-1.5 bg-red-600/20 hover:bg-red-600/40 rounded transition"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4 text-red-400" />
                              </button>
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

        {/* Import Dialog */}
        {showImportDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Import to DuckDB</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-2">File</label>
                  <Input
                    value={importingFile || ''}
                    disabled
                    className="bg-slate-700 border-slate-600 text-slate-300"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 block mb-2">Table Name</label>
                  <Input
                    placeholder="Enter table name"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    onClick={() => {
                      setShowImportDialog(false);
                      setTableName('');
                      setImportingFile(null);
                    }}
                    variant="outline"
                    className="border-slate-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleImport(files.find(f => f.key === importingFile)!)}
                    disabled={!tableName.trim()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Import
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
