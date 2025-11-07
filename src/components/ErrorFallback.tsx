import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  resetError: () => void;
}

export function ErrorFallback({ error, errorInfo, resetError }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-2xl w-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <div>
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-muted-foreground">The application encountered an unexpected error</p>
          </div>
        </div>

        {error && (
          <div className="space-y-2">
            <div className="p-4 bg-destructive/10 rounded-md border border-destructive/20">
              <p className="font-mono text-sm text-destructive">{error.message}</p>
            </div>
            {errorInfo && (
              <details className="cursor-pointer">
                <summary className="text-sm font-medium mb-2">Error details</summary>
                <pre className="p-4 bg-muted rounded-md text-xs overflow-auto max-h-60">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload Application
          </Button>
          <Button variant="outline" onClick={resetError}>
            Try Again
          </Button>
        </div>
      </Card>
    </div>
  );
}
