import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, X } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

interface CSVImporterProps {
  onImport: (tableName: string, data: any[], columns: string[], opts?: { overwrite?: boolean, allVarchar?: boolean }) => Promise<void>;
  onImportComplete?: () => void;
}

export function CSVImporter({ onImport, onImportComplete }: CSVImporterProps) {
  const [open, setOpen] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [allVarchar, setAllVarchar] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [tableName, setTableName] = useState('');
  const [importing, setImporting] = useState(false);
  const [isXlsx, setIsXlsx] = useState(false);
  const [xlsxSheets, setXlsxSheets] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTableName(nameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_'));
      
      // Check if it's an Excel file
      const isExcel = selectedFile.name.match(/\.(xlsx|xls)$/i);
      setIsXlsx(!!isExcel);
      
      if (isExcel) {
        try {
          const arrayBuffer = await selectedFile.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer);
          setXlsxSheets(workbook.SheetNames);
          setSelectedSheets(new Set(workbook.SheetNames)); // Select all by default
        } catch (error: any) {
          toast.error(`Failed to parse Excel file: ${error.message}`);
        }
      }
    }
  };

  const handleImport = async () => {
    if (!file || !tableName) {
      toast.error('Please select a file and provide a table name');
      return;
    }

    setImporting(true);
    
    try {
      // Handle XLSX files
      if (isXlsx) {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        
        const sheetsToImport = Array.from(selectedSheets);
        
        for (const sheetName of sheetsToImport) {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          if (jsonData.length === 0) {
            toast.warning(`Sheet "${sheetName}" is empty, skipping`);
            continue;
          }
          
          const columns = Object.keys(jsonData[0] as any);
          const sheetTableName = sheetsToImport.length > 1 ? `${tableName}_${sheetName.replace(/[^a-zA-Z0-9_]/g, '_')}` : tableName;
          
          try {
            await onImport(sheetTableName, jsonData, columns, { overwrite, allVarchar });
            toast.success(`Imported ${jsonData.length} rows from sheet "${sheetName}" into "${sheetTableName}"`);
          } catch (error: any) {
            toast.error(`Failed to import sheet "${sheetName}": ${error.message}`);
          }
        }
        
        setOpen(false);
        setFile(null);
        setTableName('');
        setImporting(false);
        
        // Refresh tables list
        if (onImportComplete) {
          onImportComplete();
        }
        return;
      }
      
      // Handle CSV files
      const MAX_IN_MEMORY = 10 * 1024 * 1024; // 10MB threshold
      
      if (file.size > MAX_IN_MEMORY) {
        toast.loading(`Processing large file (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`, { id: 'csv-import' });
      }
      
      const text = await file.text();
      Papa.parse(text, {
        header: true,
        dynamicTyping: !allVarchar, // Disable type detection if allVarchar is true
        skipEmptyLines: true,
        complete: async (results) => {
          if (results.errors.length > 0) {
            toast.error('Error parsing CSV: ' + results.errors[0].message, { id: 'csv-import' });
            setImporting(false);
            return;
          }

          if (results.data.length === 0) {
            toast.error('CSV file is empty', { id: 'csv-import' });
            setImporting(false);
            return;
          }

          const columns = results.meta.fields || [];
          
          try {
            await onImport(tableName, results.data, columns, { overwrite, allVarchar });
            toast.success(`Imported ${results.data.length} rows into table "${tableName}"`, { id: 'csv-import' });
            setOpen(false);
            setFile(null);
            setTableName('');
            
            // Refresh tables list
            if (onImportComplete) {
              onImportComplete();
            }
          } catch (error: any) {
            toast.error('Failed to import: ' + error.message, { id: 'csv-import' });
          } finally {
            setImporting(false);
          }
        },
        error: (error) => {
          toast.error('Failed to parse CSV: ' + error.message, { id: 'csv-import' });
          setImporting(false);
        }
      });
    } catch (error: any) {
      toast.error('Failed to read file: ' + error.message, { id: 'csv-import' });
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
                  accept=".csv,.txt,.xlsx,.xls"
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

            {file && isXlsx && xlsxSheets.length > 0 && (
              <div>
                <Label>Select Sheets to Import</Label>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded p-2">
                  {xlsxSheets.map(sheetName => (
                    <div key={sheetName} className="flex items-center space-x-2">
                      <Checkbox
                        id={sheetName}
                        checked={selectedSheets.has(sheetName)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedSheets);
                          if (checked) {
                            newSet.add(sheetName);
                          } else {
                            newSet.delete(sheetName);
                          }
                          setSelectedSheets(newSet);
                        }}
                      />
                      <Label htmlFor={sheetName} className="text-sm font-normal cursor-pointer">
                        {sheetName}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {file && (
              <div>
                <Label htmlFor="tableName">Table Name {isXlsx && selectedSheets.size > 1 && '(Base Name)'}</Label>
                <Input
                  id="tableName"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="my_table"
                  className="mt-2"
                />
                {isXlsx && selectedSheets.size > 1 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Multiple sheets will be imported as: {tableName}_sheetname
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={overwrite} onChange={e => setOverwrite(e.target.checked)} />
                Overwrite table if exists
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={allVarchar} onChange={e => setAllVarchar(e.target.checked)} />
                Import all columns as VARCHAR (fixes import errors)
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={!file || !tableName || importing || (isXlsx && selectedSheets.size === 0)}
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
