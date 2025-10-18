import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  Plus, Trash2, Download, Copy, Table2, ChevronLeft, ChevronRight
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
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('VARCHAR');
  const inputRef = useRef<HTMLInputElement>(null);

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  useEffect(() => {
    setRows(data);
    setCurrentPage(0); // Reset to first page when data changes
  }, [data]);

  // Paginated rows for performance
  const paginatedRows = useMemo(() => {
    const start = currentPage * pageSize;
    const end = start + pageSize;
    return rows.slice(start, end);
  }, [rows, currentPage, pageSize]);

  const totalPages = Math.ceil(rows.length / pageSize);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const handleCellClick = (pageRowIdx: number, colKey: string) => {
    const actualRowIdx = currentPage * pageSize + pageRowIdx;
    const value = rows[actualRowIdx][colKey];
    setEditValue(value !== null && value !== undefined ? String(value) : '');
    setEditingCell({ rowIdx: actualRowIdx, colKey });
  };

  const handleCellChange = useCallback(async () => {
    if (!editingCell) return;
    
    const newRows = [...rows];
    newRows[editingCell.rowIdx] = {
      ...newRows[editingCell.rowIdx],
      [editingCell.colKey]: editValue
    };
    setRows(newRows);
    onDataChange?.(newRows);
    setEditingCell(null);
    
    if (tableName) {
      try {
        // Update database - would require row identifiers
        toast.info('Database update not implemented - changes are in-memory only');
      } catch (error: any) {
        console.error('Failed to persist update:', error);
      }
    }
  }, [editingCell, editValue, rows, onDataChange, tableName]);

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
    const newRow: any = {};
    columns.forEach(col => {
      newRow[col] = '';
    });
    const newRows = [...rows, newRow];
    setRows(newRows);
    onDataChange?.(newRows);
    toast.success('Row added');
    
    if (tableName) {
      try {
        const cols = columns.join(', ');
        const values = columns.map(() => 'NULL').join(', ');
        await executeQuery(`INSERT INTO "${tableName}" (${cols}) VALUES (${values})`);
        toast.success('Row saved to database');
      } catch (error: any) {
        console.error('Failed to persist row:', error);
      }
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
    
    if (tableName) {
      try {
        // Delete from database - this would require row identifiers
        toast.info('Database delete not implemented - changes are in-memory only');
      } catch (error: any) {
        console.error('Failed to persist deletion:', error);
      }
    }
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
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
        <Button size="sm" onClick={handleAddRow} variant="default">
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add Row
        </Button>
        <Button size="sm" onClick={handleDeleteRows} variant="outline" disabled={selectedRows.size === 0}>
          <Trash2 className="w-3.5 h-3.5 mr-1" />
          Delete ({selectedRows.size})
        </Button>
        <Button size="sm" onClick={() => setShowColumnDialog(true)} variant="outline">
          <Table2 className="w-3.5 h-3.5 mr-1" />
          Add Column
        </Button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleCopySelection} variant="ghost" disabled={selectedRows.size === 0}>
          <Copy className="w-3.5 h-3.5 mr-1" />
          Copy
        </Button>
        <Button size="sm" onClick={handleExportCSV} variant="ghost">
          <Download className="w-3.5 h-3.5 mr-1" />
          Export
        </Button>
        <div className="text-xs font-medium text-muted-foreground px-2">
          {rows.length.toLocaleString()} × {columns.length}
        </div>
      </div>

      {/* Excel-like Grid */}
      <div className="flex-1 overflow-auto bg-background">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border border-border p-0 w-12 bg-muted font-semibold">
                <input
                  type="checkbox"
                  className="w-4 h-4 mx-auto block"
                  checked={selectedRows.size === rows.length && rows.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              {columns.map((col, idx) => (
                <th 
                  key={col} 
                  className="border border-border px-3 py-2 text-left font-semibold text-xs bg-muted min-w-[150px] select-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono">{String.fromCharCode(65 + idx)}</span>
                    <span className="font-medium">{col}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, pageRowIdx) => {
              const actualRowIdx = currentPage * pageSize + pageRowIdx;
              return (
                <tr key={actualRowIdx} className={selectedRows.has(actualRowIdx) ? 'bg-primary/10' : 'hover:bg-muted/30'}>
                  <td className="border border-border p-0 text-center bg-muted/40 font-mono text-xs text-muted-foreground font-semibold">
                    <div className="flex items-center justify-center h-full p-2">
                      <input
                        type="checkbox"
                        className="w-4 h-4 mr-1"
                        checked={selectedRows.has(actualRowIdx)}
                        onChange={(e) => handleRowSelect(actualRowIdx, e.target.checked)}
                      />
                      {actualRowIdx + 1}
                    </div>
                  </td>
                  {columns.map((col) => (
                    <td 
                      key={col}
                      className="border border-border px-2 py-1 cursor-cell min-w-[150px] max-w-[300px] bg-card hover:bg-accent/5 transition-colors"
                      onClick={() => handleCellClick(pageRowIdx, col)}
                    >
                      {editingCell?.rowIdx === actualRowIdx && editingCell?.colKey === col ? (
                        <Input
                          ref={inputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleCellChange}
                          onKeyDown={handleKeyDown}
                          className="h-8 px-2 text-sm border-2 border-primary focus-visible:ring-0 bg-background"
                        />
                      ) : (
                        <div className="truncate h-8 flex items-center text-sm px-1">
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : ''}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-2 border-t bg-muted/30">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Rows per page:</Label>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(0); }}>
            <SelectTrigger className="h-7 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="250">250</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Page {currentPage + 1} of {totalPages || 1} ({rows.length} total rows)
          </span>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="h-7 w-7 p-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="h-7 w-7 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
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
