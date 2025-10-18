import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  Plus, Trash2, Download, Copy, Table2
} from 'lucide-react';
import { toast } from 'sonner';
import { executeQuery } from '@/lib/duckdb';

interface ExcelLikeTableProps {
  data: any[];
  tableName?: string;
  onDataChange?: (newData: any[]) => void;
}

export function ExcelLikeTable({ data, tableName, onDataChange }: ExcelLikeTableProps) {
  const [rows, setRows] = useState(data);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('VARCHAR');
  const inputRef = useRef<HTMLInputElement>(null);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  useEffect(() => {
    setRows(data);
  }, [data]);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleCellClick = (rowIdx: number, colKey: string) => {
    const value = rows[rowIdx][colKey];
    setEditValue(value !== null && value !== undefined ? String(value) : '');
    setEditingCell({ rowIdx, colKey });
  };

  const handleCellChange = useCallback(() => {
    if (!editingCell) return;
    
    const newRows = [...rows];
    newRows[editingCell.rowIdx] = {
      ...newRows[editingCell.rowIdx],
      [editingCell.colKey]: editValue
    };
    setRows(newRows);
    onDataChange?.(newRows);
    setEditingCell(null);
  }, [editingCell, editValue, rows, onDataChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellChange();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleRowSelect = (rowIdx: number, checked: boolean) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(rowIdx);
    } else {
      newSelected.delete(rowIdx);
    }
    setSelectedRows(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(rows.map((_, idx) => idx)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleAddRow = async () => {
    if (!tableName) {
      const newRow: any = {};
      columns.forEach(col => {
        newRow[col] = '';
      });
      const newRows = [...rows, newRow];
      setRows(newRows);
      onDataChange?.(newRows);
      toast.success('Row added');
      return;
    }

    try {
      const cols = columns.join(', ');
      const values = columns.map(() => 'NULL').join(', ');
      await executeQuery(`INSERT INTO "${tableName}" (${cols}) VALUES (${values})`);
      
      const result = await executeQuery(`SELECT * FROM "${tableName}"`);
      setRows(result);
      onDataChange?.(result);
      toast.success('Row added to database');
    } catch (error: any) {
      toast.error('Failed to add row: ' + error.message);
    }
  };

  const handleDeleteRows = async () => {
    if (selectedRows.size === 0) {
      toast.error('No rows selected');
      return;
    }

    const newRows = rows.filter((_, idx) => !selectedRows.has(idx));
    setRows(newRows);
    setSelectedRows(new Set());
    onDataChange?.(newRows);
    toast.success(`Deleted ${selectedRows.size} row(s)`);
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) {
      toast.error('Column name is required');
      return;
    }

    if (!tableName) {
      const newRows = rows.map(row => ({ ...row, [newColumnName]: '' }));
      setRows(newRows);
      onDataChange?.(newRows);
      setShowColumnDialog(false);
      setNewColumnName('');
      toast.success('Column added');
      return;
    }

    try {
      await executeQuery(`ALTER TABLE "${tableName}" ADD COLUMN "${newColumnName}" ${newColumnType}`);
      const result = await executeQuery(`SELECT * FROM "${tableName}"`);
      setRows(result);
      onDataChange?.(result);
      setShowColumnDialog(false);
      setNewColumnName('');
      toast.success('Column added to database');
    } catch (error: any) {
      toast.error('Failed to add column: ' + error.message);
    }
  };

  const handleExportCSV = () => {
    const headers = columns.join(',');
    const csvRows = rows.map(row => 
      columns.map(c => JSON.stringify(row[c] ?? '')).join(',')
    );
    const csv = [headers, ...csvRows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableName || 'data'}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported to CSV');
  };

  const handleCopySelection = () => {
    if (selectedRows.size === 0) {
      toast.error('No rows selected');
      return;
    }

    const selectedData = Array.from(selectedRows).map(idx => rows[idx]);
    const headers = columns.join('\t');
    const dataRows = selectedData.map(row => 
      columns.map(c => row[c] ?? '').join('\t')
    );
    const text = [headers, ...dataRows].join('\n');
    
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-muted/50">
        <Button size="sm" onClick={handleAddRow}>
          <Plus className="w-3 h-3 mr-1" />
          Add Row
        </Button>
        <Button size="sm" onClick={handleDeleteRows} variant="outline" disabled={selectedRows.size === 0}>
          <Trash2 className="w-3 h-3 mr-1" />
          Delete ({selectedRows.size})
        </Button>
        <Button size="sm" onClick={() => setShowColumnDialog(true)} variant="outline">
          <Table2 className="w-3 h-3 mr-1" />
          Add Column
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleCopySelection} variant="ghost" disabled={selectedRows.size === 0}>
          <Copy className="w-3 h-3 mr-1" />
          Copy
        </Button>
        <Button size="sm" onClick={handleExportCSV} variant="ghost">
          <Download className="w-3 h-3 mr-1" />
          Export CSV
        </Button>
        <div className="text-xs text-muted-foreground">
          {rows.length} rows × {columns.length} cols
        </div>
      </div>

      {/* Excel-like Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-muted z-10">
            <tr>
              <th className="border border-border p-0 w-12 bg-muted">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={selectedRows.size === rows.length && rows.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              {columns.map((col) => (
                <th 
                  key={col} 
                  className="border border-border px-3 py-2 text-left font-semibold text-sm bg-muted min-w-[120px]"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx} className={selectedRows.has(rowIdx) ? 'bg-accent/20' : 'hover:bg-muted/50'}>
                <td className="border border-border p-0 text-center bg-muted/30">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={selectedRows.has(rowIdx)}
                    onChange={(e) => handleRowSelect(rowIdx, e.target.checked)}
                  />
                </td>
                {columns.map((col) => (
                  <td 
                    key={col}
                    className="border border-border px-2 py-1 cursor-text min-w-[120px] max-w-[300px]"
                    onClick={() => handleCellClick(rowIdx, col)}
                  >
                    {editingCell?.rowIdx === rowIdx && editingCell?.colKey === col ? (
                      <Input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleCellChange}
                        onKeyDown={handleKeyDown}
                        className="h-7 px-1 border-0 focus-visible:ring-1 focus-visible:ring-primary"
                      />
                    ) : (
                      <div className="truncate h-7 flex items-center">
                        {row[col] !== null && row[col] !== undefined ? String(row[col]) : ''}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Column Dialog */}
      <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Column</DialogTitle>
            <DialogDescription>
              Add a new column to the table
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Column Name</Label>
              <Input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="column_name"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Data Type</Label>
              <Select value={newColumnType} onValueChange={setNewColumnType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VARCHAR">Text (VARCHAR)</SelectItem>
                  <SelectItem value="INTEGER">Integer</SelectItem>
                  <SelectItem value="DOUBLE">Decimal (DOUBLE)</SelectItem>
                  <SelectItem value="DATE">Date</SelectItem>
                  <SelectItem value="TIMESTAMP">Timestamp</SelectItem>
                  <SelectItem value="BOOLEAN">Boolean</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddColumn} className="flex-1">Add Column</Button>
              <Button variant="outline" onClick={() => setShowColumnDialog(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
