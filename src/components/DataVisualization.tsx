import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from './ui/button';
import { BarChart3, LineChart, PieChart, ScatterChart } from 'lucide-react';
import { Card } from './ui/card';

interface DataVisualizationProps {
  data: any[];
  selectedColumn?: string;
}

type ChartType = 'bar' | 'line' | 'pie' | 'scatter';

export function DataVisualization({ data, selectedColumn }: DataVisualizationProps) {
  const [chartType, setChartType] = useState<ChartType>('bar');

  const chartData = useMemo(() => {
    if (!data.length || !selectedColumn) return null;

    const columnValues = data.map(row => row[selectedColumn]);
    const counts: Record<string, number> = {};
    
    columnValues.forEach(val => {
      const key = String(val);
      counts[key] = (counts[key] || 0) + 1;
    });

    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    return {
      categories: entries.map(([name]) => name),
      values: entries.map(([, count]) => count),
      pieData: entries.map(([name, value]) => ({ name, value }))
    };
  }, [data, selectedColumn]);

  const getChartOption = () => {
    if (!chartData) return {};

    const baseColors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];

    switch (chartType) {
      case 'bar':
        return {
          tooltip: { trigger: 'axis' },
          xAxis: {
            type: 'category',
            data: chartData.categories,
            axisLabel: { rotate: 45, interval: 0 }
          },
          yAxis: { type: 'value' },
          series: [{
            type: 'bar',
            data: chartData.values,
            itemStyle: { color: baseColors[0] }
          }]
        };

      case 'line':
        return {
          tooltip: { trigger: 'axis' },
          xAxis: {
            type: 'category',
            data: chartData.categories,
            axisLabel: { rotate: 45, interval: 0 }
          },
          yAxis: { type: 'value' },
          series: [{
            type: 'line',
            data: chartData.values,
            smooth: true,
            itemStyle: { color: baseColors[1] }
          }]
        };

      case 'pie':
        return {
          tooltip: { trigger: 'item' },
          legend: { orient: 'vertical', left: 'left' },
          series: [{
            type: 'pie',
            radius: '50%',
            data: chartData.pieData,
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        };

      case 'scatter':
        return {
          tooltip: { trigger: 'item' },
          xAxis: { type: 'category', data: chartData.categories },
          yAxis: { type: 'value' },
          series: [{
            type: 'scatter',
            data: chartData.values,
            itemStyle: { color: baseColors[3] }
          }]
        };

      default:
        return {};
    }
  };

  if (!data.length) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        No data to visualize
      </Card>
    );
  }

  if (!selectedColumn) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Select a column to visualize
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant={chartType === 'bar' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartType('bar')}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Bar
        </Button>
        <Button
          variant={chartType === 'line' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartType('line')}
        >
          <LineChart className="w-4 h-4 mr-2" />
          Line
        </Button>
        <Button
          variant={chartType === 'pie' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartType('pie')}
        >
          <PieChart className="w-4 h-4 mr-2" />
          Pie
        </Button>
        <Button
          variant={chartType === 'scatter' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setChartType('scatter')}
        >
          <ScatterChart className="w-4 h-4 mr-2" />
          Scatter
        </Button>
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-medium mb-4">
          {selectedColumn} - {chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart
        </h3>
        <ReactECharts 
          option={getChartOption()} 
          style={{ height: '400px' }}
          opts={{ renderer: 'svg' }}
        />
      </Card>
    </div>
  );
}
