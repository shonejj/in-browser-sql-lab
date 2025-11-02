import { useState, useRef } from 'react';
import { Database, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';
import { getConnection } from '@/lib/duckdb';

interface DuckDBFileAttacherProps {
  onAttach?: () => void;
}

export function DuckDBFileAttacher({ onAttach }: DuckDBFileAttacherProps) {
  const [open, setOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(db|duckdb)$/i)) {
      toast.error('Please select a DuckDB database file (.db or .duckdb)');
      return;
    }

    setAttaching(true);
    try {
      const conn = await getConnection();
      const arrayBuffer = await file.arrayBuffer();
      
      // Register the file buffer
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      await conn.insertArrowFromIPCStream(new Uint8Array(arrayBuffer), {
        name: fileName,
      });

      // Attach the database
      await conn.query(`ATTACH '${fileName}' AS ${fileName}`);
      
      toast.success(`Attached DuckDB file: ${fileName}`);
      setOpen(false);
      
      if (onAttach) {
        onAttach();
      }
    } catch (error: any) {
      console.error('Failed to attach DuckDB file:', error);
      toast.error(`Failed to attach: ${error.message}`);
    } finally {
      setAttaching(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
        title="Attach DuckDB file"
      >
        <Database className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach DuckDB File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a DuckDB database file (.db or .duckdb) to attach to the current session.
              This will make all tables in that database available for querying.
            </p>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".db,.duckdb"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
                disabled={attaching}
              >
                <Upload className="w-4 h-4 mr-2" />
                {attaching ? 'Attaching...' : 'Select DuckDB File'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
