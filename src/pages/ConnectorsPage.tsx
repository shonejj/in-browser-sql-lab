import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from 'sonner';
import { getBackendUrl } from '@/lib/duckdb';
import {
  Plus, Trash2, Edit2, TestTube, ArrowLeft, Database,
  Cloud, Server, Key, Globe, CheckCircle, AlertCircle
} from 'lucide-react';

interface Connection {
  name: string;
  type: string;
  host?: string;
  port?: number;
  database_name?: string;
  username?: string;
  s3_endpoint?: string;
  s3_bucket?: string;
  s3_region?: string;
}

interface FormData {
  name: string;
  type: 'mysql' | 's3' | 'postgresql' | 'duckdb' | '';
  host?: string;
  port?: string;
  database_name?: string;
  username?: string;
  password?: string;
  s3_endpoint?: string;
  s3_access_key?: string;
  s3_secret_key?: string;
  s3_bucket?: string;
  s3_region?: string;
}

const CONNECTION_TYPES = [
  { value: 'mysql', label: 'MySQL', icon: Database, color: 'text-orange-400' },
  { value: 'postgresql', label: 'PostgreSQL', icon: Database, color: 'text-blue-400' },
  { value: 's3', label: 'S3 / MinIO', icon: Cloud, color: 'text-amber-400' },
  { value: 'duckdb', label: 'DuckDB', icon: Database, color: 'text-green-400' },
];

export function ConnectorsPage() {
  const navigate = useNavigate();
  const backendUrl = getBackendUrl();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [testingName, setTestingName] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    type: '',
    host: '',
    port: '',
    database_name: '',
    username: '',
    password: '',
    s3_endpoint: '',
    s3_access_key: '',
    s3_secret_key: '',
    s3_bucket: '',
    s3_region: 'us-east-1',
  });

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/connections`);
      if (!res.ok) throw new Error('Failed to load connections');
      const data = await res.json();
      setConnections(data.connections || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.type) {
      toast.error('Name and type are required');
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/connections/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          ...(formData.type === 's3' && {
            s3_endpoint: formData.s3_endpoint,
            s3_access_key: formData.s3_access_key,
            s3_secret_key: formData.s3_secret_key,
            s3_bucket: formData.s3_bucket,
            s3_region: formData.s3_region,
          }),
          ...(['mysql', 'postgresql'].includes(formData.type) && {
            host: formData.host,
            port: formData.port ? parseInt(formData.port) : undefined,
            database_name: formData.database_name,
            username: formData.username,
            password: formData.password,
          }),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Save failed');
      }

      toast.success('Connection saved');
      resetForm();
      loadConnections();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete connection "${name}"?`)) return;

    try {
      const res = await fetch(`${backendUrl}/api/connections/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) throw new Error('Delete failed');
      toast.success('Connection deleted');
      loadConnections();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTest = async (name: string) => {
    setTestingName(name);
    try {
      const conn = connections.find(c => c.name === name);
      if (!conn) return;

      const res = await fetch(`${backendUrl}/api/connections/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conn),
      });

      if (res.ok) {
        toast.success('Connection successful');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Connection failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTestingName(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: '',
      host: '',
      port: '',
      database_name: '',
      username: '',
      password: '',
      s3_endpoint: '',
      s3_access_key: '',
      s3_secret_key: '',
      s3_bucket: '',
      s3_region: 'us-east-1',
    });
    setEditingName(null);
    setShowForm(false);
  };

  const getConnectionTypeIcon = (type: string) => {
    const connType = CONNECTION_TYPES.find(ct => ct.value === type);
    return connType ? connType.icon : Database;
  };

  const getConnectionTypeLabel = (type: string) => {
    const connType = CONNECTION_TYPES.find(ct => ct.value === type);
    return connType ? connType.label : type;
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
                  <Cloud className="w-7 h-7 text-cyan-400" />
                  Connectors
                </h1>
                <p className="text-sm text-slate-400">Manage database and cloud storage connections</p>
              </div>
            </div>
            <Button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Connection
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-slate-600 border-t-blue-400 rounded-full"></div>
            <p className="text-slate-400 mt-4">Loading connections...</p>
          </div>
        ) : (
          <>
            {/* Connections Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connections.map((conn) => {
                const IconComponent = getConnectionTypeIcon(conn.type);
                return (
                  <Card key={conn.name} className="bg-slate-800 border-slate-700 hover:border-slate-600 transition">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <IconComponent className="w-5 h-5 text-cyan-400" />
                          <div>
                            <CardTitle className="text-white text-lg">{conn.name}</CardTitle>
                            <p className="text-xs text-slate-400 mt-1">
                              {getConnectionTypeLabel(conn.type)}
                            </p>
                          </div>
                        </div>
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm mb-4">
                        {conn.type === 's3' ? (
                          <>
                            {conn.s3_endpoint && (
                              <div className="flex items-start gap-2">
                                <span className="text-slate-400">Endpoint:</span>
                                <span className="text-slate-200 font-mono text-xs break-all">
                                  {conn.s3_endpoint}
                                </span>
                              </div>
                            )}
                            {conn.s3_bucket && (
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Bucket:</span>
                                <span className="text-slate-200">{conn.s3_bucket}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            {conn.host && (
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Host:</span>
                                <span className="text-slate-200">{conn.host}</span>
                              </div>
                            )}
                            {conn.port && (
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Port:</span>
                                <span className="text-slate-200">{conn.port}</span>
                              </div>
                            )}
                            {conn.database_name && (
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Database:</span>
                                <span className="text-slate-200">{conn.database_name}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleTest(conn.name)}
                          disabled={testingName === conn.name}
                          variant="outline"
                          className="flex-1 border-slate-600 hover:bg-slate-700"
                        >
                          <TestTube className="w-3 h-3 mr-1" />
                          Test
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleDelete(conn.name)}
                          variant="outline"
                          className="flex-1 border-red-600/50 hover:bg-red-600/20 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {connections.length === 0 && !showForm && (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="text-center py-12">
                  <Cloud className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 mb-4">No connections configured yet</p>
                  <Button
                    onClick={() => setShowForm(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Connection
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Connection Form Dialog */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl bg-slate-800 border-slate-700 max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle className="text-white">New Connection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-slate-300 block mb-2">Connection Name *</label>
                  <Input
                    placeholder="e.g., Production MySQL"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-300 block mb-2">Type *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CONNECTION_TYPES.map(type => (
                      <button
                        key={type.value}
                        onClick={() => setFormData({ ...formData, type: type.value as any })}
                        className={`p-3 rounded-lg border transition ${
                          formData.type === type.value
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Database Configuration */}
                {['mysql', 'postgresql'].includes(formData.type) && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Host *</label>
                        <Input
                          placeholder="localhost"
                          value={formData.host || ''}
                          onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Port</label>
                        <Input
                          placeholder={formData.type === 'mysql' ? '3306' : '5432'}
                          value={formData.port || ''}
                          onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-slate-300 block mb-2">Database Name</label>
                      <Input
                        placeholder="database"
                        value={formData.database_name || ''}
                        onChange={(e) => setFormData({ ...formData, database_name: e.target.value })}
                        className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Username</label>
                        <Input
                          placeholder="root"
                          value={formData.username || ''}
                          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Password</label>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          value={formData.password || ''}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* S3 Configuration */}
                {formData.type === 's3' && (
                  <>
                    <div>
                      <label className="text-sm text-slate-300 block mb-2">Endpoint</label>
                      <Input
                        placeholder="minio:9000"
                        value={formData.s3_endpoint || ''}
                        onChange={(e) => setFormData({ ...formData, s3_endpoint: e.target.value })}
                        className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Access Key</label>
                        <Input
                          placeholder="minioadmin"
                          value={formData.s3_access_key || ''}
                          onChange={(e) => setFormData({ ...formData, s3_access_key: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Secret Key</label>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          value={formData.s3_secret_key || ''}
                          onChange={(e) => setFormData({ ...formData, s3_secret_key: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Bucket</label>
                        <Input
                          placeholder="duckdb-data"
                          value={formData.s3_bucket || ''}
                          onChange={(e) => setFormData({ ...formData, s3_bucket: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-slate-300 block mb-2">Region</label>
                        <Input
                          placeholder="us-east-1"
                          value={formData.s3_region || ''}
                          onChange={(e) => setFormData({ ...formData, s3_region: e.target.value })}
                          className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                        />
                      </div>
                    </div>
                  </>
                )}

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
                    Save Connection
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
