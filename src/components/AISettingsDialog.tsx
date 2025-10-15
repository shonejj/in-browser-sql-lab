import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface AISettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: AIConfig) => void;
  currentConfig?: AIConfig;
}

export interface AIConfig {
  provider: 'gemini' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const PROVIDER_CONFIGS = {
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1',
    defaultModel: 'gemini-pro',
    models: ['gemini-pro', 'gemini-pro-vision']
  },
  custom: {
    name: 'Custom (OpenAI-compatible)',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-3.5-turbo',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
  }
};

export function AISettingsDialog({ open, onOpenChange, onSave, currentConfig }: AISettingsDialogProps) {
  const [provider, setProvider] = useState<AIConfig['provider']>(currentConfig?.provider || 'openai');
  const [apiKey, setApiKey] = useState(currentConfig?.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(currentConfig?.baseUrl || PROVIDER_CONFIGS.openai.baseUrl);
  const [model, setModel] = useState(currentConfig?.model || PROVIDER_CONFIGS.openai.defaultModel);
  const [customModel, setCustomModel] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [dynamicModels, setDynamicModels] = useState<string[] | null>(null);

  const handleProviderChange = (newProvider: AIConfig['provider']) => {
    setProvider(newProvider);
    const config = PROVIDER_CONFIGS[newProvider];
    setBaseUrl(config.baseUrl);
    setModel(config.defaultModel);
    setTestSuccess(false);
  };

  const handleTestConnection = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    setIsTesting(true);
    setTestSuccess(false);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (provider === 'gemini') {
        // Use x-goog-api-key header (matches provided curl); try v1/v1beta model-list endpoints
        const candidates = [
          `${baseUrl}/models`,
          `${baseUrl}/v1/models`,
          `${baseUrl}/v1/beta/models`,
        ];

        let ok = false;
        let lastErr = '';
        for (const url of candidates) {
          try {
            const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey } });
            if (res.ok) {
              ok = true;
              // Try to parse model list from response body and populate dynamicModels
              try {
                const json = await res.json();
                // Common shape: { models: [...] } or plain array. Each model object often has a 'name' field like 'models/gemini-2.5-flash'
                const rawList: any[] | null = Array.isArray(json.models) ? json.models : (Array.isArray(json) ? json : null);
                if (rawList && rawList.length) {
                  const modelsParsed = rawList.map((m: any) => {
                    // Prefer canonical resource name if available (e.g. 'models/gemini-2.5-flash')
                    if (typeof m === 'string') return String(m).replace(/^models\//, '');
                    if (m.name) {
                      // extract final segment
                      return String(m.name).replace(/^models\//, '').split('/').pop();
                    }
                    // fallback to displayName by slugifying it (lowercase, replace spaces with '-')
                    if (m.displayName) return String(m.displayName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    if (m.model) return String(m.model).replace(/^models\//, '');
                    return null;
                  }).filter(Boolean) as string[];
                  setDynamicModels(modelsParsed);
                  // set default to first if not already chosen
                  setModel((prev) => prev || String(modelsParsed[0]));
                }
              } catch (e) {
                console.warn('Failed to parse Gemini models list body', e);
              }
              break;
            }
            const body = await res.text().catch(() => '<no body>');
            lastErr = `URL ${url} -> ${res.status} ${res.statusText}: ${body}`;
            console.warn('Gemini test candidate failed:', lastErr);
          } catch (e) {
            lastErr = String(e);
            console.error('Gemini test error for', url, e);
          }
        }

        if (ok) {
          setTestSuccess(true);
          toast.success('Connection successful!');
        } else {
          toast.error('Connection failed: see console for details');
          console.error('Gemini connection failures:', lastErr);
        }
      } else if (provider === 'groq') {
        // Groq exposes endpoints under /v1 but not necessarily /v1/models; check common endpoints
        const candidates = [
          `${baseUrl}/v1/models`,
          `${baseUrl}/models`,
          `${baseUrl}/v1`,
        ];

        let ok = false;
        let lastErr = '';
        for (const url of candidates) {
          try {
            const res = await fetch(url, { headers: { ...headers, Authorization: `Bearer ${apiKey}` } });
            if (res.ok) {
              ok = true;
              break;
            }
            const body = await res.text().catch(() => '<no body>');
            lastErr = `URL ${url} -> ${res.status} ${res.statusText}: ${body}`;
            console.warn('Groq test candidate failed:', lastErr);
          } catch (e) {
            lastErr = String(e);
            console.error('Groq test error for', url, e);
          }
        }

        if (ok) {
          setTestSuccess(true);
          toast.success('Connection successful!');
        } else {
          toast.error('Connection failed: see console for details');
          console.error('Groq connection failures:', lastErr);
        }
      } else {
        // Default behavior: call /models with Authorization header
        const testUrl = `${baseUrl}/models`;
        headers['Authorization'] = `Bearer ${apiKey}`;

        if (provider === 'claude') {
          headers['anthropic-version'] = '2023-06-01';
        }

        const response = await fetch(testUrl, { headers });

        if (response.ok) {
          setTestSuccess(true);
          toast.success('Connection successful!');
        } else {
          const errorText = await response.text().catch(() => '<no body>');
          toast.error(`Connection failed: ${response.statusText}`);
          console.error('API Error:', response.status, response.statusText, errorText);
        }
      }
    } catch (error) {
      toast.error(`Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Test connection error:', error);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key');
      return;
    }

    if (!testSuccess) {
      toast.error('Please test the connection first');
      return;
    }

    const finalModel = provider === 'custom' ? customModel : model;
    if (!finalModel) {
      toast.error('Please select or enter a model');
      return;
    }

    onSave({
      provider,
      apiKey,
      baseUrl,
      model: finalModel
    });

    toast.success('AI settings saved!');
    onOpenChange(false);
  };

  const providerConfig = PROVIDER_CONFIGS[provider];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>AI Assistant Settings</DialogTitle>
          <DialogDescription>
            Configure your AI provider to enable SQL query assistance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={provider} onValueChange={handleProviderChange}>
              <SelectTrigger id="provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="custom">Custom (OpenAI-compatible)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder={`Enter your ${providerConfig.name} API key`}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestSuccess(false);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="https://api.example.com/v1"
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value);
                setTestSuccess(false);
              }}
              disabled={provider !== 'custom'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            {provider === 'custom' ? (
              <Input
                id="model"
                placeholder="Enter model name"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
              />
            ) : (
              <Select value={model} onValueChange={setModel} disabled={!testSuccess && !dynamicModels}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(dynamicModels || providerConfig.models).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!testSuccess && provider !== 'custom' && (
              <p className="text-xs text-muted-foreground">Test connection first to select a model</p>
            )}
          </div>

          <Button
            onClick={handleTestConnection}
            disabled={isTesting || !apiKey.trim()}
            variant="outline"
            className="w-full"
          >
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : testSuccess ? (
              <>
                <Check className="mr-2 h-4 w-4 text-green-500" />
                Connection Successful
              </>
            ) : (
              'Test Connection'
            )}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!testSuccess}>
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}