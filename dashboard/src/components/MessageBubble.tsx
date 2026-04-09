import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type Message } from '../lib/ai';
import { Copy, Check, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { speak } from '../lib/voice';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-md bg-accent/8 border border-accent/15 text-text-1 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start group">
      <div className="max-w-[85%] relative">
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-card border border-border text-sm leading-relaxed prose-sentinel">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const codeStr = String(children).replace(/\n$/, '');
                if (match) {
                  return (
                    <div className="relative my-3 -mx-1">
                      <div className="flex items-center justify-between px-3 py-1.5 bg-bg border border-border rounded-t-lg">
                        <span className="text-[10px] text-text-3 uppercase tracking-wider">{match[1]}</span>
                        <button onClick={() => handleCopy(codeStr)}
                          className="flex items-center gap-1 text-[10px] text-text-3 hover:text-accent transition-colors">
                          {copied ? <Check size={10} /> : <Copy size={10} />}
                          {copied ? 'Скопировано' : 'Копировать'}
                        </button>
                      </div>
                      <pre className="bg-bg border border-t-0 border-border rounded-b-lg p-3 overflow-x-auto">
                        <code className={`text-xs leading-relaxed ${className}`}>{codeStr}</code>
                      </pre>
                    </div>
                  );
                }
                return <code className="bg-bg border border-border px-1.5 py-0.5 rounded text-xs text-accent/80" {...props}>{children}</code>;
              },
              p: ({ children }) => <p className="text-text-2 mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="text-text-2 pl-4 mb-2 space-y-1 list-disc">{children}</ul>,
              ol: ({ children }) => <ol className="text-text-2 pl-4 mb-2 space-y-1 list-decimal">{children}</ol>,
              li: ({ children }) => <li className="text-text-2 text-sm">{children}</li>,
              h1: ({ children }) => <h1 className="text-text-1 text-lg font-semibold mb-2 mt-3">{children}</h1>,
              h2: ({ children }) => <h2 className="text-text-1 text-base font-semibold mb-2 mt-3">{children}</h2>,
              h3: ({ children }) => <h3 className="text-text-1 text-sm font-semibold mb-1 mt-2">{children}</h3>,
              strong: ({ children }) => <strong className="text-text-1 font-medium">{children}</strong>,
              a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">{children}</a>,
              blockquote: ({ children }) => <blockquote className="border-l-2 border-accent/30 pl-3 my-2 text-text-3 italic">{children}</blockquote>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
        {/* Actions */}
        <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => handleCopy(message.content)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-3 hover:text-text-2 hover:bg-card transition-colors">
            {copied ? <Check size={10} /> : <Copy size={10} />} Копировать
          </button>
          <button onClick={() => speak(message.content)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-text-3 hover:text-text-2 hover:bg-card transition-colors">
            <Volume2 size={10} /> Озвучить
          </button>
        </div>
      </div>
    </div>
  );
}
