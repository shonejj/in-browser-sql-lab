import { useState, useRef } from 'react';
import { Database, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { getConnection, getDatabase, executeQuery, isBackendMode, backendImportFile } from '@/lib/duckdb';

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

    if (!file.name.match(/\.(db|duckdb|sqlite|sqlite3|parquet|csv|json|jsonl|xlsx|xls)$/i)) {
      toast.error('Supported formats: .db, .duckdb, .sqlite, .csv, .parquet, .json, .xlsx');
      return;
    }

    setAttaching(true);
    try {
      if (isBackendMode()) {
        // Use backend for import
        await backendImportFile(file, file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'));
        toast.success('File imported via backend');
        setOpen(false);
        onAttach?.();
        return;
      }

      // WASM mode
      const db = await getDatabase();
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const fileName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const dbPath = `/${fileName}`;

      await db.registerFileBuffer(dbPath, uint8Array);

      // Handle based on file type
      if (file.name.match(/\.(csv|tsv)$/i)) {
        const tableName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        await executeQuery(`CREATE TABLE "${tableName}" AS SELECT * FROM read_csv_auto('${dbPath}')`);
        toast.success(`Imported CSV as table "${tableName}"`);
      } else if (file.name.match(/\.parquet$/i)) {
        const tableName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        await executeQuery(`CREATE TABLE "${tableName}" AS SELECT * FROM read_parquet('${dbPath}')`);
        toast.success(`Imported Parquet as table "${tableName}"`);
      } else if (file.name.match(/\.(json|jsonl)$/i)) {
        const tableName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        await executeQuery(`CREATE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${dbPath}')`);
        toast.success(`Imported JSON as table "${tableName}"`);
      } else {
        // Database file - try ATTACH
        toast.info('Attaching database file...');
        try {
          await executeQuery(`ATTACH '${dbPath}' AS attached_db`);
        } catch {
          // Try as SQLite
          try {
            await executeQuery(`INSTALL sqlite; LOAD sqlite;`);
          } catch { /* ignore */ }
          await executeQuery(`ATTACH '${dbPath}' AS attached_db (TYPE SQLITE)`);
        }

        // Get tables
        let tables: string[] = [];
        try {
          const result = await executeQuery(`SELECT table_name FROM attached_db.information_schema.tables WHERE table_schema = 'main'`);
          tables = result.map((r: any) => r.table_name);
        } catch {
          const result = await executeQuery(`SELECT name as table_name FROM attached_db.sqlite_master WHERE type='table'`);
          tables = result.map((r: any) => r.table_name);
        }

        if (tables.length === 0) {
          toast.warning('No tables found in the database file');
          try { await executeQuery('DETACH attached_db'); } catch {}
          setOpen(false);
          return;
        }

        let imported = 0;
        for (const tableName of tables) {
          try {
            const safeName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
            await executeQuery(`CREATE OR REPLACE TABLE "${safeName}" AS SELECT * FROM attached_db."${tableName}"`);
            imported++;
          } catch (err: any) {
            console.error(`Failed to import table ${tableName}:`, err);
          }
        }

        try { await executeQuery('DETACH attached_db'); } catch {}
        toast.success(`Imported ${imported}/${tables.length} table(s) from database file`);
      }

      setOpen(false);
      onAttach?.();
    } catch (error: any) {
      console.error('Failed to attach file:', error);
      toast.error(`Failed: ${error.message}`);
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
        title="Import File (DB, CSV, Parquet, JSON, Excel)"
      >
        <Database className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Data File</DialogTitle>
            <DialogDescription>
              Import from database files, CSV, Parquet, JSON, or Excel
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Supported formats: DuckDB (.db, .duckdb), SQLite (.sqlite), CSV, Parquet, JSON, Excel (.xlsx)
              {isBackendMode() && <span className="text-primary"> — Backend mode: all formats supported with full extension access</span>}
            </p>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".db,.duckdb,.sqlite,.sqlite3,.csv,.tsv,.parquet,.json,.jsonl,.xlsx,.xls"
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
                {attaching ? 'Importing...' : 'Select File'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
