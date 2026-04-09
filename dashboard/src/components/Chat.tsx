import { useState, useRef, useEffect } from 'react';
import { Send, Square, Mic, MicOff } from 'lucide-react';
import { sendMessage, type Message, getSelectedModel, MODELS } from '../lib/ai';
import { createRecognition, isSpeechSupported, speak, stopSpeaking } from '../lib/voice';
import { MessageBubble } from './MessageBubble';
import { VoiceWave } from './VoiceWave';
import { Tooltip } from './Tooltip';

interface ChatProps {
  messages: Message[];
  onMessagesChange: (msgs: Message[]) => void;
  showGuide: boolean;
  autoSpeak: boolean;
}

export function Chat({ messages, onMessagesChange, showGuide, autoSpeak }: ChatProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const currentModel = MODELS.find(m => m.id === getSelectedModel());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;

    const userMsg: Message = { role: 'user', content: msg };
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

      // Auto-speak response
      if (autoSpeak && assistantMsg.content) {
        setSpeaking(true);
        await speak(assistantMsg.content);
        setSpeaking(false);
      }
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

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    if (!isSpeechSupported()) return;
    stopSpeaking();

    const recognition = createRecognition(
      (text) => {
        setListening(false);
        handleSend(text);
      },
      () => setListening(false),
    );

    if (recognition) {
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    stopSpeaking();
    setSpeaking(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              {/* Eclipse orb */}
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-full border border-accent/10 animate-pulse" />
                <div className="absolute inset-3 rounded-full border border-accent/15" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-accent/30 animate-pulse shadow-[0_0_20px_rgba(107,163,255,0.2)]" />
                </div>
              </div>
              <div>
                <p className="text-text-1 text-sm font-medium">Eclipse Sentinel</p>
                <p className="text-text-3 text-xs mt-1">{currentModel?.name || 'AI'} · OpenRouter</p>
              </div>
              {showGuide && (
                <div className="bg-accent/5 border border-accent/10 rounded-xl px-4 py-3 max-w-sm mx-auto">
                  <p className="text-accent/60 text-[11px] leading-relaxed">
                    💡 Введите текст или нажмите 🎤 для голосового ввода. AI ответит в режиме стриминга и озвучит ответ.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {/* Voice wave indicator */}
        {(listening || speaking) && (
          <div className="flex justify-center py-2">
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-card border border-border">
              <VoiceWave active={true} mode={listening ? 'listening' : 'speaking'} />
              <span className="text-xs text-text-3">
                {listening ? 'Слушаю...' : 'Озвучиваю...'}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 sm:p-4">
        <div className="flex gap-2">
          {/* Voice button */}
          <Tooltip text="Голосовой ввод — нажмите и говорите" show={showGuide}>
            <button onClick={toggleVoice}
              className={`w-11 h-11 flex items-center justify-center rounded-xl border shrink-0 transition-all ${
                listening
                  ? 'bg-accent/15 border-accent/30 text-accent animate-pulse'
                  : 'bg-card border-border text-text-3 hover:text-accent hover:border-accent/20'
              }`}>
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </Tooltip>

          {/* Text input */}
          <input type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Спроси что-нибудь..."
            disabled={streaming || listening}
            className="chat-input flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-1 placeholder:text-text-3 disabled:opacity-50 transition-all" />

          {/* Send/Stop */}
          {streaming ? (
            <button onClick={handleStop}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors shrink-0">
              <Square size={16} />
            </button>
          ) : (
            <button onClick={() => handleSend()} disabled={!input.trim()}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors disabled:opacity-30 shrink-0">
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
