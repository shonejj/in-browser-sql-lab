import { useState } from 'react';
import { Database, Table2, ChevronRight, ChevronDown, Plus, Search, Copy, MoreHorizontal, BarChart3, Calendar, Hash, Type, Clock, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { CSVImporter } from './CSVImporter';

interface Column {
  name: string;
  type: string;
  uniqueCount?: number;
  completeness?: number;
}

interface DatabaseSidebarProps {
  tables: Array<{ name: string; rowCount: number; columns: Column[] }>;
  onTableClick: (tableName: string) => void;
  onImportCSV: (tableName: string, data: any[], columns: string[]) => Promise<void>;
  onRefresh?: () => void;
}

export function DatabaseSidebar({ tables, onTableClick, onImportCSV, onRefresh }: DatabaseSidebarProps) {
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set(['memory']));
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set(['trains']));

  const toggleDatabase = (name: string) => {
    const newExpanded = new Set(expandedDatabases);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
    setExpandedDatabases(newExpanded);
  };

  const toggleTable = (name: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(name)) {
      newExpanded.delete(name);
    } else {
      newExpanded.add(name);
    }
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
    // Convert BigInt to Number to avoid "Cannot mix BigInt and other types" errors
    const numCount = typeof count === 'bigint' ? Number(count) : count;
    if (numCount >= 1000000) return `${(numCount / 1000000).toFixed(1)}M`;
    if (numCount >= 1000) return `${(numCount / 1000).toFixed(1)}k`;
    return numCount.toString();
  };

  return (
    <div className="w-64 bg-sidebar text-sidebar-foreground flex flex-col h-screen border-r border-sidebar-border">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-sidebar-primary" />
          <h1 className="font-semibold text-sm">DuckDB</h1>
        </div>
        
        <Button variant="ghost" className="w-full justify-start text-xs font-normal h-8 text-sidebar-foreground hover:bg-sidebar-accent">
          <span>Notebooks</span>
          <ChevronRight className="w-3 h-3 ml-auto" />
        </Button>
        
        <div className="mt-2 pl-4 text-xs text-sidebar-foreground/80">
          DuckDB UI basics
        </div>
      </div>

      {/* Database Tree */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <div className="flex items-center justify-between px-2 py-1.5 text-xs font-medium text-sidebar-foreground/60">
            <span>Attached databases</span>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <Plus className="w-3 h-3" />
            </Button>
          </div>

          {/* Memory Database */}
          <div className="mt-1">
            <button
              onClick={() => toggleDatabase('memory')}
              className="flex items-center gap-1.5 px-2 py-1.5 w-full hover:bg-sidebar-accent rounded text-xs"
            >
              {expandedDatabases.has('memory') ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <Database className="w-3 h-3 text-sidebar-primary" />
              <span>memory</span>
            </button>

            {expandedDatabases.has('memory') && (
              <div className="ml-4 mt-1">
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-sidebar-foreground/60">
                  <span>main</span>
                </div>

                {tables.map((table) => (
                  <div key={table.name} className="mt-0.5">
                    <button
                      onClick={() => toggleTable(table.name)}
                      className="flex items-center gap-1.5 px-2 py-1.5 w-full hover:bg-sidebar-accent rounded text-xs group"
                    >
                      {expandedTables.has(table.name) ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      <Table2 className="w-3 h-3 text-sidebar-primary" />
                      <span className="flex-1 text-left">{table.name}</span>
                      <span className="text-xs text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70">
                        {formatCount(table.rowCount)} rows
                      </span>
                    </button>

                    {expandedTables.has(table.name) && (
                      <div className="ml-6 mt-1 space-y-1 pb-2">
                        {table.columns.map((col) => (
                          <div
                            key={col.name}
                            className="flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-sidebar-accent rounded cursor-pointer group"
                          >
                            <span className="text-sidebar-foreground/60">{getColumnIcon(col.type)}</span>
                            <span className="flex-1 text-sidebar-foreground/80">{col.name}</span>
                            {col.uniqueCount !== undefined && (
                              <span className="text-[10px] text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70">
                                {formatCount(col.uniqueCount)}
                              </span>
                            )}
                            {col.completeness !== undefined && col.completeness < 100 && (
                              <span className="text-[10px] text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70">
                                {col.completeness}%
                              </span>
                            )}
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
      <div className="p-2 border-t border-sidebar-border flex gap-1">
        <CSVImporter onImport={onImportCSV} />
        {onRefresh && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={onRefresh}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent">
          <Search className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
