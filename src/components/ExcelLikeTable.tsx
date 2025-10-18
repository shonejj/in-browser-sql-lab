import { useState, useMemo, useCallback } from 'react';
import { DataGrid, type Column, type RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  Plus, Trash2, Edit2, Save, X, Download, Upload, 
  SortAsc, SortDesc, Filter, Calculator, Table2, Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { executeQuery } from '@/lib/duckdb';

interface ExcelLikeTableProps {
  data: any[];
  tableName?: string;
  onDataChange?: (newData: any[]) => void;
}

function TextEditor({ row, column, onRowChange, onClose }: RenderEditCellProps<any>) {
  const [value, setValue] = useState(row[column.key as string] ?? '');
  
  return (
    <Input
      className="h-full w-full border-0 rounded-none focus:ring-2 focus:ring-primary"
      autoFocus
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onRowChange({ ...row, [column.key]: e.target.value });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          onClose(true);
        } else if (e.key === 'Escape') {
          onClose(false);
        }
      }}
    />
  );
}

export function ExcelLikeTable({ data, tableName, onDataChange }: ExcelLikeTableProps) {
  const [rows, setRows] = useState(data);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [sortColumns, setSortColumns] = useState<Array<{ columnKey: string; direction: 'ASC' | 'DESC' }>>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('VARCHAR');
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Generate columns from data
  const columns: Column<any>[] = useMemo(() => {
    if (!rows.length) return [];
    
    const keys = Object.keys(rows[0]);
    return keys.map(key => ({
      key,
      name: key,
      resizable: true,
      sortable: true,
      editable: true,
      renderEditCell: TextEditor,
      renderHeaderCell: (props) => (
        <div className="flex items-center justify-between w-full px-2 gap-1">
          <span className="font-medium truncate flex-1">{props.column.name}</span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleSortColumn(key);
              }}
            >
              {sortColumns.find(s => s.columnKey === key)?.direction === 'DESC' ? (
                <SortDesc className="w-3 h-3" />
              ) : (
                <SortAsc className="w-3 h-3" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={(e) => {
                e.stopPropagation();
                setEditingColumn(key);
                setRenameValue(key);
              }}
            >
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteColumn(key);
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ),
    }));
  }, [rows, sortColumns]);

  const handleSortColumn = (columnKey: string) => {
    const existing = sortColumns.find(s => s.columnKey === columnKey);
    let newSort;
    
    if (!existing) {
      newSort = [...sortColumns, { columnKey, direction: 'ASC' as const }];
    } else if (existing.direction === 'ASC') {
      newSort = sortColumns.map(s => 
        s.columnKey === columnKey ? { ...s, direction: 'DESC' as const } : s
      );
    } else {
      newSort = sortColumns.filter(s => s.columnKey !== columnKey);
    }
    
    setSortColumns(newSort);
  };

  const sortedRows = useMemo(() => {
    if (!sortColumns.length) return rows;
    
    return [...rows].sort((a, b) => {
      for (const sort of sortColumns) {
        const aVal = a[sort.columnKey];
        const bVal = b[sort.columnKey];
        
        if (aVal === bVal) continue;
        
        const comparison = aVal < bVal ? -1 : 1;
        return sort.direction === 'ASC' ? comparison : -comparison;
      }
      return 0;
    });
  }, [rows, sortColumns]);

  const handleRowsChange = useCallback((newRows: any[]) => {
    setRows(newRows);
    onDataChange?.(newRows);
  }, [onDataChange]);

  const handleAddRow = async () => {
    if (!tableName) {
      const newRow: any = {};
      columns.forEach(col => {
        newRow[col.key] = '';
      });
      const newRows = [...rows, newRow];
      setRows(newRows);
      onDataChange?.(newRows);
      toast.success('Row added');
      return;
    }

    try {
      const cols = columns.map(c => c.key).join(', ');
      const values = columns.map(() => 'NULL').join(', ');
      await executeQuery(`INSERT INTO "${tableName}" (${cols}) VALUES (${values})`);
      
      // Refresh data
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

  const handleDeleteColumn = async (columnKey: string) => {
    const confirm = window.confirm(`Delete column "${columnKey}"?`);
    if (!confirm) return;

    if (!tableName) {
      const newRows = rows.map(row => {
        const { [columnKey]: _, ...rest } = row;
        return rest;
      });
      setRows(newRows);
      onDataChange?.(newRows);
      toast.success('Column deleted');
      return;
    }

    try {
      await executeQuery(`ALTER TABLE "${tableName}" DROP COLUMN "${columnKey}"`);
      const result = await executeQuery(`SELECT * FROM "${tableName}"`);
      setRows(result);
      onDataChange?.(result);
      toast.success('Column deleted from database');
    } catch (error: any) {
      toast.error('Failed to delete column: ' + error.message);
    }
  };

  const handleRenameColumn = async () => {
    if (!editingColumn || !renameValue.trim()) return;

    if (!tableName) {
      const newRows = rows.map(row => {
        const { [editingColumn]: value, ...rest } = row;
        return { ...rest, [renameValue]: value };
      });
      setRows(newRows);
      onDataChange?.(newRows);
      setEditingColumn(null);
      toast.success('Column renamed');
      return;
    }

    try {
      await executeQuery(`ALTER TABLE "${tableName}" RENAME COLUMN "${editingColumn}" TO "${renameValue}"`);
      const result = await executeQuery(`SELECT * FROM "${tableName}"`);
      setRows(result);
      onDataChange?.(result);
      setEditingColumn(null);
      toast.success('Column renamed in database');
    } catch (error: any) {
      toast.error('Failed to rename column: ' + error.message);
    }
  };

  const handleExportCSV = () => {
    const headers = columns.map(c => c.key).join(',');
    const csvRows = rows.map(row => 
      columns.map(c => JSON.stringify(row[c.key] ?? '')).join(',')
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
    const headers = columns.map(c => c.key).join('\t');
    const dataRows = selectedData.map(row => 
      columns.map(c => row[c.key] ?? '').join('\t')
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

      {/* Excel Grid */}
      <div className="flex-1 overflow-hidden">
        <DataGrid
          columns={columns}
          rows={sortedRows}
          onRowsChange={handleRowsChange}
          selectedRows={selectedRows}
          onSelectedRowsChange={setSelectedRows}
          rowKeyGetter={(row) => sortedRows.indexOf(row)}
          className="rdg-light fill-grid"
          style={{ height: '100%' }}
          rowHeight={35}
          headerRowHeight={40}
        />
      </div>

      {/* Add Column Dialog */}
      <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Column</DialogTitle>
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

      {/* Rename Column Dialog */}
      <Dialog open={!!editingColumn} onOpenChange={(open) => !open && setEditingColumn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Name</Label>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="new_column_name"
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleRenameColumn} className="flex-1">Rename</Button>
              <Button variant="outline" onClick={() => setEditingColumn(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
