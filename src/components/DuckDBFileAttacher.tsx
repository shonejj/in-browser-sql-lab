import { useState, useRef } from 'react';
import { Database, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { getConnection, getDatabase } from '@/lib/duckdb';

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

    if (!file.name.match(/\.(db|duckdb|sqlite)$/i)) {
      toast.error('Please select a DuckDB or SQLite database file (.db, .duckdb, or .sqlite)');
      return;
    }

    setAttaching(true);
    try {
      const db = await getDatabase();
      const conn = await getConnection();
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Register the file buffer with DuckDB
      const fileName = file.name;
      await db.registerFileBuffer(fileName, uint8Array);
      
      toast.info('File registered, reading schema...');
      
      // Query the attached database to get list of tables
      let tables: string[] = [];
      try {
        const tablesResult = await conn.query(
          `SELECT name FROM sqlite_master('${fileName}') WHERE type='table'`
        );
        tables = tablesResult.toArray().map((row: any) => row.name);
      } catch (err) {
        // Fallback for DuckDB format
        try {
          const result = await conn.query(`SHOW TABLES FROM '${fileName}'`);
          tables = result.toArray().map((row: any) => row.name);
        } catch (err2) {
          console.error('Could not read tables from external database', err2);
          toast.error('Could not read table list from the database file');
          return;
        }
      }
      
      if (tables.length === 0) {
        toast.warning('No tables found in the database file');
        setOpen(false);
        return;
      }

      toast.info(`Found ${tables.length} table(s), importing...`);
      
      // Import each table
      let imported = 0;
      for (const tableName of tables) {
        try {
          const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
          // Create table by selecting from the external database
          await conn.query(
            `CREATE OR REPLACE TABLE "${safeName}" AS SELECT * FROM '${fileName}'.${tableName}`
          );
          imported++;
        } catch (tableErr: any) {
          console.error(`Failed to import table ${tableName}:`, tableErr);
          toast.error(`Failed to import table ${tableName}: ${tableErr.message}`);
        }
      }
      
      toast.success(`Successfully attached database and imported ${imported}/${tables.length} table(s)`);
      setOpen(false);
      
      if (onAttach) {
        onAttach();
      }
    } catch (error: any) {
      console.error('Failed to attach DuckDB file:', error);
      toast.error(`Failed to attach: ${error.message}`);
    } finally {
      setAttaching(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
            <DialogDescription>
              Import tables from an external database file
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a DuckDB or SQLite database file (.db, .duckdb, or .sqlite) to import.
              All tables from the external database will be imported into the current session.
            </p>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".db,.duckdb,.sqlite"
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
