import { useState, useMemo } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { X, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { executeQuery } from '@/lib/duckdb';

interface PivotTableBuilderProps {
  data: any[];
  tableName?: string;
}

interface PivotConfig {
  rows: string[];
  columns: string[];
  values: string[];
  aggregation: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
}

export function PivotTableBuilder({ data, tableName }: PivotTableBuilderProps) {
  const [config, setConfig] = useState<PivotConfig>({
    rows: [],
    columns: [],
    values: [],
    aggregation: 'COUNT'
  });
  const [pivotData, setPivotData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const availableColumns = useMemo(() => {
    if (!data.length) return [];
    return Object.keys(data[0]);
  }, [data]);

  const handleAddRow = (col: string) => {
    if (!config.rows.includes(col)) {
      setConfig({ ...config, rows: [...config.rows, col] });
    }
  };

  const handleRemoveRow = (col: string) => {
    setConfig({ ...config, rows: config.rows.filter(c => c !== col) });
  };

  const handleAddColumn = (col: string) => {
    if (!config.columns.includes(col)) {
      setConfig({ ...config, columns: [...config.columns, col] });
    }
  };

  const handleRemoveColumn = (col: string) => {
    setConfig({ ...config, columns: config.columns.filter(c => c !== col) });
  };

  const handleAddValue = (col: string) => {
    if (!config.values.includes(col)) {
      setConfig({ ...config, values: [...config.values, col] });
    }
  };

  const handleRemoveValue = (col: string) => {
    setConfig({ ...config, values: config.values.filter(c => c !== col) });
  };

  const generatePivotQuery = () => {
    if (!tableName || !config.rows.length) {
      return null;
    }

    const rowCols = config.rows.map(r => `"${r}"`).join(', ');
    const valueCols = config.values.length > 0 
      ? config.values.map(v => `${config.aggregation}("${v}") as "${v}_${config.aggregation}"`).join(', ')
      : `${config.aggregation}(*) as count`;

    let query = `SELECT ${rowCols}, ${valueCols} FROM "${tableName}" GROUP BY ${rowCols}`;

    if (config.columns.length > 0) {
      const colCols = config.columns.map(c => `"${c}"`).join(', ');
      query = `SELECT ${rowCols}, ${colCols}, ${valueCols} FROM "${tableName}" GROUP BY ${rowCols}, ${colCols}`;
    }

    query += ` ORDER BY ${rowCols}`;

    return query;
  };

  const handleBuildPivot = async () => {
    if (!config.rows.length) {
      toast.error('Please select at least one row dimension');
      return;
    }

    if (!tableName) {
      // Client-side pivot for non-table data
      const result = buildClientSidePivot();
      setPivotData(result);
      toast.success('Pivot table generated');
      return;
    }

    setLoading(true);
    try {
      const query = generatePivotQuery();
      if (!query) {
        toast.error('Failed to generate pivot query');
        return;
      }

      const result = await executeQuery(query);
      setPivotData(result);
      toast.success('Pivot table generated from database');
    } catch (error: any) {
      toast.error('Failed to build pivot: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const buildClientSidePivot = () => {
    const grouped = new Map<string, any>();

    data.forEach(row => {
      const key = config.rows.map(r => row[r]).join('|');
      
      if (!grouped.has(key)) {
        const groupRow: any = {};
        config.rows.forEach(r => {
          groupRow[r] = row[r];
        });
        
        if (config.values.length > 0) {
          config.values.forEach(v => {
            groupRow[`${v}_${config.aggregation}`] = 0;
          });
        } else {
          groupRow.count = 0;
        }
        
        grouped.set(key, groupRow);
      }

      const current = grouped.get(key)!;
      
      if (config.values.length > 0) {
        config.values.forEach(v => {
          const val = Number(row[v]) || 0;
          const aggKey = `${v}_${config.aggregation}`;
          
          switch (config.aggregation) {
            case 'SUM':
            case 'COUNT':
              current[aggKey] += val;
              break;
            case 'AVG':
              current[aggKey] = (current[aggKey] + val) / 2;
              break;
            case 'MIN':
              current[aggKey] = Math.min(current[aggKey] || val, val);
              break;
            case 'MAX':
              current[aggKey] = Math.max(current[aggKey] || val, val);
              break;
          }
        });
      } else {
        current.count += 1;
      }
    });

    return Array.from(grouped.values());
  };

  const handleExportPivot = () => {
    if (!pivotData.length) {
      toast.error('No pivot data to export');
      return;
    }

    const headers = Object.keys(pivotData[0]).join(',');
    const rows = pivotData.map(row => 
      Object.values(row).map(v => JSON.stringify(v ?? '')).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pivot-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Pivot table exported');
  };

  return (
    <div className="space-y-4">
      {/* Configuration Panel */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Pivot Configuration</h3>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Rows */}
          <div>
            <Label className="text-xs mb-2">Row Dimensions</Label>
            <Select onValueChange={handleAddRow}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Add row dimension" />
              </SelectTrigger>
              <SelectContent>
                {availableColumns.filter(c => !config.rows.includes(c)).map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1 mt-2">
              {config.rows.map(row => (
                <Badge key={row} variant="secondary" className="gap-1">
                  {row}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => handleRemoveRow(row)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Columns */}
          <div>
            <Label className="text-xs mb-2">Column Dimensions (Optional)</Label>
            <Select onValueChange={handleAddColumn}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Add column dimension" />
              </SelectTrigger>
              <SelectContent>
                {availableColumns.filter(c => !config.columns.includes(c)).map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1 mt-2">
              {config.columns.map(col => (
                <Badge key={col} variant="secondary" className="gap-1">
                  {col}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => handleRemoveColumn(col)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Values */}
          <div>
            <Label className="text-xs mb-2">Value Fields</Label>
            <Select onValueChange={handleAddValue}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Add value field" />
              </SelectTrigger>
              <SelectContent>
                {availableColumns.filter(c => !config.values.includes(c)).map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-1 mt-2">
              {config.values.map(val => (
                <Badge key={val} variant="secondary" className="gap-1">
                  {val}
                  <X className="w-3 h-3 cursor-pointer" onClick={() => handleRemoveValue(val)} />
                </Badge>
              ))}
            </div>
          </div>

          {/* Aggregation */}
          <div>
            <Label className="text-xs mb-2">Aggregation</Label>
            <Select value={config.aggregation} onValueChange={(v: any) => setConfig({ ...config, aggregation: v })}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COUNT">Count</SelectItem>
                <SelectItem value="SUM">Sum</SelectItem>
                <SelectItem value="AVG">Average</SelectItem>
                <SelectItem value="MIN">Minimum</SelectItem>
                <SelectItem value="MAX">Maximum</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleBuildPivot} disabled={loading || !config.rows.length}>
            <RefreshCw className={`w-3 h-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Build Pivot
          </Button>
          <Button onClick={handleExportPivot} variant="outline" disabled={!pivotData.length}>
            <Download className="w-3 h-3 mr-2" />
            Export
          </Button>
        </div>
      </Card>

      {/* Pivot Results */}
      {pivotData.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Pivot Results ({pivotData.length} rows)</h3>
          <div className="border rounded overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.keys(pivotData[0]).map(key => (
                    <TableHead key={key} className="font-semibold">{key}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pivotData.map((row, idx) => (
                  <TableRow key={idx}>
                    {Object.values(row).map((val: any, i) => (
                      <TableCell key={i}>{typeof val === 'number' ? val.toLocaleString() : String(val)}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
