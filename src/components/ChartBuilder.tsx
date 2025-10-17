import { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Download, Plus, Trash2, BarChart3, LineChart, PieChart, ScatterChart } from 'lucide-react';
import { toast } from 'sonner';

interface ChartConfig {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie' | 'scatter';
  xAxis?: string;
  yAxis?: string;
  metric?: string;
}

interface ChartBuilderProps {
  data: any[];
}

export function ChartBuilder({ data }: ChartBuilderProps) {
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [newChart, setNewChart] = useState<Partial<ChartConfig>>({
    type: 'bar',
    title: 'New Chart'
  });

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  const handleAddChart = () => {
    if (!newChart.title) {
      toast.error('Please enter a chart title');
      return;
    }

    if (newChart.type === 'pie' && !newChart.metric) {
      toast.error('Please select a metric for pie chart');
      return;
    }

    if (newChart.type !== 'pie' && (!newChart.xAxis || !newChart.yAxis)) {
      toast.error('Please select X and Y axes');
      return;
    }

    const chart: ChartConfig = {
      id: Date.now().toString(),
      title: newChart.title || 'New Chart',
      type: newChart.type || 'bar',
      xAxis: newChart.xAxis,
      yAxis: newChart.yAxis,
      metric: newChart.metric,
    };

    setCharts([...charts, chart]);
    setNewChart({ type: 'bar', title: 'New Chart' });
    toast.success('Chart added');
  };

  const handleDeleteChart = (id: string) => {
    setCharts(charts.filter(c => c.id !== id));
    toast.success('Chart removed');
  };

  const getChartOption = (chart: ChartConfig) => {
    if (!data.length) return {};

    const baseColors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];

    if (chart.type === 'pie' && chart.metric) {
      const counts: Record<string, number> = {};
      data.forEach(row => {
        const key = String(row[chart.metric!]);
        counts[key] = (counts[key] || 0) + 1;
      });

      const pieData = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, value]) => ({ name, value }));

      return {
        title: { text: chart.title, left: 'center' },
        tooltip: { trigger: 'item' },
        legend: { orient: 'vertical', left: 'left', top: 'middle' },
        series: [{
          type: 'pie',
          radius: '60%',
          data: pieData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }]
      };
    }

    if (!chart.xAxis || !chart.yAxis) return {};

    const xValues = data.map(row => String(row[chart.xAxis!])).slice(0, 50);
    const yValues = data.map(row => Number(row[chart.yAxis!]) || 0).slice(0, 50);

    const baseOption = {
      title: { text: chart.title, left: 'center' },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: xValues,
        axisLabel: { rotate: 45, interval: 0 }
      },
      yAxis: { type: 'value' },
    };

    switch (chart.type) {
      case 'bar':
        return {
          ...baseOption,
          series: [{
            type: 'bar',
            data: yValues,
            itemStyle: { color: baseColors[0] }
          }]
        };
      case 'line':
        return {
          ...baseOption,
          series: [{
            type: 'line',
            data: yValues,
            smooth: true,
            itemStyle: { color: baseColors[1] }
          }]
        };
      case 'scatter':
        return {
          ...baseOption,
          series: [{
            type: 'scatter',
            data: yValues,
            itemStyle: { color: baseColors[3] }
          }]
        };
      default:
        return baseOption;
    }
  };

  const handleExportChart = (chart: ChartConfig) => {
    const option = getChartOption(chart);
    const exportData = {
      chart,
      option,
      data: data.slice(0, 100),
      exported_at: new Date().toISOString()
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chart.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chart exported');
  };

  if (!data.length) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        No data available for charts
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Chart Builder */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Create Custom Chart</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Chart Title</Label>
            <Input
              value={newChart.title}
              onChange={(e) => setNewChart({ ...newChart, title: e.target.value })}
              placeholder="Enter chart title"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Chart Type</Label>
            <div className="flex gap-2 mt-1">
              <Button
                variant={newChart.type === 'bar' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewChart({ ...newChart, type: 'bar' })}
              >
                <BarChart3 className="w-3 h-3" />
              </Button>
              <Button
                variant={newChart.type === 'line' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewChart({ ...newChart, type: 'line' })}
              >
                <LineChart className="w-3 h-3" />
              </Button>
              <Button
                variant={newChart.type === 'pie' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewChart({ ...newChart, type: 'pie' })}
              >
                <PieChart className="w-3 h-3" />
              </Button>
              <Button
                variant={newChart.type === 'scatter' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setNewChart({ ...newChart, type: 'scatter' })}
              >
                <ScatterChart className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {newChart.type === 'pie' ? (
            <div>
              <Label className="text-xs">Metric Column</Label>
              <Select value={newChart.metric} onValueChange={(v) => setNewChart({ ...newChart, metric: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map(col => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div>
                <Label className="text-xs">X Axis</Label>
                <Select value={newChart.xAxis} onValueChange={(v) => setNewChart({ ...newChart, xAxis: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select X axis" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Y Axis</Label>
                <Select value={newChart.yAxis} onValueChange={(v) => setNewChart({ ...newChart, yAxis: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Y axis" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map(col => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Button onClick={handleAddChart} className="w-full" size="sm">
            <Plus className="w-3 h-3 mr-2" />
            Add Chart
          </Button>
        </div>
      </Card>

      {/* Charts Display */}
      {charts.map(chart => (
        <Card key={chart.id} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">{chart.title}</h3>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleExportChart(chart)}
              >
                <Download className="w-3 h-3 mr-1" />
                Export
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDeleteChart(chart.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
          <ReactECharts 
            option={getChartOption(chart)} 
            style={{ height: '300px' }}
            opts={{ renderer: 'svg' }}
          />
        </Card>
      ))}
    </div>
  );
}
