import { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Bot, Send, X, Loader2, Settings, Sparkles } from 'lucide-react';
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

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const tableContext = getTableContext();
      const systemPrompt = `You are a helpful SQL assistant for DuckDB. Here are the available tables:\n\n${tableContext}\n\nGenerate only valid DuckDB SQL queries. Keep responses concise and provide working SQL code in a code block.`;
      
      let response: Response;
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

      if (aiConfig.provider === 'gemini') {
        // Gemini API has different format
        const geminiUrl = `${aiConfig.baseUrl}/chat/completions?key=${aiConfig.apiKey}`;
        response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: aiConfig.model,
            messages,
            temperature: 0.7,
            max_tokens: 512,
          }),
        });
      } else if (aiConfig.provider === 'claude') {
        // Claude API format
        response = await fetch(`${aiConfig.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiConfig.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: aiConfig.model,
            messages: messages.filter(m => m.role !== 'system'),
            system: systemPrompt,
            max_tokens: 512,
          }),
        });
      } else {
        // OpenAI-compatible format (OpenAI, Groq, Grok, Custom)
        response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`,
          },
          body: JSON.stringify({
            model: aiConfig.model,
            messages,
            temperature: 0.7,
            max_tokens: 512,
          }),
        });
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      let assistantResponse: string;

      if (aiConfig.provider === 'claude') {
        assistantResponse = data.content?.[0]?.text || 'Sorry, I could not generate a response.';
      } else {
        assistantResponse = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
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