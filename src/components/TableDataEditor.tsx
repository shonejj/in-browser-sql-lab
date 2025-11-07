import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { 
  Plus, Trash2, Download, Copy, Table2, ChevronLeft, ChevronRight,
  ArrowUpDown, Filter, X, Save
} from 'lucide-react';
import { toast } from 'sonner';
import { executeQuery } from '@/lib/duckdb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ConfirmDialog } from './ConfirmDialog';
import { PromptDialog } from './PromptDialog';

interface TableDataEditorProps {
  tableName: string;
  onClose: () => void;
}

export function TableDataEditor({ tableName, onClose }: TableDataEditorProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');
  const [filterColumn, setFilterColumn] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState('');
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('VARCHAR');
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Confirmation dialogs
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteColumn, setConfirmDeleteColumn] = useState<string | null>(null);
  const [promptFilter, setPromptFilter] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadTableData();
  }, [tableName, sortColumn, sortDirection, filterColumn, filterValue, currentPage, pageSize]);

  const loadTableData = async () => {
    try {
      setLoading(true);
      
      // Build query with sorting and filtering - include ROWID for updates
      let query = `SELECT ROWID, * FROM "${tableName}"`;
      
      if (filterColumn && filterValue) {
        query += ` WHERE "${filterColumn}" LIKE '%${filterValue.replace(/'/g, "''")}%'`;
      }
      
      if (sortColumn) {
        query += ` ORDER BY "${sortColumn}" ${sortDirection}`;
      }
      
      query += ` LIMIT ${pageSize} OFFSET ${currentPage * pageSize}`;
      
      const result = await executeQuery(query);
      setRows(result);
      
      if (result.length > 0) {
        setColumns(Object.keys(result[0]).filter(k => k !== 'ROWID'));
      } else {
        // Get column names from table schema
        const schemaResult = await executeQuery(`PRAGMA table_info('${tableName}')`);
        setColumns(schemaResult.map((col: any) => col.name));
      }
    } catch (error: any) {
      console.error('Failed to load table data:', error);
      toast.error(`Failed to load data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

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

  const handleCellChange = useCallback(async () => {
    if (!editingCell) return;
    
    const row = rows[editingCell.rowIdx];
    const rowid = row.ROWID;
    
    if (!rowid) {
      toast.error('Cannot update row: ROWID not found');
      setEditingCell(null);
      return;
    }
    
    // Update local state first
    const newRows = [...rows];
    newRows[editingCell.rowIdx] = {
      ...newRows[editingCell.rowIdx],
      [editingCell.colKey]: editValue
    };
    setRows(newRows);
    setEditingCell(null);
    
    // Try to update database using ROWID
    try {
      const newValue = editValue === '' ? 'NULL' : 
                      typeof editValue === 'string' ? `'${editValue.replace(/'/g, "''")}'` : 
                      editValue;
      
      await executeQuery(
        `UPDATE "${tableName}" SET "${editingCell.colKey}" = ${newValue} WHERE ROWID = ${rowid}`
      );
      
      toast.success('Cell updated');
    } catch (error: any) {
      console.error('Failed to update cell:', error);
      toast.error(`Failed to update: ${error.message}`);
      // Revert local change
      await loadTableData();
    }
  }, [editingCell, editValue, rows, tableName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellChange();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortColumn(column);
      setSortDirection('ASC');
    }
    setCurrentPage(0);
  };

  const handleFilter = (column: string, value: string) => {
    setFilterColumn(column);
    setFilterValue(value);
    setCurrentPage(0);
  };

  const handleAddRow = async () => {
    try {
      await executeQuery(`INSERT INTO "${tableName}" DEFAULT VALUES`);
      toast.success('Row added');
      await loadTableData();
    } catch (error: any) {
      toast.error(`Failed to add row: ${error.message}`);
    }
  };

  const handleDeleteRows = async () => {
    try {
      // Delete each selected row using ROWID
      for (const idx of Array.from(selectedRows)) {
        const row = rows[idx];
        const rowid = row.ROWID;
        
        if (rowid) {
          await executeQuery(`DELETE FROM "${tableName}" WHERE ROWID = ${rowid}`);
        }
      }
      
      setSelectedRows(new Set());
      setConfirmDelete(false);
      toast.success(`Deleted ${selectedRows.size} row(s)`);
      await loadTableData();
    } catch (error: any) {
      toast.error(`Failed to delete rows: ${error.message}`);
    }
  };

  const handleAddColumn = async () => {
    if (!newColumnName.trim()) {
      toast.error('Column name is required');
      return;
    }

    try {
      await executeQuery(`ALTER TABLE "${tableName}" ADD COLUMN "${newColumnName}" ${newColumnType}`);
      setShowAddColumnDialog(false);
      setNewColumnName('');
      toast.success('Column added');
      await loadTableData();
    } catch (error: any) {
      toast.error(`Failed to add column: ${error.message}`);
    }
  };

  const handleDeleteColumn = async () => {
    if (!confirmDeleteColumn) return;
    
    if (columns.length === 1) {
      toast.error('Cannot delete the last column');
      setConfirmDeleteColumn(null);
      return;
    }

    try {
      await executeQuery(`ALTER TABLE "${tableName}" DROP COLUMN "${confirmDeleteColumn}"`);
      toast.success('Column deleted');
      await loadTableData();
    } catch (error: any) {
      toast.error(`Failed to delete column: ${error.message}`);
    } finally {
      setConfirmDeleteColumn(null);
    }
  };

  const handleExportCSV = async () => {
    try {
      const allData = await executeQuery(`SELECT * FROM "${tableName}"`);
      const headers = columns.join(',');
      const csvRows = allData.map(row => 
        columns.map(c => JSON.stringify(row[c] ?? '')).join(',')
      );
      const csv = [headers, ...csvRows].join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Exported to CSV');
    } catch (error: any) {
      toast.error(`Export failed: ${error.message}`);
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

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center justify-between">
            <span>Table Editor: {tableName}</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 p-2 border-b bg-muted/30">
            <Button size="sm" onClick={handleAddRow} variant="default">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Row
            </Button>
            <Button 
              size="sm" 
              onClick={() => selectedRows.size > 0 && setConfirmDelete(true)} 
              variant="outline" 
              disabled={selectedRows.size === 0}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete ({selectedRows.size})
            </Button>
            <Button size="sm" onClick={() => setShowAddColumnDialog(true)} variant="outline">
              <Table2 className="w-3.5 h-3.5 mr-1" />
              Add Column
            </Button>
            <Button size="sm" onClick={loadTableData} variant="outline">
              Refresh
            </Button>
            <div className="flex-1" />
            <Button size="sm" onClick={handleExportCSV} variant="ghost">
              <Download className="w-3.5 h-3.5 mr-1" />
              Export CSV
            </Button>
            <div className="text-xs font-medium text-muted-foreground px-2">
              {rows.length} × {columns.length}
            </div>
          </div>

          {/* Filter Bar */}
          {filterColumn && (
            <div className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border-b text-sm">
              <Filter className="w-3.5 h-3.5" />
              <span>Filtering: {filterColumn} contains "{filterValue}"</span>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => {
                  setFilterColumn(null);
                  setFilterValue('');
                }}
                className="h-6 w-6 p-0"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto bg-background">
            {loading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading...
              </div>
            ) : (
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
                    {columns.map((col) => (
                      <th 
                        key={col} 
                        className="border border-border px-3 py-2 text-left font-semibold text-xs bg-muted min-w-[150px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{col}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                                <ArrowUpDown className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleSort(col)}>
                                Sort {sortColumn === col && sortDirection === 'ASC' ? 'Desc' : 'Asc'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPromptFilter(col)}>
                                Filter...
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setConfirmDeleteColumn(col)}
                                className="text-destructive"
                              >
                                Delete Column
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className={selectedRows.has(rowIdx) ? 'bg-primary/10' : 'hover:bg-muted/30'}>
                      <td className="border border-border p-0 text-center bg-muted/40 font-mono text-xs text-muted-foreground font-semibold">
                        <div className="flex items-center justify-center h-full p-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={selectedRows.has(rowIdx)}
                            onChange={(e) => handleRowSelect(rowIdx, e.target.checked)}
                          />
                        </div>
                      </td>
                      {columns.map((col) => (
                        <td 
                          key={col}
                          className="border border-border px-2 py-1 cursor-cell min-w-[150px] max-w-[300px] bg-card hover:bg-accent/5 transition-colors"
                          onClick={() => handleCellClick(rowIdx, col)}
                        >
                          {editingCell?.rowIdx === rowIdx && editingCell?.colKey === col ? (
                            <Input
                              ref={inputRef}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={handleCellChange}
                              onKeyDown={handleKeyDown}
                              className="h-8 px-2 text-sm border-2 border-primary focus-visible:ring-0"
                            />
                          ) : (
                            <div className="truncate h-8 flex items-center text-sm px-1">
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : ''}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Page {currentPage + 1}
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
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={rows.length < pageSize}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Add Column Dialog */}
        <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
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
                <Button variant="outline" onClick={() => setShowAddColumnDialog(false)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirmation Dialogs */}
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete Rows"
          description={`Are you sure you want to delete ${selectedRows.size} row(s)? This action cannot be undone.`}
          onConfirm={handleDeleteRows}
          confirmText="Delete"
          variant="destructive"
        />

        <ConfirmDialog
          open={!!confirmDeleteColumn}
          onOpenChange={(open) => !open && setConfirmDeleteColumn(null)}
          title="Delete Column"
          description={`Are you sure you want to delete column "${confirmDeleteColumn}"? This action cannot be undone.`}
          onConfirm={handleDeleteColumn}
          confirmText="Delete"
          variant="destructive"
        />

        <PromptDialog
          open={!!promptFilter}
          onOpenChange={(open) => !open && setPromptFilter(null)}
          title={`Filter ${promptFilter}`}
          description="Enter value to filter by (partial match)"
          placeholder="Filter value..."
          onConfirm={(value) => {
            if (promptFilter) {
              handleFilter(promptFilter, value);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
