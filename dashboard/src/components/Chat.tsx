import { useState, useRef, useEffect } from 'react';
import { Send, Square, Loader2 } from 'lucide-react';
import { sendMessage, type Message, getSelectedModel, MODELS } from '../lib/ai';
import { Tooltip } from './Tooltip';

interface ChatProps {
  messages: Message[];
  onMessagesChange: (msgs: Message[]) => void;
  showGuide: boolean;
}

export function Chat({ messages, onMessagesChange, showGuide }: ChatProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const currentModel = MODELS.find(m => m.id === getSelectedModel());

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    onMessagesChange(newMessages);
    setInput('');
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    onMessagesChange([...newMessages, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendMessage(newMessages, (chunk) => {
        assistantMsg.content += chunk;
        onMessagesChange([...newMessages, { ...assistantMsg }]);
      }, controller.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        assistantMsg.content += `\n\n⚠️ ${e.message}`;
        onMessagesChange([...newMessages, { ...assistantMsg }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl border border-border flex items-center justify-center bg-card">
                <div className="w-3 h-3 rounded-full bg-accent/30 animate-pulse" />
              </div>
              <div>
                <p className="text-text-2 text-sm font-medium">Eclipse Sentinel</p>
                <p className="text-text-3 text-xs mt-1">{currentModel?.name || 'AI'} · OpenRouter · Free</p>
              </div>
              {showGuide && (
                <div className="mt-4 bg-accent/5 border border-accent/10 rounded-xl px-4 py-3 max-w-sm mx-auto">
                  <p className="text-accent/70 text-[11px] leading-relaxed">
                    💡 Напишите вопрос в поле ввода снизу и нажмите Enter или кнопку отправки. AI ответит в режиме стриминга.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-accent/8 border border-accent/15 text-text-1 rounded-br-md'
                : 'bg-card border border-border text-text-2 rounded-bl-md'
            }`}>
              {msg.content || (
                <span className="flex items-center gap-2 text-text-3">
                  <Loader2 size={14} className="animate-spin" /> Думаю...
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 sm:p-4">
        <Tooltip text="Введите сообщение. Enter — отправить. Shift+Enter — новая строка." show={showGuide}>
          <div className="flex gap-2">
            <input ref={inputRef} type="text" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Спроси что-нибудь..."
              disabled={streaming}
              className="chat-input flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-1 placeholder:text-text-3 disabled:opacity-50 transition-all" />
            {streaming ? (
              <button onClick={() => abortRef.current?.abort()}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors shrink-0">
                <Square size={16} />
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim()}
                className="w-11 h-11 flex items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors disabled:opacity-30 shrink-0">
                <Send size={16} />
              </button>
            )}
          </div>
        </Tooltip>
      </div>
    </div>
  );
}
