import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/duckdb';
import {
  GitBranch, Plus, Play, Clock, Trash2, ArrowRight, Database,
  Cloud, Globe, Code, FileOutput, Settings
} from 'lucide-react';

interface WorkflowBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface WorkflowStep {
  id: string;
  type: 'source' | 'transform' | 'destination';
  config: {
    source_type?: string;
    connector_id?: string;
    query?: string;
    table_name?: string;
    dest_type?: string;
    s3_path?: string;
    [key: string]: any;
  };
}

interface Workflow {
  id?: string;
  name: string;
  schedule?: string;
  steps: WorkflowStep[];
  status?: string;
  last_run?: string;
}

const defaultWorkflow: Workflow = {
  name: '',
  schedule: '',
  steps: [],
};

export function WorkflowBuilder({ open, onOpenChange }: WorkflowBuilderProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [current, setCurrent] = useState<Workflow>({ ...defaultWorkflow });
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const backendUrl = getBackendUrl();

  useEffect(() => {
    if (open) loadWorkflows();
  }, [open]);

  async function loadWorkflows() {
    try {
      const res = await fetch(`${backendUrl}/api/workflows`);
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch { /* ignore */ }
  }

  function addStep(type: 'source' | 'transform' | 'destination') {
    setCurrent(prev => ({
      ...prev,
      steps: [...prev.steps, { id: Date.now().toString(), type, config: {} }],
    }));
  }

  function updateStep(stepId: string, config: WorkflowStep['config']) {
    setCurrent(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === stepId ? { ...s, config: { ...s.config, ...config } } : s),
    }));
  }

  function removeStep(stepId: string) {
    setCurrent(prev => ({
      ...prev,
      steps: prev.steps.filter(s => s.id !== stepId),
    }));
  }

  async function handleSave() {
    if (!current.name.trim()) { toast.error('Enter a workflow name'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(current),
      });
      if (!res.ok) throw new Error('Failed to save workflow');
      toast.success('Workflow saved');
      loadWorkflows();
      setCurrent({ ...defaultWorkflow });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRun(workflowId?: string) {
    const id = workflowId || current.id;
    if (!id) { toast.error('Save the workflow first'); return; }
    setRunning(true);
    try {
      const res = await fetch(`${backendUrl}/api/workflows/${id}/run`, { method: 'POST' });
      if (!res.ok) throw new Error('Run failed');
      const data = await res.json();
      toast.success(data.message || 'Workflow started');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this workflow?')) return;
    try {
      await fetch(`${backendUrl}/api/workflows/${id}`, { method: 'DELETE' });
      toast.success('Deleted');
      loadWorkflows();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const stepTypeConfig = {
    source: { icon: <Database className="w-4 h-4" />, label: 'Source', color: 'text-emerald-500' },
    transform: { icon: <Code className="w-4 h-4" />, label: 'Transform', color: 'text-blue-500' },
    destination: { icon: <FileOutput className="w-4 h-4" />, label: 'Destination', color: 'text-amber-500' },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5" />
            Workflow Builder
            <Badge variant="secondary" className="text-[10px] ml-2">ETL Pipelines</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="build" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="build" className="text-xs">Build</TabsTrigger>
            <TabsTrigger value="saved" className="text-xs">Saved Workflows ({workflows.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="build" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-[450px]">
              <div className="space-y-4 p-1">
                {/* Workflow name & schedule */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Workflow Name</Label>
                    <Input
                      value={current.name}
                      onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                      placeholder="My ETL Pipeline"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Schedule (cron)</Label>
                    <Input
                      value={current.schedule || ''}
                      onChange={(e) => setCurrent({ ...current, schedule: e.target.value })}
                      placeholder="0 */6 * * * (every 6 hours)"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Pipeline Steps</Label>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => addStep('source')}>
                        <Database className="w-3 h-3" /> Source
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => addStep('transform')}>
                        <Code className="w-3 h-3" /> Transform
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => addStep('destination')}>
                        <FileOutput className="w-3 h-3" /> Destination
                      </Button>
                    </div>
                  </div>

                  {current.steps.length === 0 && (
                    <div className="p-6 border-2 border-dashed rounded-lg text-center text-sm text-muted-foreground">
                      Add steps to build your pipeline: Source → Transform → Destination
                    </div>
                  )}

                  {current.steps.map((step, idx) => (
                    <div key={step.id} className="relative">
                      {idx > 0 && (
                        <div className="flex justify-center -mt-1 -mb-1">
                          <ArrowRight className="w-4 h-4 text-muted-foreground rotate-90" />
                        </div>
                      )}
                      <div className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={stepTypeConfig[step.type].color}>
                              {stepTypeConfig[step.type].icon}
                            </span>
                            <span className="text-xs font-medium">
                              {stepTypeConfig[step.type].label} #{idx + 1}
                            </span>
                          </div>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeStep(step.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>

                        {step.type === 'source' && (
                          <div className="space-y-2">
                            <div className="flex gap-1.5 flex-wrap">
                              {['mysql', 'postgresql', 's3', 'ftp', 'http', 'webhook'].map(st => (
                                <Button
                                  key={st}
                                  variant={step.config.source_type === st ? 'default' : 'outline'}
                                  size="sm"
                                  className="text-[10px] h-6"
                                  onClick={() => updateStep(step.id, { source_type: st })}
                                >
                                  {st}
                                </Button>
                              ))}
                            </div>
                            <Input
                              value={step.config.query || ''}
                              onChange={(e) => updateStep(step.id, { query: e.target.value })}
                              placeholder="SQL query or file path"
                              className="text-xs"
                            />
                          </div>
                        )}

                        {step.type === 'transform' && (
                          <div>
                            <Input
                              value={step.config.query || ''}
                              onChange={(e) => updateStep(step.id, { query: e.target.value })}
                              placeholder="SQL transformation query (e.g. SELECT *, amount*1.1 AS adjusted FROM source)"
                              className="text-xs"
                            />
                          </div>
                        )}

                        {step.type === 'destination' && (
                          <div className="space-y-2">
                            <div className="flex gap-1.5 flex-wrap">
                              {['duckdb_table', 's3', 'mysql', 'postgresql', 'http'].map(dt => (
                                <Button
                                  key={dt}
                                  variant={step.config.dest_type === dt ? 'default' : 'outline'}
                                  size="sm"
                                  className="text-[10px] h-6"
                                  onClick={() => updateStep(step.id, { dest_type: dt })}
                                >
                                  {dt}
                                </Button>
                              ))}
                            </div>
                            <Input
                              value={step.config.table_name || step.config.s3_path || ''}
                              onChange={(e) => updateStep(step.id, {
                                [step.config.dest_type === 's3' ? 's3_path' : 'table_name']: e.target.value,
                              })}
                              placeholder={step.config.dest_type === 's3' ? 's3://bucket/path.parquet' : 'output_table_name'}
                              className="text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={handleSave} disabled={loading}>
                    <Plus className="w-3 h-3 mr-1" /> {loading ? 'Saving...' : 'Save Workflow'}
                  </Button>
                  {current.id && (
                    <Button variant="outline" size="sm" onClick={() => handleRun()} disabled={running}>
                      <Play className="w-3 h-3 mr-1" /> {running ? 'Running...' : 'Run Now'}
                    </Button>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="saved" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-[450px]">
              {workflows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No workflows yet. Build one in the "Build" tab.
                </div>
              ) : (
                <div className="space-y-2 p-1">
                  {workflows.map((wf: any) => (
                    <div key={wf.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium">{wf.name}</span>
                          {wf.schedule && (
                            <Badge variant="secondary" className="text-[10px] ml-2">
                              <Clock className="w-2.5 h-2.5 mr-0.5" /> {wf.schedule}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRun(wf.id)}>
                            <Play className="w-3 h-3 mr-1" /> Run
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setCurrent({
                              id: wf.id,
                              name: wf.name,
                              schedule: wf.schedule,
                              steps: wf.steps ? JSON.parse(wf.steps) : [],
                            })}
                          >
                            <Settings className="w-3 h-3 mr-1" /> Edit
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(wf.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      {wf.last_run && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Last run: {new Date(wf.last_run).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
