import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Activity, Database } from 'lucide-react';

export function PerformanceMonitor() {
  const [memory, setMemory] = useState<{ used: number; total: number } | null>(null);
  const [fps, setFps] = useState<number[]>([]);

  useEffect(() => {
    // Memory monitoring
    const updateMemory = () => {
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        setMemory({
          used: mem.usedJSHeapSize / (1024 * 1024),
          total: mem.jsHeapSizeLimit / (1024 * 1024)
        });
      }
    };

    // FPS monitoring
    let lastTime = performance.now();
    let frameCount = 0;
    let animationId: number;

    const measureFPS = (currentTime: number) => {
      frameCount++;
      const delta = currentTime - lastTime;

      if (delta >= 1000) {
        const currentFPS = Math.round((frameCount * 1000) / delta);
        setFps(prev => [...prev.slice(-19), currentFPS]);
        frameCount = 0;
        lastTime = currentTime;
      }

      animationId = requestAnimationFrame(measureFPS);
    };

    updateMemory();
    const memoryInterval = setInterval(updateMemory, 2000);
    animationId = requestAnimationFrame(measureFPS);

    return () => {
      clearInterval(memoryInterval);
      cancelAnimationFrame(animationId);
    };
  }, []);

  const formatMemory = (mb: number) => {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
  };

  const memoryPercent = memory ? (memory.used / memory.total) * 100 : 0;
  const avgFPS = fps.length > 0 ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : 0;

  return (
    <div className="space-y-3 p-4 border-b">
      <div className="text-xs font-medium text-muted-foreground mb-2">Performance</div>
      
      {/* Memory Usage */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Database className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium">Memory</span>
        </div>
        {memory ? (
          <>
            <div className="text-xs text-muted-foreground mb-1">
              {formatMemory(memory.used)} / {formatMemory(memory.total)}
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div 
                className="h-1.5 rounded-full transition-all"
                style={{ 
                  width: `${memoryPercent}%`,
                  backgroundColor: memoryPercent > 80 ? '#ef4444' : memoryPercent > 60 ? '#f59e0b' : '#10b981'
                }}
              />
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Not available</div>
        )}
      </Card>

      {/* FPS Monitor */}
      <Card className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Activity className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium">FPS: {avgFPS}</span>
        </div>
        <div className="flex items-end gap-0.5 h-8">
          {fps.map((f, i) => (
            <div
              key={i}
              className="flex-1 rounded-t transition-all"
              style={{
                height: `${(f / 60) * 100}%`,
                backgroundColor: f >= 50 ? '#10b981' : f >= 30 ? '#f59e0b' : '#ef4444',
                minHeight: '2px'
              }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
