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
                const tables = (window as any).__duckdb_tables__ || [];
                const sqlKeywords = [
                  // Basic Keywords
                  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS',
                  'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET', 'FETCH', 'FIRST', 'NEXT', 'ROW', 'ROWS', 'ONLY',
                  // DML
                  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'TRUNCATE', 'MERGE',
                  // DDL
                  'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'INDEX', 'VIEW', 'SEQUENCE', 'DATABASE', 'SCHEMA',
                  // Data Types
                  'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC',
                  'VARCHAR', 'CHAR', 'TEXT', 'STRING', 'BOOLEAN', 'BOOL', 'DATE', 'TIMESTAMP', 'TIME', 'INTERVAL',
                  'BLOB', 'JSON', 'UUID', 'ARRAY', 'LIST', 'STRUCT', 'MAP',
                  // Functions & Operators
                  'DISTINCT', 'ALL', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'STDDEV', 'VARIANCE',
                  'CAST', 'CONVERT', 'COALESCE', 'NULLIF', 'IFNULL', 'NVL',
                  // Conditional
                  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'IIF',
                  // Logical
                  'AND', 'OR', 'NOT', 'XOR', 'IN', 'NOT IN', 'EXISTS', 'NOT EXISTS',
                  // Comparison
                  'NULL', 'IS', 'IS NOT', 'LIKE', 'ILIKE', 'SIMILAR TO', 'BETWEEN', 'ANY', 'ALL', 'SOME',
                  // Set Operations
                  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'MINUS',
                  // Window Functions
                  'OVER', 'PARTITION', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT',
                  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
                  // String Functions
                  'CONCAT', 'SUBSTRING', 'SUBSTR', 'LENGTH', 'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM',
                  'REPLACE', 'SPLIT', 'REGEXP_MATCHES', 'REGEXP_REPLACE',
                  // Date Functions
                  'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'EXTRACT', 'DATE_PART',
                  'DATE_TRUNC', 'DATE_ADD', 'DATE_SUB', 'DATEDIFF', 'DATEADD',
                  // Aggregate Extensions
                  'STRING_AGG', 'ARRAY_AGG', 'LIST', 'APPROX_COUNT_DISTINCT', 'MEDIAN', 'MODE', 'PERCENTILE',
                  // DuckDB Specific
                  'COPY', 'PRAGMA', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'ANALYZE', 'ATTACH', 'DETACH',
                  'READ_CSV', 'READ_CSV_AUTO', 'READ_PARQUET', 'READ_JSON', 'WRITE_CSV',
                  // Constraints
                  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT', 'NOT NULL',
                  // Other
                  'TRUE', 'FALSE', 'WITH', 'RECURSIVE', 'USING', 'NATURAL', 'LATERAL', 'TABLESAMPLE',
                ];

                // Enhanced SQL autocomplete with tables, columns, and snippets
                monaco.languages.registerCompletionItemProvider('sql', {
                  provideCompletionItems: (model, position) => {
                    const word = model.getWordUntilPosition(position);
                    const range = {
                      startLineNumber: position.lineNumber,
                      endLineNumber: position.lineNumber,
                      startColumn: word.startColumn,
                      endColumn: word.endColumn,
                    };

                    const suggestions: any[] = [
                      // SQL Keywords
                      ...sqlKeywords.map(keyword => ({
                        label: keyword,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: keyword,
                        range,
                        sortText: '0' + keyword, // Prioritize keywords
                      })),
                      // Tables
                      ...tables.map((table: string) => ({
                        label: table,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: `"${table}"`,
                        detail: 'Table',
                        documentation: `Available table: ${table}`,
                        range,
                        sortText: '1' + table,
                      })),
                      // SQL Snippets
                      {
                        label: 'SELECT * FROM',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'SELECT * FROM "${1:table}"',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'Select all from table',
                        documentation: 'SELECT * FROM "table"',
                        range,
                        sortText: '2select',
                      },
                      {
                        label: 'INSERT INTO',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'INSERT INTO "${1:table}" (${2:columns}) VALUES (${3:values})',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'Insert into table',
                        range,
                        sortText: '2insert',
                      },
                      {
                        label: 'UPDATE SET',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'UPDATE "${1:table}" SET ${2:column} = ${3:value} WHERE ${4:condition}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'Update table',
                        range,
                        sortText: '2update',
                      },
                      {
                        label: 'DELETE FROM',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'DELETE FROM "${1:table}" WHERE ${2:condition}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'Delete from table',
                        range,
                        sortText: '2delete',
                      },
                      {
                        label: 'CREATE TABLE',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'CREATE TABLE "${1:table_name}" (\n  ${2:id} INTEGER PRIMARY KEY,\n  ${3:column} VARCHAR\n)',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'Create new table',
                        range,
                        sortText: '2create',
                      },
                      {
                        label: 'JOIN',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'JOIN "${1:table}" ON ${2:condition}',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'Join tables',
                        range,
                        sortText: '2join',
                      },
                    ];
                    
                    return { suggestions };
                  },
                });

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
