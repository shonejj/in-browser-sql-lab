import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Bot, Send, X, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';

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
  const [engine, setEngine] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const initializeModel = async () => {
    if (engine || isInitializing) return;
    
    setIsInitializing(true);
    toast.loading('Loading AI model... This may take a minute.', { id: 'ai-init' });
    
    try {
      // Load WebLLM from CDN
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm' as any);
      
      // Use a tiny, fast model
      const selectedModel = "Phi-1.5-q4f16_1-MLC";
      
      const engineInstance = await CreateMLCEngine(selectedModel, {
        initProgressCallback: (info: any) => {
          if (info.text) {
            console.log('Loading:', info.text);
          }
        }
      });
      
      setEngine(engineInstance);
      toast.success('AI model loaded successfully!', { id: 'ai-init' });
      
      // Add welcome message
      setMessages([{
        role: 'assistant',
        content: 'Hi! I\'m your SQL assistant. I can help you write DuckDB queries based on your tables. What would you like to query?'
      }]);
    } catch (error) {
      console.error('Failed to initialize model:', error);
      toast.error('Failed to load AI model. Please try again.', { id: 'ai-init' });
    } finally {
      setIsInitializing(false);
    }
  };

  const getTableContext = () => {
    if (tables.length === 0) return 'No tables available.';
    
    return tables.map(table => {
      const columns = table.columns.map(col => `  - ${col.name} (${col.type})`).join('\n');
      return `Table: ${table.name}\n${columns}`;
    }).join('\n\n');
  };

  const handleSend = async () => {
    if (!input.trim() || !engine) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const tableContext = getTableContext();
      const systemPrompt = `You are a helpful SQL assistant for DuckDB. Here are the available tables:\n\n${tableContext}\n\nGenerate only valid DuckDB SQL queries. Keep responses concise and provide working SQL code in a code block.`;
      
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 256,
      });

      const assistantResponse = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: assistantResponse 
      }]);
    } catch (error) {
      console.error('Error generating response:', error);
      toast.error('Failed to generate response');
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const extractSQLQuery = (text: string): string | null => {
    // Try to extract SQL from code blocks
    const codeBlockMatch = text.match(/```sql\n([\s\S]*?)\n```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();
    
    const codeMatch = text.match(/```([\s\S]*?)```/);
    if (codeMatch) return codeMatch[1].trim();
    
    // Try to find SQL keywords
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
        onClick={() => {
          setIsOpen(true);
          if (!engine && !isInitializing) {
            initializeModel();
          }
        }}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">SQL Assistant</h3>
            <p className="text-xs text-muted-foreground">
              {isInitializing ? 'Loading...' : engine ? 'Ready' : 'Click to initialize'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(false)}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {!engine && !isInitializing && (
            <div className="text-center py-8">
              <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Click below to initialize the AI assistant
              </p>
              <Button onClick={initializeModel} disabled={isInitializing}>
                {isInitializing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading Model...
                  </>
                ) : (
                  'Initialize AI'
                )}
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

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && engine && handleSend()}
            placeholder={engine ? "Ask me to write a query..." : "Initialize AI first"}
            disabled={!engine || isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!engine || isLoading || !input.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Powered by Phi-1.5 running in your browser
        </p>
      </div>
    </Card>
  );
}