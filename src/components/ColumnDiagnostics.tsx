import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart } from 'recharts';
import { Hash, Calendar, Type, Clock, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';
import { PerformanceMonitor } from './PerformanceMonitor';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface ColumnDiagnosticsProps {
  data: any[];
  selectedColumn?: string;
  onColumnSelect?: (column: string) => void;
  cells?: Array<{ id: string; query: string; results: any[] }>;
  selectedCellId?: string;
  onCellSelect?: (cellId: string) => void;
}

export function ColumnDiagnostics({ data, selectedColumn, onColumnSelect, cells = [], selectedCellId, onCellSelect }: ColumnDiagnosticsProps) {
  const columnStats = useMemo(() => {
    if (data.length === 0) return null;

    const columns = Object.keys(data[0]);
    const stats: any = {};

    columns.forEach((col) => {
      const values = data.map((row) => row[col]);
      const nonNullValues = values.filter((v) => v !== null && v !== undefined);
      const uniqueValues = new Set(nonNullValues);

      stats[col] = {
        type: inferType(nonNullValues[0]),
        uniqueCount: uniqueValues.size,
        completeness: (nonNullValues.length / values.length) * 100,
        values: nonNullValues,
      };
    });

    return stats;
  }, [data]);

  const categoryDistribution = useMemo(() => {
    if (!selectedColumn || !columnStats || !columnStats[selectedColumn]) return null;

    const colData = columnStats[selectedColumn];
    if (!colData || colData.type !== 'text') return null;

    const counts: Record<string, number> = {};
    colData.values.forEach((v: any) => {
      const key = String(v);
      counts[key] = (counts[key] || 0) + 1;
    });

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const total = colData.values.length;
    return sorted.map(([name, count], idx) => ({
      name,
      count,
      percentage: ((count / total) * 100).toFixed(1),
      fill: `hsl(var(--chart-${(idx % 5) + 1}))`,
    }));
  }, [selectedColumn, columnStats]);

  const timeSeriesData = useMemo(() => {
    if (!selectedColumn || !columnStats || !columnStats[selectedColumn]) return null;

    const colData = columnStats[selectedColumn];
    if (!colData || colData.type !== 'date') return null;

    const dateCounts: Record<string, number> = {};
    colData.values.forEach((v: any) => {
      const date = new Date(v).toISOString().split('T')[0];
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    });

    return Object.entries(dateCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count,
      }));
  }, [selectedColumn, columnStats]);

  function inferType(value: any): string {
    if (value === null || value === undefined) return 'unknown';
    if (typeof value === 'number') return 'number';
    if (value instanceof Date || !isNaN(Date.parse(value))) return 'date';
    if (typeof value === 'string' && value.includes(':')) return 'time';
    return 'text';
  }

  const getColumnIcon = (type: string) => {
    if (type === 'number') return <Hash className="w-3 h-3" />;
    if (type === 'date') return <Calendar className="w-3 h-3" />;
    if (type === 'time') return <Clock className="w-3 h-3" />;
    return <Type className="w-3 h-3" />;
  };

  const cellsWithResults = cells.filter(c => c.results && c.results.length > 0);

  if (!columnStats) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        Run a query to view column diagnostics
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Performance Monitor */}
      <PerformanceMonitor />
      
      {/* Header */}
      <div className="p-4 border-b border-panel-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between h-8 text-xs font-normal mb-3">
              <span className="truncate">
                {selectedCellId && cells.find(c => c.id === selectedCellId)
                  ? `Cell ${cells.findIndex(c => c.id === selectedCellId) + 1}`
                  : 'Current Cell'}
              </span>
              <ChevronDown className="w-3 h-3 ml-2 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {cellsWithResults.map((cell, idx) => (
              <DropdownMenuItem
                key={cell.id}
                onClick={() => onCellSelect?.(cell.id)}
                className="cursor-pointer"
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <span className="text-sm font-medium">Cell {idx + 1}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {cell.query.substring(0, 40)}...
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {cell.results.length} rows
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
            {cellsWithResults.length === 0 && (
              <DropdownMenuItem disabled>
                No results to display
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        
        <div className="text-xs">
          <div className="font-semibold text-foreground">{data.length.toLocaleString()} Rows</div>
          <div className="text-muted-foreground mt-0.5">{Object.keys(columnStats).length} Columns</div>
        </div>
      </div>

      {/* Column List */}
      <div className="p-4 space-y-2">
        {Object.entries(columnStats).map(([col, stats]: [string, any]) => (
          <div
            key={col}
            onClick={() => onColumnSelect?.(col)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-xs transition-colors ${
              selectedColumn === col ? 'bg-primary/10 border border-primary/20' : ''
            }`}
          >
            <span className="text-muted-foreground">{getColumnIcon(stats.type)}</span>
            <span className="flex-1 font-medium">{col}</span>
            {stats.uniqueCount < 100 && (
              <span className="text-xs text-muted-foreground">{stats.uniqueCount}</span>
            )}
          </div>
        ))}
      </div>

      {/* Selected Column Details */}
      {selectedColumn && columnStats[selectedColumn] && (
        <div className="p-4 border-t border-panel-border">
          <div className="text-xs font-semibold mb-3">{selectedColumn}</div>

          {/* Category Distribution */}
          {categoryDistribution && (
            <div className="space-y-2">
              {categoryDistribution.map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate flex-1">{item.name}</span>
                    <span className="text-muted-foreground ml-2">{item.percentage}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${item.percentage}%`,
                          backgroundColor: item.fill,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-12 text-right">
                      {(item.count / 1000).toFixed(1)}k
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Time Series Chart */}
          {timeSeriesData && timeSeriesData.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium mb-2">Distribution over time</div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    fill="url(#colorCount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-2 text-[10px] text-muted-foreground">
                about {timeSeriesData.length} days • bucketed by day
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="mt-4 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completeness</span>
              <span className="font-medium">{columnStats[selectedColumn].completeness.toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unique values</span>
              <span className="font-medium">{columnStats[selectedColumn].uniqueCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
