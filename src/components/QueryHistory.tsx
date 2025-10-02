import { Clock, Copy, Play, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';

export interface QueryHistoryItem {
  id: string;
  query: string;
  timestamp: Date;
  success: boolean;
  rowCount?: number;
  executionTime?: number;
}

interface QueryHistoryProps {
  history: QueryHistoryItem[];
  onRunQuery: (query: string) => void;
  onClearHistory: () => void;
}

export function QueryHistory({ history, onRunQuery, onClearHistory }: QueryHistoryProps) {
  const copyToClipboard = (query: string) => {
    navigator.clipboard.writeText(query);
    toast.success('Query copied to clipboard');
  };

  if (history.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No query history yet. Run a query to see it here.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">Query History</span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onClearHistory}
          className="h-7 px-2 gap-1"
        >
          <Trash2 className="w-3 h-3" />
          <span className="text-xs">Clear</span>
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {history.slice().reverse().map((item) => (
            <div
              key={item.id}
              className={`p-3 border rounded-lg ${
                item.success ? 'border-border bg-card' : 'border-destructive/50 bg-destructive/5'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-xs text-muted-foreground">
                  {item.timestamp.toLocaleTimeString()}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => copyToClipboard(item.query)}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onRunQuery(item.query)}
                  >
                    <Play className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              
              <pre className="text-xs bg-muted/30 p-2 rounded overflow-x-auto font-mono">
                {item.query.length > 100 ? item.query.slice(0, 100) + '...' : item.query}
              </pre>
              
              {item.success && item.rowCount !== undefined && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {item.rowCount.toLocaleString()} rows
                  {item.executionTime && ` • ${item.executionTime}ms`}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
