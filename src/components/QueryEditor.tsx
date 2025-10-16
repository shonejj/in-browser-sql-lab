import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Maximize2, MoreVertical, AlertCircle, Lightbulb, ChevronDown, ChevronRight, Copy, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { validateSQL } from '@/lib/queryValidator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { toast } from 'sonner';

interface QueryEditorProps {
  query: string;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
  isExecuting: boolean;
  onDelete?: () => void;
  showDelete?: boolean;
}

export function QueryEditor({ query, onQueryChange, onExecute, isExecuting, onDelete, showDelete = false }: QueryEditorProps) {
  const [validation, setValidation] = useState<ReturnType<typeof validateSQL> | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (query.trim()) {
      const result = validateSQL(query);
      setValidation(result);
    } else {
      setValidation(null);
    }
  }, [query]);

  const handleExecute = () => {
    const result = validateSQL(query);
    if (!result.valid) {
      setValidation(result);
      return;
    }
    onExecute();
  };

  const applySuggestion = () => {
    if (validation?.suggestion) {
      onQueryChange(validation.suggestion);
      setValidation(null);
    }
  };

  const handleCopyQuery = () => {
    navigator.clipboard.writeText(query);
    toast.success('Query copied to clipboard');
  };

  const handleClearQuery = () => {
    onQueryChange('');
    toast.success('Query cleared');
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>
          <Button
            onClick={handleExecute}
            disabled={isExecuting || (validation !== null && !validation.valid)}
            size="sm"
            className="h-7 px-3 gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{isExecuting ? 'Running...' : 'Run'}</span>
          </Button>
          <span className="text-xs text-muted-foreground">SQL Query</span>
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
              {showDelete && onDelete && (
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

      {!isCollapsed && (
        <>
          {/* Validation Error */}
          {validation && !validation.valid && (
            <div className="px-3 py-2 border-b border-destructive/20 bg-destructive/5">
              <Alert className="border-none bg-transparent p-0">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <AlertDescription className="text-xs">
                  <span className="font-medium text-destructive">{validation.error}</span>
                  {validation.suggestion && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-muted-foreground">Suggested fix:</span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-6 text-xs"
                        onClick={applySuggestion}
                      >
                        <Lightbulb className="w-3 h-3 mr-1" />
                        Apply Fix
                      </Button>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Editor */}
          <div className="h-64">
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={query}
              onChange={(value) => onQueryChange(value || '')}
              onMount={(editor, monaco) => {
                // Add Ctrl+Enter keyboard shortcut
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                  handleExecute();
                });
              }}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                wrappingStrategy: 'advanced',
                padding: { top: 8, bottom: 8 },
                suggestOnTriggerCharacters: true,
                quickSuggestions: true,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
