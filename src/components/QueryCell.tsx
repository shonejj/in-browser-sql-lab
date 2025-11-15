import { useState } from 'react';
import { QueryEditor } from './QueryEditor';
import { ResultsTable } from './ResultsTable';
import { PivotTableBuilder } from './PivotTableBuilder';
import { ChartBuilder } from './ChartBuilder';
import { DataVisualization } from './DataVisualization';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ChevronDown, ChevronRight, MoreVertical, Table2, BarChart3, LineChart, TableProperties, Edit, Copy, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner';

interface QueryCellProps {
  id: string;
  query: string;
  results: any[];
  isExecuting: boolean;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
  onDelete: () => void;
  showDelete: boolean;
  onDataChange?: (data: any[]) => void;
  onColumnClick?: (column: string) => void;
  selectedColumn?: string;
  onOpenTableEditor?: () => void;
}

export function QueryCell({
  id,
  query,
  results,
  isExecuting,
  onQueryChange,
  onExecute,
  onDelete,
  showDelete,
  onDataChange,
  onColumnClick,
  selectedColumn,
  onOpenTableEditor,
}: QueryCellProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [cellTitle, setCellTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentView, setCurrentView] = useState<'table' | 'pivot' | 'chart' | 'quick-chart'>('table');

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(query);
    toast.success('Query copied to clipboard');
  };

  const handleClearQuery = () => {
    onQueryChange('');
    toast.success('Query cleared');
  };

  return (
    <Card className="overflow-hidden">
      {/* Cell Header with Title */}
      <div 
        className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border cursor-pointer hover:bg-muted/50"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
          <div onClick={() => setIsCollapsed(!isCollapsed)} className="cursor-pointer">
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
          {isEditingTitle ? (
            <Input
              value={cellTitle}
              onChange={(e) => setCellTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsEditingTitle(false);
                if (e.key === 'Escape') {
                  setCellTitle('');
                  setIsEditingTitle(false);
                }
              }}
              placeholder="Cell title..."
              className="h-6 text-sm w-64"
              autoFocus
            />
          ) : (
            <span 
              className="text-sm font-medium hover:underline" 
              onClick={() => setIsEditingTitle(true)}
            >
              {cellTitle || 'Query Cell'} {results.length > 0 && `(${results.length.toLocaleString()} rows)`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
              <DropdownMenuItem onClick={handleCopyQuery} className="cursor-pointer">
                <Copy className="w-4 h-4 mr-2" />
                Copy Query
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClearQuery} className="cursor-pointer">
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Query
              </DropdownMenuItem>
              {showDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Cell
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="p-4 space-y-4">
          {/* Query Editor */}
          <QueryEditor
            query={query}
            onQueryChange={onQueryChange}
            onExecute={onExecute}
            isExecuting={isExecuting}
          />

          {/* Results Section - Also Collapsible */}
          {results.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">
                  Viewing: {currentView === 'table' ? 'Table View' : currentView === 'pivot' ? 'Pivot Table' : currentView === 'chart' ? 'Chart Builder' : 'Quick Chart'}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      <MoreVertical className="w-3 h-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover z-50">
                    <DropdownMenuItem onClick={() => setCurrentView('table')} className="cursor-pointer">
                      <Table2 className="w-4 h-4 mr-2" />
                      Table View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCurrentView('pivot')} className="cursor-pointer">
                      <TableProperties className="w-4 h-4 mr-2" />
                      Pivot Table
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCurrentView('chart')} className="cursor-pointer">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Chart Builder
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setCurrentView('quick-chart')} className="cursor-pointer">
                      <LineChart className="w-4 h-4 mr-2" />
                      Quick Chart
                    </DropdownMenuItem>
                    {onOpenTableEditor && results.length > 0 && (
                      <DropdownMenuItem onClick={onOpenTableEditor} className="cursor-pointer">
                        <Edit className="w-4 h-4 mr-2" />
                        Table Editor
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* View Content */}
              {currentView === 'table' && (
                <ResultsTable data={results} onColumnClick={onColumnClick} />
              )}
              {currentView === 'pivot' && (
                <PivotTableBuilder data={results} />
              )}
              {currentView === 'chart' && (
                <ChartBuilder data={results} />
              )}
              {currentView === 'quick-chart' && (
                <DataVisualization 
                  data={results} 
                  selectedColumn={selectedColumn || (results.length > 0 ? Object.keys(results[0])[0] : undefined)} 
                />
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
