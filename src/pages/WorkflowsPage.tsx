import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/duckdb';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Plus, Trash2, Play, Edit2, ArrowLeft, Zap, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  schedule?: string;
  steps?: any[];
  enabled?: boolean;
}

interface FormData {
  id?: string;
  name: string;
  schedule: string;
  steps: any[];
  enabled: boolean;
}

export function WorkflowsPage() {
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({ name: '', schedule: '0 0 * * *', steps: [], enabled: true });

  useEffect(() => { loadWorkflows(); }, []);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/workflows/list`);
      if (!res.ok) throw new Error('Failed to load workflows');
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (err: any) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!formData.name) { toast.error('Workflow name is required'); return; }
    try {
      const res = await fetch(`${backendUrl}/api/workflows/save`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: formData.id, name: formData.name, schedule: formData.schedule, steps: formData.steps }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Save failed'); }
      toast.success('Workflow saved');
      resetForm();
      loadWorkflows();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`${backendUrl}/api/workflows/delete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget }),
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Workflow deleted');
      loadWorkflows();
    } catch (err: any) { toast.error(err.message); }
    finally { setDeleteTarget(null); }
  };

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      const res = await fetch(`${backendUrl}/api/workflows/execute`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Execution failed'); }
      const result = await res.json();
      toast.success(result.message || 'Workflow executed');
    } catch (err: any) { toast.error(err.message); }
    finally { setExecutingId(null); }
  };

  const handleEdit = (workflow: Workflow) => {
    setFormData({ id: workflow.id, name: workflow.name, schedule: workflow.schedule || '0 0 * * *', steps: workflow.steps || [], enabled: workflow.enabled !== false });
    setShowForm(true);
  };

  const resetForm = () => { setFormData({ name: '', schedule: '0 0 * * *', steps: [], enabled: true }); setShowForm(false); };

  const getCronDescription = (cron: string) => {
    if (cron === '0 0 * * *') return 'Daily at midnight';
    if (cron === '0 0 * * 0') return 'Weekly on Sunday';
    if (cron === '0 0 1 * *') return 'Monthly on the 1st';
    if (cron === '*/15 * * * *') return 'Every 15 minutes';
    if (cron === '0 * * * *') return 'Hourly';
    return cron;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="p-2 hover:bg-muted rounded-lg transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-7 h-7 text-amber-500" /> Workflows
                </h1>
                <p className="text-sm text-muted-foreground">Schedule and manage automated tasks</p>
              </div>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Workflow
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-muted border-t-primary rounded-full"></div>
            <p className="text-muted-foreground mt-4">Loading workflows...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((workflow) => (
                <Card key={workflow.id} className="hover:border-primary/30 transition">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{workflow.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">{getCronDescription(workflow.schedule || '0 0 * * *')}</p>
                        </div>
                      </div>
                      {workflow.enabled ? <CheckCircle className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted rounded-lg p-3 mb-4">
                      <p className="text-xs text-muted-foreground mb-2">Steps: {workflow.steps?.length || 0}</p>
                      {workflow.steps && workflow.steps.length > 0 && (
                        <div className="space-y-1">
                          {workflow.steps.slice(0, 2).map((step: any, idx: number) => (
                            <div key={idx} className="text-xs flex items-start gap-2">
                              <span className="text-muted-foreground">→</span>
                              <span>{step.name || step.type || `Step ${idx + 1}`}</span>
                            </div>
                          ))}
                          {workflow.steps.length > 2 && <div className="text-xs text-muted-foreground">+{workflow.steps.length - 2} more</div>}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleExecute(workflow.id)} disabled={executingId === workflow.id} className="flex-1">
                        <Play className="w-3 h-3 mr-1" /> Run
                      </Button>
                      <Button size="sm" onClick={() => handleEdit(workflow)} variant="outline" className="flex-1">
                        <Edit2 className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" onClick={() => setDeleteTarget(workflow.id)} variant="outline" className="border-destructive/50 hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {workflows.length === 0 && !showForm && (
              <Card>
                <CardContent className="text-center py-12">
                  <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">No workflows created yet</p>
                  <Button onClick={() => setShowForm(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Create First Workflow
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Workflow Form Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => !o && resetForm()}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formData.id ? 'Edit' : 'New'} Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Workflow Name *</label>
              <Input placeholder="e.g., Daily Data Sync" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Schedule (Cron)</label>
              <Input placeholder="0 0 * * *" value={formData.schedule} onChange={(e) => setFormData({ ...formData, schedule: e.target.value })} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground mt-2">Current: {getCronDescription(formData.schedule)}</p>
              <div className="mt-3 text-xs space-y-1 bg-muted p-2 rounded">
                <p className="text-muted-foreground">Quick presets:</p>
                <div className="flex flex-wrap gap-1">
                  {[{ label: 'Hourly', value: '0 * * * *' }, { label: 'Daily', value: '0 0 * * *' }, { label: 'Weekly', value: '0 0 * * 0' }, { label: 'Monthly', value: '0 0 1 * *' }].map(preset => (
                    <Button key={preset.value} variant="secondary" size="sm" className="h-6 text-xs" onClick={() => setFormData({ ...formData, schedule: preset.value })}>
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Steps</label>
              <div className="bg-muted rounded-lg p-4 text-center">
                <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Step builder coming soon. Configure workflows via API.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <input type="checkbox" checked={formData.enabled} onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })} className="w-4 h-4 rounded" />
              <label className="text-sm">Enabled</label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={resetForm} variant="outline">Cancel</Button>
            <Button onClick={handleSubmit}>{formData.id ? 'Update' : 'Create'} Workflow</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete Workflow"
        description={`Are you sure you want to delete this workflow? This cannot be undone.`}
        onConfirm={handleDelete}
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  );
}
