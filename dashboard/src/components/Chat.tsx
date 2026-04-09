import { useState, useRef, useEffect } from 'react';
import { Send, Square, Loader2 } from 'lucide-react';
import { sendMessage, type Message } from '../lib/ai';

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages([...newMessages, assistantMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendMessage(newMessages, (chunk) => {
        assistantMsg.content += chunk;
        setMessages([...newMessages, { ...assistantMsg }]);
      }, controller.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        assistantMsg.content += `\n\n⚠️ Ошибка: ${e.message}`;
        setMessages([...newMessages, { ...assistantMsg }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-border flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-accent/40 animate-pulse" />
              </div>
              <p className="text-text-2 text-sm">Eclipse Sentinel</p>
              <p className="text-text-3 text-xs mt-1">Qwen 3.6 · OpenRouter</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-accent/10 border border-accent/20 text-text-1'
                  : 'bg-card border border-border text-text-2'
              }`}
            >
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
      <div className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Спроси что-нибудь..."
            disabled={streaming}
            className="chat-input flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-1 placeholder:text-text-3 disabled:opacity-50 transition-all"
          />
          {streaming ? (
            <button onClick={handleStop} className="w-11 h-11 flex items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
              <Square size={16} />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim()} className="w-11 h-11 flex items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors disabled:opacity-30">
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
