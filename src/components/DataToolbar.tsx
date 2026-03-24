import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Calculator, Filter, Group, SortAsc, Search, Type, Calendar,
  Plus, Minus, X, Divide, Hash, ArrowDownUp, Columns, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface DataToolbarProps {
  columns: string[];
  tableName?: string;
  sourceQuery?: string;
  onGenerateQuery: (
    query: string,
    options?: {
      applyToTable?: boolean;
      refreshQuery?: string;
      successMessage?: string;
    }
  ) => void;
}

type OperationType = 'compute' | 'filter' | 'aggregate' | 'sort' | 'fuzzy' | 'dedup' | 'cast' | 'string' | 'date' | 'case';

export function DataToolbar({ columns, tableName, sourceQuery, onGenerateQuery }: DataToolbarProps) {
  const [activeDialog, setActiveDialog] = useState<OperationType | null>(null);

  const getSourceReference = () => {
    if (tableName) return `"${tableName}"`;
    const trimmed = (sourceQuery || '').trim().replace(/;\s*$/, '');
    return trimmed ? `(${trimmed}) AS _src` : '_last_result';
  };

  const buildTableTransformQuery = (selectQuery: string) => {
    if (!tableName) return null;
    const selectWithoutSemicolon = selectQuery.trim().replace(/;\s*$/, '');
    return {
      query: `CREATE OR REPLACE TABLE "${tableName}" AS ${selectWithoutSemicolon.replace(/^SELECT/i, 'SELECT')};`,
      refreshQuery: `SELECT * FROM "${tableName}";`,
      successMessage: `Updated table "${tableName}"`,
    };
  };

  // Compute Column state
  const [computeCol1, setComputeCol1] = useState('');
  const [computeOp, setComputeOp] = useState('+');
  const [computeCol2, setComputeCol2] = useState('');
  const [computeConstant, setComputeConstant] = useState('');
  const [computeAlias, setComputeAlias] = useState('computed_column');
  const [computeUseConstant, setComputeUseConstant] = useState(false);

  // Filter state
  const [filterCol, setFilterCol] = useState('');
  const [filterOp, setFilterOp] = useState('=');
  const [filterVal, setFilterVal] = useState('');

  // Aggregate state
  const [aggFunc, setAggFunc] = useState('COUNT');
  const [aggCol, setAggCol] = useState('');
  const [groupByCol, setGroupByCol] = useState('');

  // Sort state
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState('ASC');

  // Fuzzy match state
  const [fuzzyCol1, setFuzzyCol1] = useState('');
  const [fuzzyCol2, setFuzzyCol2] = useState('');
  const [fuzzyThreshold, setFuzzyThreshold] = useState('3');
  const [fuzzyAlgo, setFuzzyAlgo] = useState('levenshtein');

  // Dedup state
  const [dedupCols, setDedupCols] = useState<string[]>([]);

  // Cast state
  const [castCol, setCastCol] = useState('');
  const [castType, setCastType] = useState('VARCHAR');

  // String ops state
  const [stringCol, setStringCol] = useState('');
  const [stringOp, setStringOp] = useState('UPPER');

  // Date ops state
  const [dateCol, setDateCol] = useState('');
  const [dateOp, setDateOp] = useState('year');

  // Case state
  const [caseCol, setCaseCol] = useState('');
  const [caseCondOp, setCaseCondOp] = useState('=');
  const [caseCondVal, setCaseCondVal] = useState('');
  const [caseThenVal, setCaseThenVal] = useState('');
  const [caseElseVal, setCaseElseVal] = useState('');
  const [caseAlias, setCaseAlias] = useState('result');

  const handleGenerate = () => {
    let query = '';
    const sourceTable = getSourceReference();
    let applyInPlace = false;

    switch (activeDialog) {
      case 'compute': {
        const right = computeUseConstant ? computeConstant : `"${computeCol2}"`;
        query = `SELECT *, ("${computeCol1}" ${computeOp} ${right}) AS "${computeAlias}" FROM ${sourceTable};`;
        applyInPlace = true;
        break;
      }
      case 'filter': {
        const isNumOp = ['>', '<', '>=', '<='].includes(filterOp);
        const val = isNumOp ? filterVal : `'${filterVal.replace(/'/g, "''")}'`;
        const op = filterOp === 'LIKE'
          ? `LIKE '%${filterVal.replace(/'/g, "''")}%'`
          : ['IS NULL', 'IS NOT NULL'].includes(filterOp)
            ? filterOp
            : `${filterOp} ${val}`;
        query = `SELECT * FROM ${sourceTable} WHERE "${filterCol}" ${op};`;
        applyInPlace = true;
        break;
      }
      case 'aggregate': {
        const aggExpr = aggCol ? `${aggFunc}("${aggCol}")` : `${aggFunc}(*)`;
        if (groupByCol) {
          query = `SELECT "${groupByCol}", ${aggExpr} AS ${aggFunc.toLowerCase()}_value FROM ${sourceTable} GROUP BY "${groupByCol}" ORDER BY ${aggFunc.toLowerCase()}_value DESC;`;
        } else {
          query = `SELECT ${aggExpr} AS ${aggFunc.toLowerCase()}_value FROM ${sourceTable};`;
        }
        break;
      }
      case 'sort': {
        query = `SELECT * FROM ${sourceTable} ORDER BY "${sortCol}" ${sortDir};`;
        applyInPlace = true;
        break;
      }
      case 'fuzzy': {
        if (fuzzyAlgo === 'levenshtein') {
          query = `SELECT *, levenshtein("${fuzzyCol1}", "${fuzzyCol2}") AS distance FROM ${sourceTable} WHERE levenshtein("${fuzzyCol1}", "${fuzzyCol2}") <= ${fuzzyThreshold} ORDER BY distance;`;
        } else {
          query = `SELECT *, jaro_winkler_similarity("${fuzzyCol1}", "${fuzzyCol2}") AS similarity FROM ${sourceTable} WHERE jaro_winkler_similarity("${fuzzyCol1}", "${fuzzyCol2}") >= ${fuzzyThreshold} ORDER BY similarity DESC;`;
        }
        break;
      }
      case 'dedup': {
        if (dedupCols.length > 0) {
          query = `SELECT DISTINCT ON (${dedupCols.map(c => `"${c}"`).join(', ')}) * FROM ${sourceTable};`;
        } else {
          query = `SELECT DISTINCT * FROM ${sourceTable};`;
        }
        applyInPlace = true;
        break;
      }
      case 'cast': {
        query = `SELECT *, CAST("${castCol}" AS ${castType}) AS "${castCol}_${castType.toLowerCase()}" FROM ${sourceTable};`;
        applyInPlace = true;
        break;
      }
      case 'string': {
        const expr = stringOp === 'SPLIT' 
          ? `string_split("${stringCol}", ',')` 
          : stringOp === 'CONCAT' 
            ? `"${stringCol}"` 
            : `${stringOp}("${stringCol}")`;
        query = `SELECT *, ${expr} AS "${stringCol}_${stringOp.toLowerCase()}" FROM ${sourceTable};`;
        applyInPlace = true;
        break;
      }
      case 'date': {
        const dateExpr = dateOp === 'date_diff' 
          ? `date_diff('day', "${dateCol}", current_date)`
          : `${dateOp === 'year' ? "EXTRACT(YEAR FROM" : dateOp === 'month' ? "EXTRACT(MONTH FROM" : dateOp === 'day' ? "EXTRACT(DAY FROM" : "EXTRACT(HOUR FROM"} "${dateCol}")`;
        query = `SELECT *, ${dateExpr} AS "${dateCol}_${dateOp}" FROM ${sourceTable};`;
        applyInPlace = true;
        break;
      }
      case 'case': {
        const condVal = isNaN(Number(caseCondVal)) ? `'${caseCondVal.replace(/'/g, "''")}'` : caseCondVal;
        const thenVal = isNaN(Number(caseThenVal)) ? `'${caseThenVal.replace(/'/g, "''")}'` : caseThenVal;
        const elseVal = isNaN(Number(caseElseVal)) ? `'${caseElseVal.replace(/'/g, "''")}'` : caseElseVal;
        query = `SELECT *, CASE WHEN "${caseCol}" ${caseCondOp} ${condVal} THEN ${thenVal} ELSE ${elseVal} END AS "${caseAlias}" FROM ${sourceTable};`;
        applyInPlace = true;
        break;
      }
    }

    if (query) {
      const tableTransform = applyInPlace ? buildTableTransformQuery(query) : null;
      onGenerateQuery(
        tableTransform?.query || query,
        tableTransform
          ? {
              applyToTable: true,
              refreshQuery: tableTransform.refreshQuery,
              successMessage: tableTransform.successMessage,
            }
          : undefined,
      );
      setActiveDialog(null);
      toast.success(tableTransform ? 'Transformation applied to source table' : 'Query generated and added to new cell');
    }
  };

  const tools = [
    { type: 'compute' as OperationType, icon: Calculator, label: 'Compute', tip: 'Add computed column' },
    { type: 'filter' as OperationType, icon: Filter, label: 'Filter', tip: 'Filter rows' },
    { type: 'aggregate' as OperationType, icon: Group, label: 'Aggregate', tip: 'Group & aggregate' },
    { type: 'sort' as OperationType, icon: SortAsc, label: 'Sort', tip: 'Sort data' },
    { type: 'fuzzy' as OperationType, icon: Search, label: 'Fuzzy Match', tip: 'Fuzzy string matching' },
    { type: 'case' as OperationType, icon: ArrowDownUp, label: 'IF/CASE', tip: 'Conditional logic' },
    { type: 'dedup' as OperationType, icon: Columns, label: 'Dedup', tip: 'Remove duplicates' },
    { type: 'cast' as OperationType, icon: Hash, label: 'Cast', tip: 'Change column type' },
    { type: 'string' as OperationType, icon: Type, label: 'String', tip: 'String operations' },
    { type: 'date' as OperationType, icon: Calendar, label: 'Date', tip: 'Date operations' },
  ];

  if (columns.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-1 p-2 bg-muted/30 rounded-lg border border-border">
        <span className="text-xs text-muted-foreground flex items-center mr-1">
          <Sparkles className="w-3 h-3 mr-1" /> Data Tools:
        </span>
        {tools.map(({ type, icon: Icon, label, tip }) => (
          <Button
            key={type}
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 px-2"
            onClick={() => setActiveDialog(type)}
            title={tip}
          >
            <Icon className="w-3 h-3" />
            {label}
          </Button>
        ))}
      </div>

      {/* Compute Column Dialog */}
      <Dialog open={activeDialog === 'compute'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Computed Column</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Column 1</Label>
              <Select value={computeCol1} onValueChange={setComputeCol1}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operation</Label>
              <Select value={computeOp} onValueChange={setComputeOp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="+">Add (+)</SelectItem>
                  <SelectItem value="-">Subtract (-)</SelectItem>
                  <SelectItem value="*">Multiply (×)</SelectItem>
                  <SelectItem value="/">Divide (÷)</SelectItem>
                  <SelectItem value="%">Modulo (%)</SelectItem>
                  <SelectItem value="||">Concat (||)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={computeUseConstant} onChange={e => setComputeUseConstant(e.target.checked)} />
              <Label className="text-xs">Use constant value</Label>
            </div>
            {computeUseConstant ? (
              <div>
                <Label className="text-xs">Constant</Label>
                <Input value={computeConstant} onChange={e => setComputeConstant(e.target.value)} placeholder="e.g. 100" />
              </div>
            ) : (
              <div>
                <Label className="text-xs">Column 2</Label>
                <Select value={computeCol2} onValueChange={setComputeCol2}>
                  <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Result Column Name</Label>
              <Input value={computeAlias} onChange={e => setComputeAlias(e.target.value)} />
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Filter Dialog */}
      <Dialog open={activeDialog === 'filter'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Filter Rows</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Column</Label>
              <Select value={filterCol} onValueChange={setFilterCol}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operator</Label>
              <Select value={filterOp} onValueChange={setFilterOp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="=">Equals (=)</SelectItem>
                  <SelectItem value="!=">Not Equals (!=)</SelectItem>
                  <SelectItem value=">">Greater Than (&gt;)</SelectItem>
                  <SelectItem value="<">Less Than (&lt;)</SelectItem>
                  <SelectItem value=">=">Greater or Equal (&gt;=)</SelectItem>
                  <SelectItem value="<=">Less or Equal (&lt;=)</SelectItem>
                  <SelectItem value="LIKE">Contains (LIKE)</SelectItem>
                  <SelectItem value="IS NULL">Is Null</SelectItem>
                  <SelectItem value="IS NOT NULL">Is Not Null</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!['IS NULL', 'IS NOT NULL'].includes(filterOp) && (
              <div>
                <Label className="text-xs">Value</Label>
                <Input value={filterVal} onChange={e => setFilterVal(e.target.value)} placeholder="Filter value" />
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aggregate Dialog */}
      <Dialog open={activeDialog === 'aggregate'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Aggregate Data</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Function</Label>
              <Select value={aggFunc} onValueChange={setAggFunc}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COUNT">COUNT</SelectItem>
                  <SelectItem value="SUM">SUM</SelectItem>
                  <SelectItem value="AVG">AVG</SelectItem>
                  <SelectItem value="MIN">MIN</SelectItem>
                  <SelectItem value="MAX">MAX</SelectItem>
                  <SelectItem value="STDDEV">STDDEV</SelectItem>
                  <SelectItem value="MEDIAN">MEDIAN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Column (optional for COUNT)</Label>
              <Select value={aggCol || '__all__'} onValueChange={v => setAggCol(v === '__all__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All (*)</SelectItem>
                  {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Group By (optional)</Label>
              <Select value={groupByCol || '__none__'} onValueChange={v => setGroupByCol(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No grouping</SelectItem>
                  {columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>Generate Query</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sort Dialog */}
      <Dialog open={activeDialog === 'sort'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Sort Data</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Column</Label>
              <Select value={sortCol} onValueChange={setSortCol}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Direction</Label>
              <Select value={sortDir} onValueChange={setSortDir}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ASC">Ascending</SelectItem>
                  <SelectItem value="DESC">Descending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fuzzy Match Dialog */}
      <Dialog open={activeDialog === 'fuzzy'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Fuzzy String Matching</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Algorithm</Label>
              <Select value={fuzzyAlgo} onValueChange={v => { setFuzzyAlgo(v); setFuzzyThreshold(v === 'levenshtein' ? '3' : '0.8'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="levenshtein">Levenshtein Distance</SelectItem>
                  <SelectItem value="jaro_winkler">Jaro-Winkler Similarity</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Column 1</Label>
              <Select value={fuzzyCol1} onValueChange={setFuzzyCol1}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Column 2</Label>
              <Select value={fuzzyCol2} onValueChange={setFuzzyCol2}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Threshold ({fuzzyAlgo === 'levenshtein' ? 'max distance' : 'min similarity 0-1'})</Label>
              <Input value={fuzzyThreshold} onChange={e => setFuzzyThreshold(e.target.value)} />
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>Generate Query</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IF/CASE Dialog */}
      <Dialog open={activeDialog === 'case'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>IF / CASE Condition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">WHEN column</Label>
              <Select value={caseCol} onValueChange={setCaseCol}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operator</Label>
              <Select value={caseCondOp} onValueChange={setCaseCondOp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="=">Equals</SelectItem>
                  <SelectItem value=">">Greater than</SelectItem>
                  <SelectItem value="<">Less than</SelectItem>
                  <SelectItem value="LIKE">Contains</SelectItem>
                  <SelectItem value="IS NULL">Is Null</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Condition Value</Label>
              <Input value={caseCondVal} onChange={e => setCaseCondVal(e.target.value)} placeholder="e.g. 100" />
            </div>
            <div>
              <Label className="text-xs">THEN (result if true)</Label>
              <Input value={caseThenVal} onChange={e => setCaseThenVal(e.target.value)} placeholder="e.g. 'High'" />
            </div>
            <div>
              <Label className="text-xs">ELSE (result if false)</Label>
              <Input value={caseElseVal} onChange={e => setCaseElseVal(e.target.value)} placeholder="e.g. 'Low'" />
            </div>
            <div>
              <Label className="text-xs">Result Column Name</Label>
              <Input value={caseAlias} onChange={e => setCaseAlias(e.target.value)} />
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dedup Dialog */}
      <Dialog open={activeDialog === 'dedup'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Remove Duplicates</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Select columns to deduplicate on, or leave empty for full row dedup.</p>
            <div className="flex flex-wrap gap-2">
              {columns.map(c => (
                <Button
                  key={c}
                  variant={dedupCols.includes(c) ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setDedupCols(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cast Dialog */}
      <Dialog open={activeDialog === 'cast'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Cast Column Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Column</Label>
              <Select value={castCol} onValueChange={setCastCol}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Target Type</Label>
              <Select value={castType} onValueChange={setCastType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="VARCHAR">VARCHAR (text)</SelectItem>
                  <SelectItem value="INTEGER">INTEGER</SelectItem>
                  <SelectItem value="DOUBLE">DOUBLE (decimal)</SelectItem>
                  <SelectItem value="BOOLEAN">BOOLEAN</SelectItem>
                  <SelectItem value="DATE">DATE</SelectItem>
                  <SelectItem value="TIMESTAMP">TIMESTAMP</SelectItem>
                  <SelectItem value="BIGINT">BIGINT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* String Ops Dialog */}
      <Dialog open={activeDialog === 'string'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>String Operations</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Column</Label>
              <Select value={stringCol} onValueChange={setStringCol}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operation</Label>
              <Select value={stringOp} onValueChange={setStringOp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPPER">UPPER</SelectItem>
                  <SelectItem value="LOWER">LOWER</SelectItem>
                  <SelectItem value="TRIM">TRIM</SelectItem>
                  <SelectItem value="LENGTH">LENGTH</SelectItem>
                  <SelectItem value="REVERSE">REVERSE</SelectItem>
                  <SelectItem value="SPLIT">SPLIT (by comma)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Ops Dialog */}
      <Dialog open={activeDialog === 'date'} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Date Operations</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Column</Label>
              <Select value={dateCol} onValueChange={setDateCol}>
                <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                <SelectContent>{columns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operation</Label>
              <Select value={dateOp} onValueChange={setDateOp}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">Extract Year</SelectItem>
                  <SelectItem value="month">Extract Month</SelectItem>
                  <SelectItem value="day">Extract Day</SelectItem>
                  <SelectItem value="hour">Extract Hour</SelectItem>
                  <SelectItem value="date_diff">Days Since (from today)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={handleGenerate}>{tableName ? 'Apply to Table' : 'Generate Query'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
