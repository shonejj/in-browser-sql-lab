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
  provider: 'openai' | 'gemini' | 'claude' | 'groq' | 'grok' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model: string;
}

const PROVIDER_CONFIGS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
  },
  gemini: {
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-pro',
    models: ['gemini-pro', 'gemini-pro-vision']
  },
  claude: {
    name: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-opus-20240229',
    models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'mixtral-8x7b-32768',
    models: ['mixtral-8x7b-32768', 'llama2-70b-4096']
  },
  grok: {
    name: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-beta',
    models: ['grok-beta']
  },
  custom: {
    name: 'Custom Endpoint',
    baseUrl: '',
    defaultModel: '',
    models: []
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
      const testUrl = provider === 'gemini' 
        ? `${baseUrl}/models?key=${apiKey}`
        : `${baseUrl}/models`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (provider !== 'gemini') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      if (provider === 'claude') {
        headers['anthropic-version'] = '2023-06-01';
      }

      const response = await fetch(testUrl, { headers });

      if (response.ok) {
        setTestSuccess(true);
        toast.success('Connection successful!');
      } else {
        const errorText = await response.text();
        toast.error(`Connection failed: ${response.statusText}`);
        console.error('API Error:', errorText);
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
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="claude">Anthropic Claude</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
                <SelectItem value="grok">xAI Grok</SelectItem>
                <SelectItem value="custom">Custom Endpoint</SelectItem>
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
              <Select value={model} onValueChange={setModel} disabled={!testSuccess}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerConfig.models.map((m) => (
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