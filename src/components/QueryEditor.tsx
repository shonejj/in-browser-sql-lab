import { useState, useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { Play, ChevronDown, ChevronRight, AlertCircle, Lightbulb } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { validateSQL } from '@/lib/queryValidator';
import { useTheme } from 'next-themes';

interface QueryEditorProps {
  query: string;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
  isExecuting: boolean;
}

export function QueryEditor({ query, onQueryChange, onExecute, isExecuting }: QueryEditorProps) {
  const [validation, setValidation] = useState<ReturnType<typeof validateSQL> | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { theme } = useTheme();

  // Refs to avoid stale closures in Monaco commands
  const onExecuteRef = useRef(onExecute);
  const queryRef = useRef(query);
  useEffect(() => { onExecuteRef.current = onExecute; }, [onExecute]);
  useEffect(() => { queryRef.current = query; }, [query]);

  useEffect(() => {
    if (query.trim()) {
      const result = validateSQL(query);
      setValidation(result);
    } else {
      setValidation(null);
    }
  }, [query]);

  const handleExecute = useCallback(() => {
    const result = validateSQL(queryRef.current);
    if (!result.valid) {
      return;
    }
    onExecuteRef.current();
  }, []);

  const applySuggestion = () => {
    if (validation?.suggestion) {
      onQueryChange(validation.suggestion);
      setValidation(null);
    }
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
                  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON', 'AS',
                  'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET', 'FETCH', 'FIRST', 'NEXT', 'ROW', 'ROWS', 'ONLY',
                  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'TRUNCATE', 'MERGE',
                  'CREATE', 'TABLE', 'DROP', 'ALTER', 'ADD', 'COLUMN', 'INDEX', 'VIEW', 'SEQUENCE', 'DATABASE', 'SCHEMA',
                  'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'NUMERIC',
                  'VARCHAR', 'CHAR', 'TEXT', 'STRING', 'BOOLEAN', 'BOOL', 'DATE', 'TIMESTAMP', 'TIME', 'INTERVAL',
                  'BLOB', 'JSON', 'UUID', 'ARRAY', 'LIST', 'STRUCT', 'MAP',
                  'DISTINCT', 'ALL', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'STDDEV', 'VARIANCE',
                  'CAST', 'CONVERT', 'COALESCE', 'NULLIF', 'IFNULL', 'NVL',
                  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'IF', 'IIF',
                  'AND', 'OR', 'NOT', 'XOR', 'IN', 'NOT IN', 'EXISTS', 'NOT EXISTS',
                  'NULL', 'IS', 'IS NOT', 'LIKE', 'ILIKE', 'SIMILAR TO', 'BETWEEN', 'ANY', 'SOME',
                  'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'MINUS',
                  'OVER', 'PARTITION', 'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT',
                  'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE',
                  'CONCAT', 'SUBSTRING', 'SUBSTR', 'LENGTH', 'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM',
                  'REPLACE', 'SPLIT', 'REGEXP_MATCHES', 'REGEXP_REPLACE',
                  'NOW', 'CURRENT_DATE', 'CURRENT_TIME', 'CURRENT_TIMESTAMP', 'EXTRACT', 'DATE_PART',
                  'DATE_TRUNC', 'DATE_ADD', 'DATE_SUB', 'DATEDIFF', 'DATEADD',
                  'STRING_AGG', 'ARRAY_AGG', 'APPROX_COUNT_DISTINCT', 'MEDIAN', 'MODE', 'PERCENTILE',
                  'COPY', 'PRAGMA', 'SHOW', 'DESCRIBE', 'EXPLAIN', 'ANALYZE', 'ATTACH', 'DETACH',
                  'READ_CSV', 'READ_CSV_AUTO', 'READ_PARQUET', 'READ_JSON', 'WRITE_CSV',
                  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT', 'NOT NULL',
                  'TRUE', 'FALSE', 'WITH', 'RECURSIVE', 'USING', 'NATURAL', 'LATERAL', 'TABLESAMPLE',
                ];

                monaco.languages.registerCompletionItemProvider('sql', {
                  provideCompletionItems: (model, position) => {
                    const word = model.getWordUntilPosition(position);
                    const range = {
                      startLineNumber: position.lineNumber,
                      endLineNumber: position.lineNumber,
                      startColumn: word.startColumn,
                      endColumn: word.endColumn,
                    };

                    // Get fresh table list
                    const currentTables = (window as any).__duckdb_tables__ || tables;

                    const suggestions: any[] = [
                      ...sqlKeywords.map(keyword => ({
                        label: keyword,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: keyword,
                        range,
                        sortText: '0' + keyword,
                      })),
                      ...currentTables.map((table: string) => ({
                        label: table,
                        kind: monaco.languages.CompletionItemKind.Class,
                        insertText: `"${table}"`,
                        detail: 'Table',
                        documentation: `Available table: ${table}`,
                        range,
                        sortText: '1' + table,
                      })),
                      {
                        label: 'SELECT * FROM',
                        kind: monaco.languages.CompletionItemKind.Snippet,
                        insertText: 'SELECT * FROM "${1:table}"',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        detail: 'Select all from table',
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

                // Ctrl+Enter uses refs to always get latest values
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
                  const result = validateSQL(queryRef.current);
                  if (result.valid) {
                    onExecuteRef.current();
                  }
                });
              }}
              theme={theme === 'dark' ? 'vs-dark' : 'vs-light'}
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
