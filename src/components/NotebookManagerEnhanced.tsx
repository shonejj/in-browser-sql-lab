import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Book, Plus, Trash2, Download, Upload, Calendar, FileText } from 'lucide-react';
import { 
  listNotebooks, 
  createNotebook, 
  deleteNotebook, 
  getNotebook,
  type NotebookDoc 
} from '@/lib/notebooks';
import { toast } from 'sonner';
import { ConfirmDialog } from './ConfirmDialog';

interface NotebookManagerEnhancedProps {
  onNotebookSelect?: (id: string) => void;
}

export function NotebookManagerEnhanced({ onNotebookSelect }: NotebookManagerEnhancedProps) {
  const [notebooks, setNotebooks] = useState<NotebookDoc[]>([]);
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      refreshNotebooks();
    }
  }, [open]);

  const refreshNotebooks = () => {
    const nbs = listNotebooks();
    setNotebooks(nbs);
  };

  const handleCreate = () => {
    if (!newNotebookTitle.trim()) {
      toast.error('Please enter a notebook title');
      return;
    }

    const nb = createNotebook(newNotebookTitle);
    toast.success(`Created notebook: ${nb.title}`);
    setNewNotebookTitle('');
    setCreateDialogOpen(false);
    refreshNotebooks();
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    
    deleteNotebook(deleteConfirm);
    toast.success('Notebook deleted');
    setDeleteConfirm(null);
    refreshNotebooks();
  };

  const handleExport = (nb: NotebookDoc) => {
    const json = JSON.stringify(nb, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nb.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Notebook exported');
  };

  const handleExportAll = () => {
    const json = JSON.stringify(notebooks, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all_notebooks_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('All notebooks exported');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        
        // Handle single notebook or array
        const nbs = Array.isArray(imported) ? imported : [imported];
        
        nbs.forEach((nb: any) => {
          // Regenerate ID to avoid conflicts
          const newNb = createNotebook(nb.title || 'Imported Notebook');
          // Update with imported cells
          const existing = getNotebook(newNb.id);
          if (existing) {
            existing.cells = nb.cells || [];
            // Save via localstorage
            localStorage.setItem(
              'sqllab:notebooks:v1',
              JSON.stringify(
                listNotebooks().map(n => n.id === newNb.id ? existing : n)
              )
            );
          }
        });

        toast.success(`Imported ${nbs.length} notebook(s)`);
        refreshNotebooks();
      } catch (error: any) {
        toast.error(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    
    // Reset input
    e.target.value = '';
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
        title="Notebooks"
      >
        <Book className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Notebooks</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = handleImport as any;
                    input.click();
                  }}
                >
                  <Upload className="w-3.5 h-3.5 mr-1" />
                  Import
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportAll}
                  disabled={notebooks.length === 0}
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Export All
                </Button>
                <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  New
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-2 py-4">
            {notebooks.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Book className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>No notebooks yet</p>
                <p className="text-xs mt-1">Create one to get started</p>
              </div>
            ) : (
              notebooks.map((nb) => (
                <div
                  key={nb.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{nb.title}</div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {nb.cells.length} cell{nb.cells.length !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(nb.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleExport(nb)}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (onNotebookSelect) {
                          onNotebookSelect(nb.id);
                          setOpen(false);
                        }
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirm(nb.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Notebook Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Notebook</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newNotebookTitle}
              onChange={(e) => setNewNotebookTitle(e.target.value)}
              placeholder="Notebook title..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Delete Notebook"
        description="Are you sure you want to delete this notebook? This action cannot be undone."
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  );
}
