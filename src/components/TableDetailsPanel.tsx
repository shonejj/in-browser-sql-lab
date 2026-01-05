import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { executeQuery } from '@/lib/duckdb';
import { toast } from 'sonner';
import { Copy, Table2, Code, BarChart3, FileText, Columns, Database } from 'lucide-react';

interface TableDetailsPanelProps {
  tableName: string;
  onClose: () => void;
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ColumnStats {
  column: string;
  type: string;
  nullCount: number;
  distinctCount: number;
  min?: any;
  max?: any;
  avg?: number;
}

export function TableDetailsPanel({ tableName, onClose }: TableDetailsPanelProps) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [ddl, setDdl] = useState<string>('');
  const [rowCount, setRowCount] = useState<number>(0);
  const [stats, setStats] = useState<ColumnStats[]>([]);
  const [sampleData, setSampleData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTableDetails();
  }, [tableName]);

  const loadTableDetails = async () => {
    try {
      setLoading(true);

      // Get columns info
      const columnsResult = await executeQuery(`PRAGMA table_info('${tableName}')`);
      setColumns(columnsResult);

      // Get row count
      const countResult = await executeQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
      setRowCount(Number(countResult[0]?.count || 0));

      // Generate DDL
      const colDefs = columnsResult.map((col: ColumnInfo) => {
        let def = `  "${col.name}" ${col.type}`;
        if (col.notnull) def += ' NOT NULL';
        if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
        if (col.pk) def += ' PRIMARY KEY';
        return def;
      }).join(',\n');
      setDdl(`CREATE TABLE "${tableName}" (\n${colDefs}\n);`);

      // Get sample data (first 10 rows)
      const sample = await executeQuery(`SELECT * FROM "${tableName}" LIMIT 10`);
      setSampleData(sample);

      // Get column statistics
      const statsPromises = columnsResult.map(async (col: ColumnInfo) => {
        try {
          const nullQuery = await executeQuery(
            `SELECT COUNT(*) as null_count FROM "${tableName}" WHERE "${col.name}" IS NULL`
          );
          const distinctQuery = await executeQuery(
            `SELECT COUNT(DISTINCT "${col.name}") as distinct_count FROM "${tableName}"`
          );

          let min, max, avg;
          const isNumeric = col.type.toLowerCase().includes('int') ||
            col.type.toLowerCase().includes('double') ||
            col.type.toLowerCase().includes('float') ||
            col.type.toLowerCase().includes('decimal');

          if (isNumeric) {
            const minMaxAvg = await executeQuery(
              `SELECT MIN("${col.name}") as min_val, MAX("${col.name}") as max_val, AVG("${col.name}") as avg_val FROM "${tableName}"`
            );
            min = minMaxAvg[0]?.min_val;
            max = minMaxAvg[0]?.max_val;
            avg = minMaxAvg[0]?.avg_val;
          } else {
            const minMax = await executeQuery(
              `SELECT MIN("${col.name}") as min_val, MAX("${col.name}") as max_val FROM "${tableName}"`
            );
            min = minMax[0]?.min_val;
            max = minMax[0]?.max_val;
          }

          return {
            column: col.name,
            type: col.type,
            nullCount: Number(nullQuery[0]?.null_count || 0),
            distinctCount: Number(distinctQuery[0]?.distinct_count || 0),
            min,
            max,
            avg
          };
        } catch {
          return {
            column: col.name,
            type: col.type,
            nullCount: 0,
            distinctCount: 0
          };
        }
      });

      const statsResults = await Promise.all(statsPromises);
      setStats(statsResults);

    } catch (error: any) {
      console.error('Failed to load table details:', error);
      toast.error(`Failed to load details: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            {tableName}
            <span className="text-sm font-normal text-muted-foreground ml-2">
              {rowCount.toLocaleString()} rows • {columns.length} columns
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="columns" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="columns" className="gap-1.5">
              <Columns className="w-3.5 h-3.5" />
              Columns
            </TabsTrigger>
            <TabsTrigger value="statistics" className="gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Statistics
            </TabsTrigger>
            <TabsTrigger value="ddl" className="gap-1.5">
              <Code className="w-3.5 h-3.5" />
              DDL
            </TabsTrigger>
            <TabsTrigger value="sample" className="gap-1.5">
              <Table2 className="w-3.5 h-3.5" />
              Sample
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : (
            <>
              <TabsContent value="columns" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">#</th>
                        <th className="text-left p-2 font-medium">Column Name</th>
                        <th className="text-left p-2 font-medium">Data Type</th>
                        <th className="text-left p-2 font-medium">Not Null</th>
                        <th className="text-left p-2 font-medium">Default</th>
                        <th className="text-left p-2 font-medium">Key</th>
                      </tr>
                    </thead>
                    <tbody>
                      {columns.map((col, idx) => (
                        <tr key={col.name} className="border-b hover:bg-muted/50">
                          <td className="p-2 text-muted-foreground">{idx + 1}</td>
                          <td className="p-2 font-mono">{col.name}</td>
                          <td className="p-2 text-muted-foreground">{col.type}</td>
                          <td className="p-2">{col.notnull ? '✓' : ''}</td>
                          <td className="p-2 text-muted-foreground">{col.dflt_value || '-'}</td>
                          <td className="p-2">{col.pk ? 'PK' : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="statistics" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">Column</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-right p-2 font-medium">Nulls</th>
                        <th className="text-right p-2 font-medium">Distinct</th>
                        <th className="text-right p-2 font-medium">Min</th>
                        <th className="text-right p-2 font-medium">Max</th>
                        <th className="text-right p-2 font-medium">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.map((stat) => (
                        <tr key={stat.column} className="border-b hover:bg-muted/50">
                          <td className="p-2 font-mono">{stat.column}</td>
                          <td className="p-2 text-muted-foreground">{stat.type}</td>
                          <td className="p-2 text-right">{stat.nullCount.toLocaleString()}</td>
                          <td className="p-2 text-right">{stat.distinctCount.toLocaleString()}</td>
                          <td className="p-2 text-right font-mono text-xs">
                            {stat.min !== undefined ? String(stat.min).slice(0, 20) : '-'}
                          </td>
                          <td className="p-2 text-right font-mono text-xs">
                            {stat.max !== undefined ? String(stat.max).slice(0, 20) : '-'}
                          </td>
                          <td className="p-2 text-right font-mono text-xs">
                            {stat.avg !== undefined ? stat.avg.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="ddl" className="flex-1 overflow-hidden mt-4">
                <Card className="p-4 relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => copyToClipboard(ddl)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <ScrollArea className="h-[350px]">
                    <pre className="text-sm font-mono whitespace-pre-wrap">{ddl}</pre>
                  </ScrollArea>
                </Card>
              </TabsContent>

              <TabsContent value="sample" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[400px]">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        {columns.map((col) => (
                          <th key={col.name} className="text-left p-2 font-medium border-b whitespace-nowrap">
                            {col.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sampleData.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-muted/50">
                          {columns.map((col) => (
                            <td key={col.name} className="p-2 font-mono text-xs max-w-[200px] truncate">
                              {row[col.name] !== null && row[col.name] !== undefined
                                ? String(row[col.name])
                                : <span className="text-muted-foreground">NULL</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
