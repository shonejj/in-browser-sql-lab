import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { listNotebooks, createNotebook, deleteNotebook, NotebookDoc } from '@/lib/notebooks';
import { Trash2, Plus } from 'lucide-react';

export function NotebookManager() {
  const [open, setOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<NotebookDoc[]>([]);

  useEffect(() => {
    if (open) setNotebooks(listNotebooks());
  }, [open]);

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" className="w-full justify-start text-xs font-normal h-8 text-sidebar-foreground hover:bg-sidebar-accent">
          <span>Notebooks</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[420px] sm:w-[540px] p-0">
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
                    <Button variant="ghost" size="sm" onClick={() => alert('Open notebook feature not implemented yet')}>Open</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(nb.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default NotebookManager;
