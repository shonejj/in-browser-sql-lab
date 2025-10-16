import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { listNotebooks, createNotebook, deleteNotebook, getNotebook, saveNotebook, NotebookDoc } from '@/lib/notebooks';
import { Trash2, Plus, Download, Play } from 'lucide-react';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { executeQuery } from '@/lib/duckdb';
import { saveAs } from 'file-saver';

function NotebookEditor({ notebookId, onClose }: { notebookId: string, onClose: () => void }) {
  const [nb, setNb] = useState<NotebookDoc|null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [cellEdit, setCellEdit] = useState<{[id:string]:string}>({});
  const [outputs, setOutputs] = useState<{[id:string]:any}>({});
  const [running, setRunning] = useState<string|null>(null);

  useEffect(() => {
    setNb(getNotebook(notebookId) || null);
  }, [notebookId]);

  const save = (next: NotebookDoc) => {
    saveNotebook(next);
    setNb({...next});
  };

  if (!nb) return <div className="p-4">Notebook not found.</div>;

  const handleTitleEdit = () => {
    setEditingTitle(true);
  };
  const handleTitleSave = (e: React.FormEvent) => {
    e.preventDefault();
    save({ ...nb, title: (e.target as any).title.value });
    setEditingTitle(false);
  };
  const handleAddCell = (type: 'code'|'markdown') => {
    const id = `cell_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const next = { ...nb, cells: [...nb.cells, { id, type, content: '' }] };
    save(next);
  };
  const handleEditCell = (id: string, content: string) => {
    setCellEdit({ ...cellEdit, [id]: content });
  };
  const handleSaveCell = (id: string) => {
    const next = { ...nb, cells: nb.cells.map(c => c.id === id ? { ...c, content: cellEdit[id] ?? c.content } : c) };
    save(next);
    setCellEdit({ ...cellEdit, [id]: undefined });
  };
  const handleDeleteCell = (id: string) => {
    const next = { ...nb, cells: nb.cells.filter(c => c.id !== id) };
    save(next);
  };
  const handleRunCell = async (id: string) => {
    setRunning(id);
    setOutputs({ ...outputs, [id]: { status: 'running' } });
    const cell = nb.cells.find(c => c.id === id);
    if (!cell) return;
    try {
      const result = await executeQuery(cell.content);
      setOutputs({ ...outputs, [id]: { status: 'ok', result } });
    } catch (e: any) {
      setOutputs({ ...outputs, [id]: { status: 'error', error: e.message || String(e) } });
    } finally {
      setRunning(null);
    }
  };

  const handleExportNotebook = () => {
    const exportData = {
      ...nb,
      exported_at: new Date().toISOString(),
      cells: nb.cells.map(cell => ({
        ...cell,
        output: outputs[cell.id]
      }))
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    saveAs(blob, `${nb.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`);
    toast.success('Notebook exported successfully');
  };


  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        {editingTitle ? (
          <form onSubmit={handleTitleSave} className="flex gap-2 items-center flex-1">
            <Input name="title" defaultValue={nb.title} className="text-lg font-bold" />
            <Button type="submit" size="sm">Save</Button>
          </form>
        ) : (
          <>
            <span className="text-lg font-bold flex-1">{nb.title}</span>
            <Button size="sm" variant="ghost" onClick={handleTitleEdit}>Edit Title</Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={handleExportNotebook}>
          <Download className="w-3 h-3 mr-2" />
          Export
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {nb.cells.length === 0 && <div className="text-muted-foreground">No cells. Add one below.</div>}
        {nb.cells.map(cell => (
          <div key={cell.id} className="border rounded p-2 bg-muted">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-accent">{cell.type}</span>
              <Button size="sm" variant="ghost" onClick={() => handleDeleteCell(cell.id)}>Delete</Button>
            </div>
            {cell.type === 'markdown' ? (
              <Textarea
                className="w-full min-h-[60px]"
                value={cellEdit[cell.id] ?? cell.content}
                onChange={e => handleEditCell(cell.id, e.target.value)}
                onBlur={() => handleSaveCell(cell.id)}
                placeholder="Write markdown..."
              />
            ) : (
              <>
                <Textarea
                  className="w-full min-h-[60px] font-mono"
                  value={cellEdit[cell.id] ?? cell.content}
                  onChange={e => handleEditCell(cell.id, e.target.value)}
                  placeholder="Write SQL..."
                />
                <div className="flex gap-2 mt-1">
                  <Button size="sm" onClick={() => handleSaveCell(cell.id)}>Save</Button>
                  <Button size="sm" onClick={() => handleRunCell(cell.id)} disabled={running===cell.id}>Run</Button>
                </div>
                <div className="mt-1 text-xs">
                  {outputs[cell.id]?.status === 'running' && <span>Running...</span>}
                  {outputs[cell.id]?.status === 'ok' && (
                    <pre className="bg-background p-2 rounded overflow-x-auto max-h-40">{JSON.stringify(outputs[cell.id].result, null, 2)}</pre>
                  )}
                  {outputs[cell.id]?.status === 'error' && (
                    <span className="text-red-500">{outputs[cell.id].error}</span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="border-t p-2 flex gap-2">
        <Button size="sm" onClick={() => handleAddCell('code')}>Add Code</Button>
        <Button size="sm" onClick={() => handleAddCell('markdown')}>Add Markdown</Button>
      </div>
    </div>
  );
}

export function NotebookManager() {
  const [open, setOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<NotebookDoc[]>([]);
  const [editorId, setEditorId] = useState<string|null>(null);

  useEffect(() => {
    if (open) setNotebooks(listNotebooks());
  }, [open, editorId]);

  const handleCreate = () => {
    const title = prompt('Notebook title', 'Untitled') || 'Untitled';
    createNotebook(title);
    setNotebooks(listNotebooks());
  };

  const handleDelete = (id: string) => {
    const ok = confirm('Delete notebook?');
    if (!ok) return;
    deleteNotebook(id);
    setNotebooks(listNotebooks());
  };

  const handleOpen = (id: string) => {
    setEditorId(id);
  };
  const handleCloseEditor = () => {
    setEditorId(null);
    setNotebooks(listNotebooks());
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" className="w-full justify-start text-xs font-normal h-8 text-sidebar-foreground hover:bg-sidebar-accent">
          <span>Notebooks</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[600px] sm:w-[700px] p-0">
        {editorId ? (
          <NotebookEditor notebookId={editorId} onClose={handleCloseEditor} />
        ) : (
          <>
            <SheetHeader className="px-4 py-3 border-b flex items-center justify-between">
              <SheetTitle>Notebooks</SheetTitle>
              <div>
                <Button onClick={handleCreate}><Plus className="w-3 h-3 mr-2"/> New</Button>
              </div>
            </SheetHeader>
            <div className="p-4">
              {notebooks.length === 0 ? (
                <div className="text-sm text-muted-foreground">No notebooks yet. Create one.</div>
              ) : (
                <div className="space-y-2">
                  {notebooks.map(nb => (
                    <div key={nb.id} className="flex items-center justify-between">
                      <div>{nb.title}</div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleOpen(nb.id)}>Open</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(nb.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default NotebookManager;
