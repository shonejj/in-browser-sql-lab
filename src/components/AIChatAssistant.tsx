import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Bot, Send, X, Loader2, Settings, Sparkles, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { AISettingsDialog, AIConfig } from './AISettingsDialog';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AIChatAssistantProps {
  tables: Array<{ name: string; columns: { name: string; type: string }[] }>;
  onQuerySelect: (query: string) => void;
}

export function AIChatAssistant({ tables, onQuerySelect }: AIChatAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiConfig, setAIConfig] = useState<AIConfig | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Load saved config from localStorage
    const saved = localStorage.getItem('ai-config');
    if (saved) {
      try {
        setAIConfig(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load AI config:', e);
      }
    }
  }, []);

  const handleSaveConfig = (config: AIConfig) => {
    setAIConfig(config);
    localStorage.setItem('ai-config', JSON.stringify(config));
    setMessages([{
      role: 'assistant',
      content: 'Hi! I\'m your SQL assistant. I can help you write DuckDB queries based on your tables. What would you like to query?'
    }]);
  };

  const getTableContext = () => {
    if (tables.length === 0) return 'No tables available.';
    
    return tables.map(table => {
      const columns = table.columns.map(col => `  - ${col.name} (${col.type})`).join('\n');
      return `Table: ${table.name}\n${columns}`;
    }).join('\n\n');
  };

  const handleSend = async () => {
    if (!input.trim() || !aiConfig) return;
    // Enforce memory limit: keep only the last N non-system messages when sending
    const memoryLimit = 2;
    const userMessage = input.trim();
    // Snapshot previous messages (state may update asynchronously)
    const prevMessages = messages.slice();
    // Immediately show user's message in UI
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const tableContext = getTableContext();
      const systemPrompt = `You are a helpful SQL assistant for DuckDB. Here are the available tables:\n\n${tableContext}\n\nGenerate only valid DuckDB SQL queries. Keep responses concise and provide working SQL code in a code block.`;
      
      let response: Response;
      // Build messages with memory limit: take only the last N messages prior to this turn
      const history = prevMessages.slice(-memoryLimit);
      const messagesToSend = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage }
      ];

  if (aiConfig.provider === 'gemini') {
        // Gemini API: follow the curl example using x-goog-api-key header.
        // Try v1 and v1beta variants and multiple method names until one succeeds.
        const base = aiConfig.baseUrl.replace(/\/$/, '');
        const variants = new Set<string>([base]);
        // Add common alternates if base contains v1 or v1beta
        if (base.includes('/v1')) variants.add(base.replace(/\/v1$/, '/v1beta'));
        if (base.includes('/v1beta')) variants.add(base.replace(/\/v1beta$/, '/v1'));

  const methodNames = ['generateContent'];
  const geminiCandidates: string[] = [];
        // Normalize model id: strip any 'models/' prefix or project segments. If model contains spaces, also build a slug fallback.
        const rawModel = String(aiConfig.model);
        const modelIdBase = rawModel.split('/').pop() || rawModel;
        const slugModel = modelIdBase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const modelCandidates = Array.from(new Set([modelIdBase, slugModel]));
        for (const v of Array.from(variants)) {
          for (const m of methodNames) {
            for (const mid of modelCandidates) {
              geminiCandidates.push(`${v}/models/${mid}:${m}`);
            }
          }
        }

        let lastErrText = '';
        let ok = false;
        for (const url of geminiCandidates) {
          try {
            // Non-streaming Gemini request using the generateContent shape (contents/parts)
            response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': aiConfig.apiKey },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { text: systemPrompt },
                      { text: userMessage }
                    ]
                  }
                ]
              }),
            });

            if (response.ok) {
              ok = true;
              break;
            }

            const text = await response.text().catch(() => '<no body>');
            lastErrText = `URL ${url} -> ${response.status} ${response.statusText}: ${text}`;
            console.warn('Gemini candidate failed:', lastErrText);
          } catch (err) {
            // fetch() TypeError often indicates network/CORS issues in browser
            console.error('Gemini request error for', url, err);
            lastErrText = String(err);
            if (err instanceof TypeError) {
              // Provide a clearer hint about CORS and proxy requirement
              lastErrText += ' (Possible CORS or network error - browser requests to Google APIs may be blocked; consider using a server-side proxy with your API key)';
            }
          }
        }

        if (!ok) {
          throw new Error(`Gemini endpoints failed. Last error: ${lastErrText}`);
        }
      } else {
        // Custom/OpenAI-compatible provider
        // Simple non-streaming OpenAI-compatible request
        response = await fetch(`${aiConfig.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: aiConfig.model,
            messages: messagesToSend,
            temperature: 0.7,
            max_tokens: 512
          }),
        });
      }

      if (!response.ok) {
        // Include response body in the thrown error to make debugging easier (shows server error details)
        const text = await response.text().catch(() => '<no body>');
        throw new Error(`API error: ${response.status} ${response.statusText} - ${text}`);
      }

      const data = await response.json();
      let assistantResponse: string;

      if (aiConfig.provider === 'gemini') {
        assistantResponse =
          data.candidates?.[0]?.content?.parts?.[0]?.text ||
          data.candidates?.[0]?.content?.text ||
          data.result?.content?.parts?.[0]?.text ||
          data.output?.[0]?.content?.text ||
          data.outputText ||
          data.content?.[0]?.text ||
          JSON.stringify(data);
      } else {
        // Custom/OpenAI-compatible
        assistantResponse = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.choices?.[0]?.delta?.content || JSON.stringify(data);
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: assistantResponse 
      }]);
    } catch (error) {
      console.error('Error generating response:', error);
      toast.error('Failed to generate response');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please check your API settings and try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const extractSQLQuery = (text: string): string | null => {
    const codeBlockMatch = text.match(/```sql\n([\s\S]*?)\n```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();
    
    const codeMatch = text.match(/```([\s\S]*?)```/);
    if (codeMatch) return codeMatch[1].trim();
    
    const sqlMatch = text.match(/(SELECT|WITH|CREATE|INSERT|UPDATE|DELETE)[\s\S]*?(?:;|$)/i);
    if (sqlMatch) return sqlMatch[0].trim();
    
    return null;
  };

  const handleUseQuery = (messageContent: string) => {
    const query = extractSQLQuery(messageContent);
    if (query) {
      onQuerySelect(query);
      toast.success('Query copied to editor');
    } else {
      toast.error('No SQL query found in message');
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        <Sparkles className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <>
      <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl flex flex-col z-50">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">SQL Assistant</h3>
              <p className="text-xs text-muted-foreground">
                {aiConfig ? 'Ready' : 'Configure AI provider'}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="h-8 w-8"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // Reset chat
                setMessages([{ role: 'assistant', content: "Hi! I'm your SQL assistant. I can help you write DuckDB queries based on your tables. What would you like to query?" }]);
              }}
              className="h-8 w-8"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {!aiConfig && (
              <div className="text-center py-8">
                <Settings className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-4">
                  Configure your AI provider to get started
                </p>
                <Button onClick={() => setSettingsOpen(true)}>
                  Configure AI
                </Button>
              </div>
            )}

            {messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && extractSQLQuery(message.content) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUseQuery(message.content)}
                      className="mt-2 h-7 text-xs"
                    >
                      Use Query
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isLoading && aiConfig && handleSend()}
              placeholder={aiConfig ? "Ask me to write a query..." : "Configure AI first"}
              disabled={!aiConfig || isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!aiConfig || isLoading || !input.trim()}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {aiConfig ? `Using ${aiConfig.provider} (${aiConfig.model})` : 'No AI configured'}
          </p>
        </div>
      </Card>

      <AISettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSave={handleSaveConfig}
        currentConfig={aiConfig || undefined}
      />
    </>
  );
}