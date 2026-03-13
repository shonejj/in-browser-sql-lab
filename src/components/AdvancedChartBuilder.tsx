import { useState, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { ScrollArea } from './ui/scroll-area';
import {
  Download, Plus, Trash2, BarChart3, LineChart, PieChart, ScatterChart,
  TrendingUp, Activity, Gauge, Grid3X3, Settings, Palette
} from 'lucide-react';
import { toast } from 'sonner';

type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'radar' | 'heatmap' | 'funnel' | 'gauge' | 'treemap' | 'boxplot' | 'histogram';
type AggregationType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'none';

interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  xAxis?: string;
  yAxis?: string;
  metric?: string;
  aggregation: AggregationType;
  groupBy?: string;
  showLegend: boolean;
  showDataLabels: boolean;
  smooth: boolean;
  stacked: boolean;
  horizontal: boolean;
  colorScheme: string;
}

interface AdvancedChartBuilderProps {
  data: any[];
}

const COLOR_SCHEMES = {
  default: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'],
  warm: ['#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd'],
  cool: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027'],
  pastel: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2'],
  vibrant: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'],
  earth: ['#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
};

export function AdvancedChartBuilder({ data }: AdvancedChartBuilderProps) {
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const [activeTab, setActiveTab] = useState('builder');
  const chartRefs = useRef<Record<string, any>>({});

  const [newChart, setNewChart] = useState<Partial<ChartConfig>>({
    type: 'bar',
    title: 'New Chart',
    aggregation: 'count',
    showLegend: true,
    showDataLabels: false,
    smooth: true,
    stacked: false,
    horizontal: false,
    colorScheme: 'default'
  });

  const columns = useMemo(() => data.length > 0 ? Object.keys(data[0]) : [], [data]);

  const numericColumns = useMemo(() => {
    if (data.length === 0) return [];
    return columns.filter(col => {
      const val = data.find(row => row[col] !== null && row[col] !== undefined)?.[col];
      return typeof val === 'number';
    });
  }, [data, columns]);

  const categoricalColumns = useMemo(() => {
    if (data.length === 0) return [];
    return columns.filter(col => {
      const val = data.find(row => row[col] !== null && row[col] !== undefined)?.[col];
      return typeof val === 'string';
    });
  }, [data, columns]);

  const handleAddChart = () => {
    if (!newChart.title) {
      toast.error('Please enter a chart title');
      return;
    }

    const requiresMetric = ['pie', 'funnel', 'treemap', 'gauge'].includes(newChart.type || '');
    const requiresAxes = ['bar', 'line', 'scatter', 'area', 'heatmap', 'boxplot', 'histogram'].includes(newChart.type || '');

    if (requiresMetric && !newChart.metric) {
      toast.error('Please select a metric column');
      return;
    }

    if (requiresAxes && newChart.type !== 'histogram' && !newChart.xAxis) {
      toast.error('Please select an X axis column');
      return;
    }

    const chart: ChartConfig = {
      id: Date.now().toString(),
      title: newChart.title || 'New Chart',
      type: newChart.type || 'bar',
      xAxis: newChart.xAxis,
      yAxis: newChart.yAxis,
      metric: newChart.metric,
      aggregation: newChart.aggregation || 'count',
      groupBy: newChart.groupBy,
      showLegend: newChart.showLegend ?? true,
      showDataLabels: newChart.showDataLabels ?? false,
      smooth: newChart.smooth ?? true,
      stacked: newChart.stacked ?? false,
      horizontal: newChart.horizontal ?? false,
      colorScheme: newChart.colorScheme || 'default'
    };

    setCharts([...charts, chart]);
    setNewChart({
      type: 'bar',
      title: 'New Chart',
      aggregation: 'count',
      showLegend: true,
      showDataLabels: false,
      smooth: true,
      stacked: false,
      horizontal: false,
      colorScheme: 'default'
    });
    setActiveTab('charts');
    toast.success('Chart added');
  };

  const handleDeleteChart = (id: string) => {
    setCharts(charts.filter(c => c.id !== id));
    toast.success('Chart removed');
  };

  const handleExportChart = (chartId: string) => {
    const ref = chartRefs.current[chartId];
    if (ref) {
      const echartsInstance = ref.getEchartsInstance();
      const url = echartsInstance.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: '#fff'
      });
      const link = document.createElement('a');
      link.download = `chart-${Date.now()}.png`;
      link.href = url;
      link.click();
      toast.success('Chart exported');
    }
  };

  const aggregateData = (xCol: string, yCol: string | undefined, agg: AggregationType, groupBy?: string) => {
    const groups: Record<string, { values: number[], count: number }> = {};

    data.forEach(row => {
      const key = String(row[xCol] ?? 'NULL');
      if (!groups[key]) {
        groups[key] = { values: [], count: 0 };
      }
      groups[key].count++;
      if (yCol && row[yCol] !== null && row[yCol] !== undefined) {
        groups[key].values.push(Number(row[yCol]) || 0);
      }
    });

    const entries = Object.entries(groups);
    
    return entries.map(([key, group]) => {
      let value: number;
      switch (agg) {
        case 'count':
          value = group.count;
          break;
        case 'sum':
          value = group.values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          value = group.values.length > 0 ? group.values.reduce((a, b) => a + b, 0) / group.values.length : 0;
          break;
        case 'min':
          value = group.values.length > 0 ? Math.min(...group.values) : 0;
          break;
        case 'max':
          value = group.values.length > 0 ? Math.max(...group.values) : 0;
          break;
        default:
          value = group.values[0] || 0;
      }
      return { name: key, value };
    }).sort((a, b) => b.value - a.value).slice(0, 30);
  };

  const getChartOption = (chart: ChartConfig) => {
    if (!data.length) return {};

    const colors = COLOR_SCHEMES[chart.colorScheme as keyof typeof COLOR_SCHEMES] || COLOR_SCHEMES.default;

    const baseOption = {
      color: colors,
      tooltip: { trigger: chart.type === 'pie' ? 'item' : 'axis' },
      legend: chart.showLegend ? { top: 'bottom' } : undefined,
      title: { text: chart.title, left: 'center', textStyle: { fontSize: 14 } },
    };

    // Pie/Funnel/Treemap charts
    if (['pie', 'funnel', 'treemap'].includes(chart.type) && chart.metric) {
      const aggregated = aggregateData(chart.metric, undefined, 'count');

      if (chart.type === 'pie') {
        return {
          ...baseOption,
          series: [{
            type: 'pie',
            radius: ['30%', '60%'],
            data: aggregated,
            label: { show: chart.showDataLabels, formatter: '{b}: {d}%' },
            emphasis: {
              itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' }
            }
          }]
        };
      }

      if (chart.type === 'funnel') {
        return {
          ...baseOption,
          series: [{
            type: 'funnel',
            data: aggregated,
            label: { show: chart.showDataLabels, position: 'inside' }
          }]
        };
      }

      if (chart.type === 'treemap') {
        return {
          ...baseOption,
          series: [{
            type: 'treemap',
            data: aggregated,
            label: { show: true, formatter: '{b}' }
          }]
        };
      }
    }

    // Gauge chart
    if (chart.type === 'gauge' && chart.metric) {
      const values = data.map(row => Number(row[chart.metric!]) || 0);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);

      return {
        ...baseOption,
        series: [{
          type: 'gauge',
          progress: { show: true },
          detail: { formatter: '{value}' },
          data: [{ value: Math.round(avg), name: `Avg ${chart.metric}` }],
          max: Math.ceil(max * 1.2)
        }]
      };
    }

    // Histogram
    if (chart.type === 'histogram' && chart.yAxis) {
      const values = data.map(row => Number(row[chart.yAxis!]) || 0).filter(v => !isNaN(v));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const binCount = 20;
      const binWidth = (max - min) / binCount;
      const bins = new Array(binCount).fill(0);

      values.forEach(v => {
        const binIndex = Math.min(Math.floor((v - min) / binWidth), binCount - 1);
        bins[binIndex]++;
      });

      const categories = bins.map((_, i) => {
        const start = min + i * binWidth;
        return `${start.toFixed(1)}`;
      });

      return {
        ...baseOption,
        xAxis: { type: 'category', data: categories, axisLabel: { rotate: 45 } },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: bins, itemStyle: { color: colors[0] } }]
      };
    }

    // Radar chart
    if (chart.type === 'radar' && chart.metric) {
      const aggregated = aggregateData(chart.metric, undefined, 'count').slice(0, 8);
      const maxValue = Math.max(...aggregated.map(d => d.value));

      return {
        ...baseOption,
        radar: {
          indicator: aggregated.map(d => ({ name: d.name, max: maxValue }))
        },
        series: [{
          type: 'radar',
          data: [{ value: aggregated.map(d => d.value), name: chart.metric }]
        }]
      };
    }

    // Bar/Line/Area/Scatter charts
    if (!chart.xAxis) return baseOption;

    const aggregated = aggregateData(chart.xAxis, chart.yAxis, chart.aggregation);
    const categories = aggregated.map(d => d.name);
    const values = aggregated.map(d => d.value);

    const axisConfig = chart.horizontal ? {
      yAxis: { type: 'category', data: categories },
      xAxis: { type: 'value' }
    } : {
      xAxis: { type: 'category', data: categories, axisLabel: { rotate: 45, interval: 0 } },
      yAxis: { type: 'value' }
    };

    switch (chart.type) {
      case 'bar':
        return {
          ...baseOption,
          ...axisConfig,
          series: [{
            type: 'bar',
            data: values,
            stack: chart.stacked ? 'total' : undefined,
            label: { show: chart.showDataLabels, position: 'top' }
          }]
        };

      case 'line':
        return {
          ...baseOption,
          ...axisConfig,
          series: [{
            type: 'line',
            data: values,
            smooth: chart.smooth,
            label: { show: chart.showDataLabels, position: 'top' }
          }]
        };

      case 'area':
        return {
          ...baseOption,
          ...axisConfig,
          series: [{
            type: 'line',
            data: values,
            smooth: chart.smooth,
            areaStyle: { opacity: 0.6 },
            label: { show: chart.showDataLabels, position: 'top' }
          }]
        };

      case 'scatter':
        return {
          ...baseOption,
          ...axisConfig,
          series: [{
            type: 'scatter',
            data: values,
            symbolSize: 10
          }]
        };

      case 'heatmap':
        // Simple heatmap based on x and y axes
        const heatmapData: [number, number, number][] = [];
        const xCategories = [...new Set(data.map(row => String(row[chart.xAxis!])))].slice(0, 20);
        const yCategories = chart.yAxis ? [...new Set(data.map(row => String(row[chart.yAxis!])))].slice(0, 20) : xCategories;

        xCategories.forEach((x, xi) => {
          yCategories.forEach((y, yi) => {
            const count = data.filter(row => String(row[chart.xAxis!]) === x && String(row[chart.yAxis!]) === y).length;
            heatmapData.push([xi, yi, count]);
          });
        });

        return {
          ...baseOption,
          xAxis: { type: 'category', data: xCategories },
          yAxis: { type: 'category', data: yCategories },
          visualMap: {
            min: 0,
            max: Math.max(...heatmapData.map(d => d[2])),
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: 0
          },
          series: [{
            type: 'heatmap',
            data: heatmapData,
            label: { show: chart.showDataLabels }
          }]
        };

      default:
        return baseOption;
    }
  };

  if (!data.length) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-20" />
        <p>No data available for charts</p>
        <p className="text-xs mt-1">Run a query to visualize results</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="builder" className="gap-1.5">
            <Settings className="w-3.5 h-3.5" />
            Builder
          </TabsTrigger>
          <TabsTrigger value="charts" className="gap-1.5">
            <Grid3X3 className="w-3.5 h-3.5" />
            Charts ({charts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create New Chart
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Title */}
              <div className="col-span-2">
                <Label className="text-xs">Chart Title</Label>
                <Input
                  value={newChart.title}
                  onChange={(e) => setNewChart({ ...newChart, title: e.target.value })}
                  placeholder="Enter chart title"
                  className="mt-1"
                />
              </div>

              {/* Chart Type */}
              <div className="col-span-2">
                <Label className="text-xs mb-2 block">Chart Type</Label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { type: 'bar', icon: BarChart3, label: 'Bar' },
                    { type: 'line', icon: LineChart, label: 'Line' },
                    { type: 'area', icon: TrendingUp, label: 'Area' },
                    { type: 'pie', icon: PieChart, label: 'Pie' },
                    { type: 'scatter', icon: ScatterChart, label: 'Scatter' },
                    { type: 'radar', icon: Activity, label: 'Radar' },
                    { type: 'funnel', icon: TrendingUp, label: 'Funnel' },
                    { type: 'heatmap', icon: Grid3X3, label: 'Heatmap' },
                    { type: 'histogram', icon: BarChart3, label: 'Histogram' },
                    { type: 'gauge', icon: Gauge, label: 'Gauge' },
                    { type: 'treemap', icon: Grid3X3, label: 'Treemap' },
                  ].map(({ type, icon: Icon, label }) => (
                    <Button
                      key={type}
                      variant={newChart.type === type ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setNewChart({ ...newChart, type: type as ChartType })}
                      className="h-8 text-xs"
                    >
                      <Icon className="w-3 h-3 mr-1" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Column Selection based on chart type */}
              {['pie', 'funnel', 'treemap', 'radar', 'gauge'].includes(newChart.type || '') ? (
                <div className="col-span-2">
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
              ) : newChart.type === 'histogram' ? (
                <div className="col-span-2">
                  <Label className="text-xs">Numeric Column</Label>
                  <Select value={newChart.yAxis} onValueChange={(v) => setNewChart({ ...newChart, yAxis: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <Label className="text-xs">X Axis (Category)</Label>
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
                    <Label className="text-xs">Y Axis (Value)</Label>
                    <Select value={newChart.yAxis || '__none__'} onValueChange={(v) => setNewChart({ ...newChart, yAxis: v === '__none__' ? undefined : v })}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Optional - for aggregation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Count only</SelectItem>
                        {numericColumns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Aggregation</Label>
                    <Select
                      value={newChart.aggregation}
                      onValueChange={(v) => setNewChart({ ...newChart, aggregation: v as AggregationType })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">Count</SelectItem>
                        <SelectItem value="sum">Sum</SelectItem>
                        <SelectItem value="avg">Average</SelectItem>
                        <SelectItem value="min">Minimum</SelectItem>
                        <SelectItem value="max">Maximum</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Color Scheme</Label>
                    <Select
                      value={newChart.colorScheme}
                      onValueChange={(v) => setNewChart({ ...newChart, colorScheme: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(COLOR_SCHEMES).map(scheme => (
                          <SelectItem key={scheme} value={scheme}>{scheme}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Options */}
              <div className="col-span-2 flex flex-wrap gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newChart.showLegend}
                    onCheckedChange={(v) => setNewChart({ ...newChart, showLegend: v })}
                  />
                  <Label className="text-xs">Legend</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newChart.showDataLabels}
                    onCheckedChange={(v) => setNewChart({ ...newChart, showDataLabels: v })}
                  />
                  <Label className="text-xs">Labels</Label>
                </div>
                {['line', 'area'].includes(newChart.type || '') && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newChart.smooth}
                      onCheckedChange={(v) => setNewChart({ ...newChart, smooth: v })}
                    />
                    <Label className="text-xs">Smooth</Label>
                  </div>
                )}
                {newChart.type === 'bar' && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={newChart.horizontal}
                      onCheckedChange={(v) => setNewChart({ ...newChart, horizontal: v })}
                    />
                    <Label className="text-xs">Horizontal</Label>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <Button onClick={handleAddChart} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Chart
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <ScrollArea className="h-[500px]">
            {charts.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground">
                <Grid3X3 className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>No charts yet</p>
                <p className="text-xs mt-1">Use the builder to create charts</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {charts.map(chart => (
                  <Card key={chart.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground capitalize">
                        {chart.type} chart
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleExportChart(chart.id)}>
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteChart(chart.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <ReactECharts
                      ref={(ref) => { if (ref) chartRefs.current[chart.id] = ref; }}
                      option={getChartOption(chart)}
                      style={{ height: '300px' }}
                      opts={{ renderer: 'svg' }}
                    />
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
