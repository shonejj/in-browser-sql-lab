import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import Papa from 'papaparse';
import { toast } from 'sonner';

interface CSVImporterProps {
  onImport: (tableName: string, data: any[], columns: string[]) => Promise<void>;
}

export function CSVImporter({ onImport }: CSVImporterProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [tableName, setTableName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTableName(nameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_'));
    }
  };

  const handleImport = async () => {
    if (!file || !tableName) {
      toast.error('Please select a file and provide a table name');
      return;
    }

    setImporting(true);
    
    try {
      const text = await file.text();
      
      Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: async (results) => {
          if (results.errors.length > 0) {
            toast.error('Error parsing CSV: ' + results.errors[0].message);
            setImporting(false);
            return;
          }

          if (results.data.length === 0) {
            toast.error('CSV file is empty');
            setImporting(false);
            return;
          }

          const columns = results.meta.fields || [];
          
          try {
            await onImport(tableName, results.data, columns);
            toast.success(`Imported ${results.data.length} rows into table "${tableName}"`);
            setOpen(false);
            setFile(null);
            setTableName('');
          } catch (error: any) {
            toast.error('Failed to import: ' + error.message);
          } finally {
            setImporting(false);
          }
        },
        error: (error) => {
          toast.error('Failed to parse CSV: ' + error.message);
          setImporting(false);
        }
      });
    } catch (error: any) {
      toast.error('Failed to read file: ' + error.message);
      setImporting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen(true)}
      >
        <Upload className="w-3.5 h-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import CSV File</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="file">Select CSV File</Label>
              <div className="mt-2">
                <input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  {file ? file.name : 'Choose file...'}
                </Button>
              </div>
            </div>

            {file && (
              <div>
                <Label htmlFor="tableName">Table Name</Label>
                <Input
                  id="tableName"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="my_table"
                  className="mt-2"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={!file || !tableName || importing}
                className="flex-1"
              >
                {importing ? 'Importing...' : 'Import'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setFile(null);
                  setTableName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
