import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Maximize2, MoreVertical } from 'lucide-react';
import { Button } from './ui/button';

interface QueryEditorProps {
  query: string;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
  isExecuting: boolean;
}

export function QueryEditor({ query, onQueryChange, onExecute, isExecuting }: QueryEditorProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            onClick={onExecute}
            disabled={isExecuting}
            size="sm"
            className="h-7 px-3 gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Run</span>
          </Button>
          <span className="text-xs text-muted-foreground">memory</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreVertical className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="h-64">
        <Editor
          height="100%"
          defaultLanguage="sql"
          value={query}
          onChange={(value) => onQueryChange(value || '')}
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
    </div>
  );
}
