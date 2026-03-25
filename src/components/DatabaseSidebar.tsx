import { useState } from 'react';
import { Database, Table2, ChevronRight, ChevronDown, Plus, Copy, BarChart3, Calendar, Hash, Type, Clock, RefreshCw, X, Info, Edit, Download } from 'lucide-react';
import { Button } from './ui/button';
import { CSVImporter } from './CSVImporter';
import { Badge } from './ui/badge';
import { isBackendMode, exportDuckDB } from '@/lib/duckdb';
import { toast } from 'sonner';

interface Column {
  name: string;
  type: string;
  uniqueCount?: number;
  completeness?: number;
}

interface DatabaseSidebarProps {
  tables: Array<{ name: string; rowCount: number; columns: Column[] }>;
  onTableClick: (tableName: string) => void;
  onImportCSV: (tableName: string, data: any[], columns: string[], opts?: { overwrite?: boolean, allVarchar?: boolean }) => Promise<void>;
  onRefresh?: () => void;
  onDeleteTable?: (tableName: string) => void;
  onOpenInEditor?: (tableName: string) => void;
  onImportComplete?: () => void;
  onTableDetails?: (tableName: string) => void;
  onNotebookSelect?: (id: string) => void;
  onOpenFileManager?: () => void;
  onOpenConnectors?: () => void;
  onOpenWorkflows?: () => void;
  onAttachDatabase?: () => void;
}

export function DatabaseSidebar({ tables, onTableClick, onImportCSV, onRefresh, onDeleteTable, onOpenInEditor, onImportComplete, onTableDetails, onNotebookSelect, onOpenFileManager, onOpenConnectors, onOpenWorkflows, onAttachDatabase }: DatabaseSidebarProps) {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set(['memory']));
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleDatabase = (name: string) => {
    const newExpanded = new Set(expandedDatabases);
    if (newExpanded.has(name)) newExpanded.delete(name);
    else newExpanded.add(name);
    setExpandedDatabases(newExpanded);
  };

  const toggleTable = (name: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(name)) newExpanded.delete(name);
    else newExpanded.add(name);
    setExpandedTables(newExpanded);
  };

  const getColumnIcon = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('int') || lowerType.includes('number')) return <Hash className="w-3 h-3" />;
    if (lowerType.includes('date')) return <Calendar className="w-3 h-3" />;
    if (lowerType.includes('time')) return <Clock className="w-3 h-3" />;
    if (lowerType.includes('varchar') || lowerType.includes('text')) return <Type className="w-3 h-3" />;
    return <BarChart3 className="w-3 h-3" />;
  };

  const formatCount = (count: number | bigint) => {
    const numCount = typeof count === 'bigint' ? Number(count) : count;
    if (numCount >= 1000000) return `${(numCount / 1000000).toFixed(1)}M`;
    if (numCount >= 1000) return `${(numCount / 1000).toFixed(1)}k`;
    return numCount.toString();
  };

  const handleDownloadDB = async () => {
    try {
      toast.loading('Exporting database...', { id: 'export' });
      const blob = await exportDuckDB();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = isBackendMode() ? 'duckdb_lab_export.duckdb' : 'duckdb_lab_export.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Database exported!', { id: 'export' });
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`, { id: 'export' });
    }
  };

  const backend = isBackendMode();

  return (
    <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen border-r border-sidebar-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-5 h-5 text-sidebar-primary" />
          <h1 className="font-semibold text-sm">DuckDB Lab</h1>
          <Badge variant={backend ? 'default' : 'secondary'} className="text-[10px] h-4 px-1 ml-auto">
            {backend ? 'Server' : 'WASM'}
          </Badge>
        </div>
        <div className="mt-1 pl-4 text-xs text-sidebar-foreground/80">
          Interactive SQL Workspace
        </div>
      </div>

      {/* Database Tree */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-foreground/60">
            <span>Attached databases</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={onAttachDatabase}
              title={backend ? "Attach external database" : "Attach DuckDB file"}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          <div className="mt-1">
            <button
              onClick={() => toggleDatabase('memory')}
              className="flex items-center gap-1.5 px-2 py-1.5 w-full hover:bg-sidebar-accent rounded text-xs"
            >
              {expandedDatabases.has('memory') ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Database className="w-3 h-3 text-sidebar-primary" />
              <span>{backend ? 'server' : 'memory'}</span>
            </button>

            {expandedDatabases.has('memory') && (
              <div className="ml-4 mt-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-sidebar-foreground/60">
                  <span>main</span>
                </div>

                {tables.length === 0 && (
                  <div className="px-2 py-3 text-xs text-sidebar-foreground/40 text-center">
                    No tables yet. Load sample data or import a file.
                  </div>
                )}

                {tables.map((table) => (
                  <div key={table.name} className="mt-0.5">
                    <div className="flex items-center gap-1 w-full group">
                      <button
                        onClick={() => toggleTable(table.name)}
                        className="flex items-center gap-1.5 px-2 py-1.5 flex-1 min-w-0 hover:bg-sidebar-accent rounded text-xs"
                      >
                        {expandedTables.has(table.name) ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                        <Table2 className="w-3 h-3 shrink-0 text-sidebar-primary" />
                        <span className="flex-1 text-left truncate min-w-0" title={table.name}>{table.name}</span>
                        <span className="text-xs text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70 shrink-0 ml-1">
                          {formatCount(table.rowCount)}
                        </span>
                      </button>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 shrink-0">
                        {onTableDetails && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onTableDetails(table.name)} title="Table Details">
                            <Info className="w-3 h-3" />
                          </Button>
                        )}
                        {onOpenInEditor && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenInEditor(table.name)} title="Edit Table Data">
                            <Edit className="w-3 h-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => {
                          e.stopPropagation();
                          try {
                            navigator.clipboard.writeText(table.name).then(() => toast.success(`Copied "${table.name}"`));
                          } catch {
                            const ta = document.createElement('textarea');
                            ta.value = table.name;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                            toast.success(`Copied "${table.name}"`);
                          }
                        }} title="Copy table name">
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { if (!onDeleteTable) return; const ok = confirm(`Delete table "${table.name}"?`); if (ok) onDeleteTable(table.name); }} title="Delete table">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    {expandedTables.has(table.name) && (
                      <div className="ml-6 mt-1 space-y-1 pb-2">
                        {table.columns.map((col) => (
                          <div key={col.name} className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-sidebar-accent rounded cursor-pointer group min-w-0">
                            <span className="text-sidebar-foreground/60 shrink-0">{getColumnIcon(col.type)}</span>
                            <span className="flex-1 text-sidebar-foreground/80 truncate min-w-0" title={col.name}>{col.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        <div className="flex gap-1 flex-wrap">
          <CSVImporter onImport={onImportCSV} onImportComplete={onImportComplete} />
          <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent" onClick={handleDownloadDB} title="Download Database">
            <Download className="w-3.5 h-3.5" />
          </Button>
          {onRefresh && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent" onClick={onRefresh}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
