import { useState, useRef, useEffect, useCallback } from 'react';
import { Code2, FolderSearch, Send, ShieldCheck, Square, Mic, MicOff } from 'lucide-react';
import { sendMessage, type Message, getModelDefinition } from '../lib/ai';
import { isLocalSTTSupported, listenOnceLocal, speak, stopSpeaking } from '../lib/voice';
import { MessageBubble } from './MessageBubble';
import { VoiceWave } from './VoiceWave';
import { Tooltip } from './Tooltip';
import { UltronAvatar } from './UltronAvatar';
import { type ContactTurn, type UltronPresenceState } from '../lib/ultronPresence';

const QUICK_PROMPTS = [
  { icon: Code2, label: 'Помоги разобраться с кодом', prompt: 'Проанализируй текущую задачу по коду и предложи безопасный план.' },
  { icon: FolderSearch, label: 'Проверь состояние проекта', prompt: 'Проверь состояние проекта и перечисли ближайшие приоритеты.' },
  { icon: ShieldCheck, label: 'Проведи безопасный аудит', prompt: 'Проведи безопасный read-only аудит текущих изменений.' },
];

interface ChatProps {
  messages: Message[];
  onMessagesChange: (msgs: Message[]) => void;
  showGuide: boolean;
  autoSpeak: boolean;
  externalTurn?: ContactTurn | null;
  onExternalTurnApplied?: () => void;
  onPresenceChange?: (state: UltronPresenceState) => void;
  motionEnabled: boolean;
  model?: string;
  labMode?: boolean;
}

export function Chat({
  messages,
  onMessagesChange,
  showGuide,
  autoSpeak,
  externalTurn,
  onExternalTurnApplied,
  onPresenceChange,
  motionEnabled,
  model,
  labMode = false,
}: ChatProps) {
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appliedTurnRef = useRef<number | null>(null);
  const turnSequenceRef = useRef(0);

  const currentModel = getModelDefinition(model);
  const localVoiceAvailable = isLocalSTTSupported();

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion || !motionEnabled ? 'auto' : 'smooth' });
  }, [messages, motionEnabled]);

  const handleSend = useCallback(async (text?: string, options: { forceSpeak?: boolean } = {}) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;
    const turnId = ++turnSequenceRef.current;

    const userMsg: Message = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    onMessagesChange(newMessages);
    setInput('');
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    onMessagesChange([...newMessages, assistantMsg]);
    onPresenceChange?.('thinking');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendMessage(newMessages, (chunk) => {
        assistantMsg.content += chunk;
        onMessagesChange([...newMessages, { ...assistantMsg }]);
      }, controller.signal, model);

      if ((autoSpeak || options.forceSpeak) && assistantMsg.content) {
        setSpeaking(true);
        onPresenceChange?.('speaking');
        await speak(assistantMsg.content);
        setSpeaking(false);
      }
      if (turnSequenceRef.current === turnId) onPresenceChange?.('success');
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : '';
      if (errorName !== 'AbortError') {
        const message = error instanceof Error ? error.message : 'Не удалось получить ответ.';
        assistantMsg.content += `\n\n⚠️ ${message}`;
        onMessagesChange([...newMessages, { ...assistantMsg }]);
        onPresenceChange?.('error');
      } else {
        onPresenceChange?.('idle');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [autoSpeak, input, messages, model, onMessagesChange, onPresenceChange, streaming]);

  useEffect(() => {
    if (!externalTurn || appliedTurnRef.current === externalTurn.id) return;
    appliedTurnRef.current = externalTurn.id;
    setVoiceError('');
    onExternalTurnApplied?.();

    if (externalTurn.mode === 'voice') {
      void handleSend(externalTurn.text, { forceSpeak: true });
      return;
    }

    setInput(externalTurn.text);
    inputRef.current?.focus();
    onPresenceChange?.('success');
  }, [externalTurn, handleSend, onExternalTurnApplied, onPresenceChange]);

  useEffect(() => () => {
    stopSpeaking();
    onPresenceChange?.('idle');
  }, [onPresenceChange]);

  const captureVoice = async () => {
    if (!localVoiceAvailable || listening || streaming) return;
    stopSpeaking();
    setVoiceError('');
    setListening(true);
    onPresenceChange?.('listening');
    try {
      const result = await listenOnceLocal();
      if (!result.ok) {
        setVoiceError(result.error.message);
        onPresenceChange?.('error');
        return;
      }
      setInput(result.text);
      onPresenceChange?.('success');
    } finally {
      setListening(false);
    }
  };

  const handleStop = () => {
    turnSequenceRef.current += 1;
    abortRef.current?.abort();
    stopSpeaking();
    setSpeaking(false);
    onPresenceChange?.('idle');
  };

  return (
    <div className="chat-surface flex flex-col h-full">
      {/* Messages */}
      <div className="chat-scroll flex-1 overflow-y-auto p-4">
        <div className="chat-content min-h-full space-y-3">
          {messages.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty__mark"><UltronAvatar presence="idle" size="chat" motionEnabled={motionEnabled} /></div>
              <p className="chat-empty__eyebrow">{labMode ? 'Eclipse Forge · Lab' : 'Eclipse Forge · Ultron'}</p>
              <h1>{labMode ? 'Исследовательский чат' : 'Чем займёмся?'}</h1>
              <p className="chat-empty__lead">
                {labMode
                  ? 'Изолированный локальный текстовый контур без инструментов, shell, доступа к файлам и сети. Ответы модели требуют самостоятельной проверки.'
                  : 'Локальный AI-помощник для проектов, кода и безопасных операторских задач. Выберите быстрый старт или сформулируйте свой запрос.'}
              </p>
              <div className="quick-prompts" aria-label="Быстрый старт">
                {(labMode ? [
                  { icon: Code2, label: 'Разобрать фрагмент кода', prompt: 'Разбери следующий фрагмент кода, укажи предположения и возможные ошибки: ' },
                  { icon: ShieldCheck, label: 'Проверить идею', prompt: 'Проверь эту техническую идею на противоречия и риски: ' },
                ] : QUICK_PROMPTS).map(({ icon: Icon, label, prompt }) => (
                  <button key={label} type="button" onClick={() => setInput(prompt)}>
                    <Icon size={16} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              {showGuide && !labMode && (
                <div className="mt-4 border-l-2 border-accent/40 pl-3 text-[11px] leading-relaxed text-text-3">
                  Enter отправляет сообщение. Голосовой ввод включается отдельной кнопкой и не запускается автоматически.
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}

          {/* Voice wave indicator */}
          {!labMode && (listening || speaking) && (
            <div className="flex justify-center py-2" role="status" aria-live="polite">
              <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-card border border-border">
                <VoiceWave active={true} mode={listening ? 'listening' : 'speaking'} />
                <span className="text-xs text-text-3">{listening ? 'Слушаю…' : 'Озвучиваю…'}</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="chat-composer-shell border-t border-border p-3 sm:p-4">
        <div className="chat-composer flex gap-2">
          {/* Voice button stays out of the isolated Lab surface. */}
          {!labMode && <Tooltip text={localVoiceAvailable ? 'Голос заполнит поле — проверьте текст перед отправкой' : 'Голос доступен в Eclipse Ultron Desktop'} show={showGuide}>
            <button onClick={captureVoice} type="button" aria-label={listening ? 'Идёт распознавание речи' : 'Заполнить сообщение голосом'} disabled={!localVoiceAvailable || listening || streaming}
              className={`w-11 h-11 flex items-center justify-center rounded-xl border shrink-0 transition-all ${
                listening
                  ? 'bg-accent/15 border-accent/30 text-accent animate-pulse'
                  : 'bg-card border-border text-text-3 hover:text-accent hover:border-accent/20'
              } disabled:opacity-30`}>
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </Tooltip>}

          {/* Text input */}
          <input type="text" value={input}
            ref={inputRef}
            aria-label={labMode ? 'Сообщение для исследовательского чата' : 'Сообщение для Альтрона'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`Сообщение для ${currentModel?.name || 'Альтрона'}…`}
            disabled={streaming || listening}
            className="chat-input flex-1 bg-card border border-border rounded-xl px-4 py-3 text-sm text-text-1 placeholder:text-text-3 disabled:opacity-50 transition-all" />

          {/* Send/Stop */}
          {streaming ? (
            <button onClick={handleStop} type="button" aria-label="Остановить ответ"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors shrink-0">
              <Square size={16} />
            </button>
          ) : (
            <button onClick={() => handleSend()} type="button" aria-label="Отправить сообщение" disabled={!input.trim()}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors disabled:opacity-30 shrink-0">
              <Send size={16} />
            </button>
          )}
        </div>
        {voiceError && !labMode && <p className="mt-2 text-[11px] text-red-400" role="alert">{voiceError}</p>}
      </div>
    </div>
  );
}
