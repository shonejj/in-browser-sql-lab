import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/duckdb';
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
  const [formData, setFormData] = useState<FormData>({
    name: '',
    schedule: '0 0 * * *',
    steps: [],
    enabled: true,
  });

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/workflows/list`);
      if (!res.ok) throw new Error('Failed to load workflows');
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error('Workflow name is required');
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/workflows/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formData.id,
          name: formData.name,
          schedule: formData.schedule,
          steps: formData.steps,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Save failed');
      }

      toast.success('Workflow saved');
      resetForm();
      loadWorkflows();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    const workflow = workflows.find(w => w.id === id);
    if (!confirm(`Delete workflow "${workflow?.name}"?`)) return;

    try {
      const res = await fetch(`${backendUrl}/api/workflows/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error('Delete failed');
      toast.success('Workflow deleted');
      loadWorkflows();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      const res = await fetch(`${backendUrl}/api/workflows/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Execution failed');
      }

      const result = await res.json();
      toast.success(result.message || 'Workflow executed');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setExecutingId(null);
    }
  };

  const handleEdit = (workflow: Workflow) => {
    setFormData({
      id: workflow.id,
      name: workflow.name,
      schedule: workflow.schedule || '0 0 * * *',
      steps: workflow.steps || [],
      enabled: workflow.enabled !== false,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      schedule: '0 0 * * *',
      steps: [],
      enabled: true,
    });
    setShowForm(false);
  };

  const getCronDescription = (cron: string) => {
    const parts = cron.split(' ');
    if (parts.length !== 5) return cron;

    if (cron === '0 0 * * *') return 'Daily at midnight';
    if (cron === '0 0 * * 0') return 'Weekly on Sunday at midnight';
    if (cron === '0 0 1 * *') return 'Monthly on the 1st at midnight';
    if (cron === '*/15 * * * *') return 'Every 15 minutes';
    if (cron === '0 * * * *') return 'Hourly';
    
    return cron;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="border-b border-slate-700 bg-slate-800/50 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="p-2 hover:bg-slate-700 rounded-lg transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Zap className="w-7 h-7 text-amber-400" />
                  Workflows
                </h1>
                <p className="text-sm text-slate-400">Schedule and manage automated tasks</p>
              </div>
            </div>
            <Button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Workflow
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-slate-600 border-t-blue-400 rounded-full"></div>
            <p className="text-slate-400 mt-4">Loading workflows...</p>
          </div>
        ) : (
          <>
            {/* Workflows Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workflows.map((workflow) => (
                <Card key={workflow.id} className="bg-slate-800 border-slate-700 hover:border-slate-600 transition">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-white text-lg">{workflow.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          <p className="text-xs text-slate-400">
                            {getCronDescription(workflow.schedule || '0 0 * * *')}
                          </p>
                        </div>
                      </div>
                      {workflow.enabled ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-400" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-slate-700/50 rounded-lg p-3 mb-4">
                      <p className="text-xs text-slate-400 mb-2">Steps: {workflow.steps?.length || 0}</p>
                      {workflow.steps && workflow.steps.length > 0 && (
                        <div className="space-y-1">
                          {workflow.steps.slice(0, 2).map((step: any, idx: number) => (
                            <div key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                              <span className="text-slate-500">→</span>
                              <span>{step.name || step.type || `Step ${idx + 1}`}</span>
                            </div>
                          ))}
                          {workflow.steps.length > 2 && (
                            <div className="text-xs text-slate-400">
                              +{workflow.steps.length - 2} more steps
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleExecute(workflow.id)}
                        disabled={executingId === workflow.id}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Run
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleEdit(workflow)}
                        variant="outline"
                        className="flex-1 border-slate-600 hover:bg-slate-700"
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDelete(workflow.id)}
                        variant="outline"
                        className="border-red-600/50 hover:bg-red-600/20 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {workflows.length === 0 && !showForm && (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="text-center py-12">
                  <Zap className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4">No workflows created yet</p>
                  <Button
                    onClick={() => setShowForm(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Workflow
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Workflow Form Dialog */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl bg-slate-800 border-slate-700 max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle className="text-white">
                  {formData.id ? 'Edit' : 'New'} Workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-2">Workflow Name *</label>
                  <Input
                    placeholder="e.g., Daily Data Sync"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300 block mb-2">Schedule (Cron)</label>
                  <Input
                    placeholder="0 0 * * * (Daily at midnight)"
                    value={formData.schedule}
                    onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                    className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 font-mono text-xs"
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    Current: {getCronDescription(formData.schedule)}
                  </p>
                  <div className="mt-3 text-xs text-slate-400 space-y-1 bg-slate-700/50 p-2 rounded">
                    <p>Quick presets:</p>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: 'Hourly', value: '0 * * * *' },
                        { label: 'Daily', value: '0 0 * * *' },
                        { label: 'Weekly', value: '0 0 * * 0' },
                        { label: 'Monthly', value: '0 0 1 * *' },
                      ].map(preset => (
                        <button
                          key={preset.value}
                          onClick={() => setFormData({ ...formData, schedule: preset.value })}
                          className="text-xs bg-slate-600 hover:bg-slate-500 px-2 py-1 rounded transition"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-300 block mb-2">Steps</label>
                  <div className="bg-slate-700/50 rounded-lg p-4 text-center">
                    <Zap className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">
                      Step builder coming soon. For now, configure workflows programmatically.
                    </p>
                    <p className="text-xs text-slate-500 mt-2">
                      Define steps via API for complex automations
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label className="text-sm text-slate-300">Enabled</label>
                </div>

                <div className="flex gap-2 justify-end pt-4 border-t border-slate-700">
                  <Button
                    onClick={resetForm}
                    variant="outline"
                    className="border-slate-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {formData.id ? 'Update' : 'Create'} Workflow
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
