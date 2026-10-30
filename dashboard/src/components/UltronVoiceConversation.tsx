import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Globe2, Mic, Radio, RotateCcw, ShieldCheck, Square, Volume2, X } from 'lucide-react';
import type { Message } from '../lib/ai';
import { sendVoiceMessage } from '../lib/voiceModel';
import {
  ensureVoiceModel,
  cancelVoiceModel,
  subscribeModelPreparation,
  type ModelPreparationStage,
  getLiveStatusLocal,
  cancelListenOnceLocal,
  isLiveSTTSupported,
  isLocalSTTSupported,
  isTTSSupported,
  listenOnceLocal,
  pauseLiveLocal,
  resumeLiveLocal,
  speak,
  startLiveLocal,
  stopLiveLocal,
  stopSpeaking,
  subscribeLiveVoice,
  subscribeLiveVoiceControl,
  subscribeSpeechStatus,
  type SpeechStatus,
  type LiveVoiceStateName,
} from '../lib/voice';
import { type ContactTurn, ULTRON_PRESENCE_COPY, type UltronPresenceState } from '../lib/ultronPresence';
import {
  cancelVoiceAction,
  detectVoiceAction,
  executeVoiceAction,
  previewVoiceAction,
  type VoiceActionPreview,
  type VoiceActionReceipt,
} from '../lib/voiceActions';
import { UltronAvatar } from './UltronAvatar';
import { latestVoiceExchange } from '../lib/voiceTurn';

const VOICE_SYSTEM_PROMPT = [
  'Ты Альтрон, локальный голосовой ассистент Eclipse Forge.',
  'Начинай сразу с прямого ответа. Отвечай по-русски естественно и кратко: одно или два коротких предложения.',
  'Говори живо, без канцелярита, повторов вопроса и вводных фраз.',
  'Не используй Markdown без прямой просьбы пользователя.',
  'Не утверждай, что выполнил действие, если нет проверяемого receipt.',
].join(' ');

interface UltronVoiceConversationProps {
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  externalTurn?: ContactTurn | null;
  onExternalTurnApplied: () => void;
  presence: UltronPresenceState;
  onPresenceChange: (state: UltronPresenceState) => void;
  motionEnabled: boolean;
}

export function UltronVoiceConversation({
  messages,
  onMessagesChange,
  externalTurn,
  onExternalTurnApplied,
  presence,
  onPresenceChange,
  motionEnabled,
}: UltronVoiceConversationProps) {
  const [capturing, setCapturing] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>('idle');
  useEffect(() => subscribeSpeechStatus(setSpeechStatus), []);
  useEffect(() => {
    if (speaking && speechStatus === 'preparing') onPresenceChange('thinking');
    if (speaking && speechStatus === 'playing') onPresenceChange('speaking');
  }, [speaking, speechStatus, onPresenceChange]);
  const [liveState, setLiveState] = useState<LiveVoiceStateName>('idle');
  const [liveDetail, setLiveDetail] = useState('');
  const [error, setErrorState] = useState('');
  const [checkingModel, setCheckingModel] = useState(false);
  const [cancellingModel, setCancellingModel] = useState(false);
  const [modelStage, setModelStage] = useState<ModelPreparationStage>('idle');
  const cancellingModelRef = useRef(false);
  const modelCancelRef = useRef<Promise<boolean> | null>(null);
  const checkingModelRef = useRef(false);
  const modelProgressIdRef = useRef(0);
  const activeModelProgressIdRef = useRef(0);
  const [modelWaitSeconds, setModelWaitSeconds] = useState(0);
  useEffect(() => {
    if (!checkingModel) return;
    const started = Date.now();
    let timer: number;
    const tick = () => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setModelWaitSeconds(seconds);
      if (seconds < 240) timer = window.setTimeout(tick, 1000);
    };
    timer = window.setTimeout(tick, 1000);
    return () => window.clearTimeout(timer);
  }, [checkingModel]);
  const [modelReady, setModelReady] = useState(false);
  const errorRef = useRef('');
  const mountedRef = useRef(true);
  const modelCheckRef = useRef<Promise<boolean> | null>(null);
  const modelCheckEpochRef = useRef(0);
  const liveControlEpochRef = useRef(0);
  const setError = useCallback((message: string) => {
    errorRef.current = message;
    setErrorState(message);
  }, []);
  const [pendingAction, setPendingAction] = useState<VoiceActionPreview | null>(null);
  const [actionReceipt, setActionReceipt] = useState<VoiceActionReceipt | null>(null);
  const [actionExecuting, setActionExecuting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const turnSequenceRef = useRef(0);
  const appliedTurnRef = useRef<number | null>(null);
  const liveRequestedRef = useRef(false);
  const busyRef = useRef(false);
  const messagesRef = useRef(messages);
  const pendingActionRef = useRef<VoiceActionPreview | null>(null);
  const actionPreviewRef = useRef<HTMLElement | null>(null);
  const respondRef = useRef<(text: string) => Promise<void>>(async () => {});
  const localVoiceAvailable = isLocalSTTSupported();
  const liveVoiceAvailable = isLiveSTTSupported();
  const ttsAvailable = isTTSSupported();
  const presenceCopy = ULTRON_PRESENCE_COPY[presence];
  const busy = capturing || streaming || speaking || actionExecuting;
  const liveActive = liveState === 'starting' || liveState === 'listening' || liveState === 'paused' || liveState === 'stopping';

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  useEffect(() => {
    if (!pendingAction) return;
    const frameId = window.requestAnimationFrame(() => {
      actionPreviewRef.current?.scrollIntoView({
        behavior: motionEnabled ? 'smooth' : 'auto',
        block: 'center',
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [motionEnabled, pendingAction]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  const { question: lastQuestion, answer: lastAnswer } = useMemo(() => latestVoiceExchange(messages), [messages]);

  const prepareModel = useCallback((): Promise<boolean> => {
    if (cancellingModelRef.current) return Promise.resolve(false);
    if (modelCheckRef.current) return modelCheckRef.current;
    const epoch = modelCheckEpochRef.current;
    setModelWaitSeconds(0);
    setCheckingModel(true);
    checkingModelRef.current = true;
    activeModelProgressIdRef.current = 0;
    setModelStage('probe');
    setModelReady(false);
    const check = ensureVoiceModel().then((result) => {
      if (!mountedRef.current || epoch !== modelCheckEpochRef.current) return false;
      setModelReady(result.ok);
      if (!result.ok && result.error.code !== 'VOICE_MODEL_CANCELLED') {
        setError(result.error.message);
        onPresenceChange('error');
      } else {
        if (!liveRequestedRef.current && !busyRef.current) onPresenceChange('idle');
      }
      return result.ok;
    }).finally(() => {
      if (modelCheckRef.current === check) modelCheckRef.current = null;
      if (mountedRef.current && epoch === modelCheckEpochRef.current) {
        checkingModelRef.current = false;
        setCheckingModel(false);
      }
    });
    modelCheckRef.current = check;
    return check;
  }, [onPresenceChange, setError]);

  useEffect(() => subscribeModelPreparation(progress => {
    if (!checkingModelRef.current || cancellingModelRef.current) return;
    if (progress.id < modelProgressIdRef.current
      || (!activeModelProgressIdRef.current && progress.id <= modelProgressIdRef.current)) return;
    activeModelProgressIdRef.current = progress.id;
    modelProgressIdRef.current = progress.id;
    // Events describe progress only. Readiness comes from the matching IPC promise.
    if (progress.stage === 'probe' || progress.stage === 'preload' || progress.stage === 'warmup') {
      setModelStage(progress.stage);
    }
  }), []);

  const cancelModelPreparation = useCallback((): Promise<boolean> => {
    if (modelCancelRef.current) return modelCancelRef.current;
    modelCheckEpochRef.current += 1;
    cancellingModelRef.current = true;
    checkingModelRef.current = true;
    setCancellingModel(true);
    setCheckingModel(true);
    setModelReady(false);
    setModelStage('cancelling');
    onPresenceChange('thinking');
    const pending = (async () => {
      const acknowledged = await cancelVoiceModel();
      if (!mountedRef.current) return acknowledged;
      if (acknowledged) {
        modelCheckRef.current = null;
        cancellingModelRef.current = false;
        checkingModelRef.current = false;
        setCancellingModel(false);
        setCheckingModel(false);
        setModelStage('idle');
        onPresenceChange(errorRef.current ? 'error' : 'idle');
      } else {
        setError('Остановка подготовки не подтверждена. Повторите остановку.');
        onPresenceChange('error');
      }
      return acknowledged;
    })().finally(() => { modelCancelRef.current = null; });
    modelCancelRef.current = pending;
    return pending;
  }, [onPresenceChange, setError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const resumeLiveAfterTurn = useCallback(async () => {
    if (!liveRequestedRef.current) return;
    if (errorRef.current) {
      liveRequestedRef.current = false;
      await stopLiveLocal();
      return;
    }
    const result = await resumeLiveLocal();
    if (!result.ok) {
      liveRequestedRef.current = false;
      setLiveState('error');
      setError(result.error?.message || 'Не удалось вернуть живой микрофон в режим прослушивания.');
      onPresenceChange('error');
    }
  }, [onPresenceChange, setError]);

  const stopTurn = useCallback(() => {
    void cancelModelPreparation();
    turnSequenceRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    void cancelListenOnceLocal();
    stopSpeaking();
    busyRef.current = false;
    setCapturing(false);
    setStreaming(false);
    setSpeaking(false);
    setActionExecuting(false);
    if (liveRequestedRef.current) void resumeLiveAfterTurn();
    // Preparation cancellation owns presence until its acknowledgement.
  }, [cancelModelPreparation, resumeLiveAfterTurn]);

  const respondTo = useCallback(async (transcript: string) => {
    const text = transcript.trim();
    if (!text || busyRef.current || cancellingModelRef.current) return;

    busyRef.current = true;
    const turnId = ++turnSequenceRef.current;
    setStreaming(true);
    if (liveRequestedRef.current) await pauseLiveLocal();
    if (turnSequenceRef.current !== turnId) return;
    stopSpeaking();

    const previousPreview = pendingActionRef.current;
    if (previousPreview) await cancelVoiceAction(previousPreview);
    if (turnSequenceRef.current !== turnId) return;
    pendingActionRef.current = null;
    setPendingAction(null);
    setActionReceipt(null);

    const actionId = detectVoiceAction(text);
    if (actionId) {
      const userMessage: Message = { role: 'user', content: text };
      const actionMessages = [...messagesRef.current.slice(-8), userMessage];
      onMessagesChange(actionMessages);
      setError('');
      onPresenceChange('thinking');
      try {
        const result = await previewVoiceAction(actionId);
        if (turnSequenceRef.current !== turnId) {
          if (result.ok) await cancelVoiceAction(result.preview);
          return;
        }
        if (!result.ok) throw new Error(result.error.message);
        const preview = result.preview;
        pendingActionRef.current = preview;
        setPendingAction(preview);
        const assistantMessage: Message = {
          role: 'assistant',
          content: `Готов открыть YouTube. Проверьте адрес и подтвердите действие на экране.`,
        };
        onMessagesChange([...actionMessages, assistantMessage]);
        setSpeaking(true);
        onPresenceChange('speaking');
        await speak('Готов открыть YouTube. Проверьте адрес и подтвердите действие на экране.');
        if (turnSequenceRef.current === turnId) onPresenceChange('success');
      } catch (actionError: unknown) {
        if (turnSequenceRef.current !== turnId) return;
        setError(actionError instanceof Error ? actionError.message : 'Не удалось подготовить действие.');
        onPresenceChange('error');
      } finally {
        if (turnSequenceRef.current === turnId) {
          setStreaming(false);
          setSpeaking(false);
          busyRef.current = false;
          await resumeLiveAfterTurn();
        }
      }
      return;
    }

    const userMessage: Message = { role: 'user', content: text };
    const modelMessages = [...messagesRef.current.slice(-8), userMessage];
    const assistantMessage: Message = { role: 'assistant', content: '' };
    onMessagesChange([...modelMessages, assistantMessage]);
    setError('');
    setStreaming(true);
    onPresenceChange('thinking');

    const controller = new AbortController();
    abortRef.current = controller;
    let spokenThrough = 0;
    let queuedSpeech = false;
    let speechQueue = Promise.resolve();

    const queueSpeech = (sentence: string) => {
      const clean = sentence.trim();
      if (!clean || turnSequenceRef.current !== turnId) return;
      queuedSpeech = true;
      setSpeaking(true);
      onPresenceChange('speaking');
      speechQueue = speechQueue.then(async () => {
        if (turnSequenceRef.current === turnId && !controller.signal.aborted) await speak(clean);
      });
      // Attach a rejection handler immediately while the model is still streaming.
      // The original promise is awaited below and still reports the error in the UI.
      void speechQueue.catch(() => {});
    };

    const queueCompletedSentences = () => {
      let remainder = assistantMessage.content.slice(spokenThrough);
      let boundary = /[.!?]+(?:\s|$)/.exec(remainder);
      while (boundary) {
        const length = boundary.index + boundary[0].length;
        queueSpeech(remainder.slice(0, length));
        spokenThrough += length;
        remainder = assistantMessage.content.slice(spokenThrough);
        boundary = /[.!?]+(?:\s|$)/.exec(remainder);
      }
    };

    try {
      const prepared = await prepareModel();
      if (turnSequenceRef.current !== turnId || controller.signal.aborted) return;
      if (!prepared) throw new Error(errorRef.current || 'Подготовка модели остановлена. Повторите запрос.');
      await sendVoiceMessage(
        modelMessages,
        VOICE_SYSTEM_PROMPT,
        (chunk) => {
          if (turnSequenceRef.current !== turnId || controller.signal.aborted) return;
          assistantMessage.content += chunk;
          onMessagesChange([...modelMessages, { ...assistantMessage }]);
          queueCompletedSentences();
        },
        controller.signal,
      );

      if (!assistantMessage.content.trim()) throw new Error('Локальная модель не вернула ответ.');
      if (turnSequenceRef.current !== turnId) return;

      setStreaming(false);
      const tail = assistantMessage.content.slice(spokenThrough).trim();
      if (tail) queueSpeech(tail);
      if (queuedSpeech) await speechQueue;
      if (turnSequenceRef.current === turnId) onPresenceChange('success');
    } catch (turnError: unknown) {
      if (turnSequenceRef.current !== turnId) return;
      // Do not finish reading queued sentences after a failed generation.
      controller.abort();
      void cancelModelPreparation();
      stopSpeaking();
      const errorName = turnError instanceof Error ? turnError.name : '';
      if (errorName !== 'AbortError') {
        const message = turnError instanceof Error ? turnError.message : 'Не удалось получить ответ.';
        setError(message.includes('fetch') || message.includes('Ollama')
          ? 'Qwen 3 8B не ответила. Проверьте локальную модель и повторите запрос.'
          : message);
        onPresenceChange('error');
      }
    } finally {
      if (turnSequenceRef.current === turnId) {
        setStreaming(false);
        setSpeaking(false);
        abortRef.current = null;
        busyRef.current = false;
        await resumeLiveAfterTurn();
      }
    }
  }, [cancelModelPreparation, onMessagesChange, onPresenceChange, prepareModel, resumeLiveAfterTurn, setError]);

  useEffect(() => {
    respondRef.current = respondTo;
  }, [respondTo]);

  useEffect(() => subscribeLiveVoice(
    ({ state, detail }) => {
      setLiveState(state);
      setLiveDetail(detail);
      if (state === 'listening' && !busyRef.current && !errorRef.current && !cancellingModelRef.current) onPresenceChange('listening');
      if (state === 'idle') {
        liveRequestedRef.current = false;
        if (!busyRef.current && !errorRef.current && !cancellingModelRef.current) onPresenceChange('idle');
      }
      if (state === 'error') {
        liveRequestedRef.current = false;
        setError(detail || 'Живой микрофон остановлен из-за ошибки.');
        onPresenceChange('error');
      }
      if (state === 'stopping') liveRequestedRef.current = false;
    },
    ({ text }) => {
      if (liveRequestedRef.current && !busyRef.current) void respondRef.current(text);
    },
  ), [onPresenceChange, setError]);

  useEffect(() => {
    let disposed = false;
    const statusEpoch = liveControlEpochRef.current;
    const synchronize = (active: boolean, state: LiveVoiceStateName = 'listening') => {
      liveControlEpochRef.current += 1;
      liveRequestedRef.current = active;
      setLiveState(active ? state : 'idle');
      if (active && state !== 'stopping') {
        setError('');
        onPresenceChange('listening');
        void prepareModel();
      } else {
        stopTurn();
      }
    };

    const unsubscribe = subscribeLiveVoiceControl(({ action }) => {
      synchronize(action === 'start', action === 'start' ? 'starting' : 'idle');
    });

    void getLiveStatusLocal().then((result) => {
      if (disposed || statusEpoch !== liveControlEpochRef.current || !mountedRef.current || !result.ok || !result.active) return;
      synchronize(true, result.state || 'starting');
    });

    return () => { disposed = true; unsubscribe(); };
  }, [onPresenceChange, prepareModel, setError, stopTurn]);

  const startLiveConversation = async () => {
    if (!liveVoiceAvailable || busyRef.current || cancellingModelRef.current) return;
    liveControlEpochRef.current += 1;
    busyRef.current = true;
    setError('');
    liveRequestedRef.current = true;
    setLiveState('starting');
    onPresenceChange('listening');
    const result = await startLiveLocal();
    if (!mountedRef.current || !liveRequestedRef.current) { await stopLiveLocal(); return; }
    busyRef.current = false;
    if (!result.ok) {
      liveRequestedRef.current = false;
      setLiveState('error');
      setError(result.error?.message || 'Не удалось включить живой разговор.');
      onPresenceChange('error');
      return;
    }
    void prepareModel();
  };

  const stopLiveConversation = async () => {
    liveControlEpochRef.current += 1;
    liveRequestedRef.current = false;
    stopTurn();
    const result = await stopLiveLocal();
    if (!result.ok) {
      setLiveState(result.state || 'stopping');
      setLiveDetail(result.error?.message || 'Остановка микрофона ещё не подтверждена.');
      setError(result.error?.message || 'Микрофон ещё останавливается. Повторите остановку.');
      onPresenceChange('error');
      return;
    }
    setLiveState('idle');
    if (!cancellingModelRef.current) onPresenceChange(errorRef.current ? 'error' : 'idle');
  };

  const startVoiceTurn = async () => {
    if (!localVoiceAvailable || liveActive || busyRef.current || cancellingModelRef.current) return;
    busyRef.current = true;
    const captureId = ++turnSequenceRef.current;
    stopSpeaking();
    setError('');
    setCapturing(true);
    onPresenceChange('listening');
    void prepareModel();

    try {
      const result = await listenOnceLocal();
      if (turnSequenceRef.current !== captureId || !mountedRef.current) return;
      if (!result.ok) {
        setError(result.error.message);
        onPresenceChange('error');
        return;
      }
      setCapturing(false);
      busyRef.current = false;
      await respondTo(result.text);
    } catch {
      if (turnSequenceRef.current !== captureId || !mountedRef.current) return;
      setError('Не удалось запустить локальное распознавание речи.');
      onPresenceChange('error');
    } finally {
      if (turnSequenceRef.current === captureId) {
        setCapturing(false);
        busyRef.current = false;
      }
    }
  };

  const repeatAnswer = async () => {
    if (!lastAnswer || busyRef.current || !ttsAvailable) return;
    const turnId = ++turnSequenceRef.current;
    busyRef.current = true;
    setError('');
    if (liveRequestedRef.current) await pauseLiveLocal();
    if (turnSequenceRef.current !== turnId) return;
    setSpeaking(true);
    onPresenceChange('speaking');
    try {
      await speak(lastAnswer);
      if (turnSequenceRef.current === turnId) onPresenceChange('success');
    } catch (speechError: unknown) {
      if (turnSequenceRef.current === turnId) {
        setError(speechError instanceof Error ? speechError.message : 'Не удалось озвучить ответ.');
        onPresenceChange('error');
      }
    } finally {
      if (turnSequenceRef.current === turnId) {
        busyRef.current = false;
        setSpeaking(false);
        await resumeLiveAfterTurn();
      }
    }
  };

  const approvePendingAction = async () => {
    const preview = pendingActionRef.current;
    if (!preview || busyRef.current) return;
    busyRef.current = true;
    const turnId = ++turnSequenceRef.current;
    if (liveRequestedRef.current) await pauseLiveLocal();
    if (turnSequenceRef.current !== turnId) return;
    stopSpeaking();
    setActionExecuting(true);
    setError('');
    onPresenceChange('thinking');
    try {
      const result = await executeVoiceAction(preview);
      if (turnSequenceRef.current !== turnId) return;
      pendingActionRef.current = null;
      setPendingAction(null);
      if (!result.ok) throw new Error(result.error.message);
      setActionReceipt(result.receipt);
      const assistantMessage: Message = {
        role: 'assistant',
        content: 'Команда передана браузеру. YouTube должен открыться в новой вкладке.',
      };
      onMessagesChange([...messagesRef.current.slice(-9), assistantMessage]);
      setSpeaking(true);
      onPresenceChange('speaking');
      await speak('Команда передана браузеру.');
      if (turnSequenceRef.current === turnId) onPresenceChange('success');
    } catch (actionError: unknown) {
      if (turnSequenceRef.current !== turnId) return;
      pendingActionRef.current = null;
      setPendingAction(null);
      setError(actionError instanceof Error ? actionError.message : 'Не удалось открыть YouTube.');
      onPresenceChange('error');
    } finally {
      if (turnSequenceRef.current === turnId) {
        setActionExecuting(false);
        setSpeaking(false);
        busyRef.current = false;
        await resumeLiveAfterTurn();
      }
    }
  };

  const cancelPendingAction = async () => {
    const preview = pendingActionRef.current;
    if (!preview || actionExecuting) return;
    await cancelVoiceAction(preview);
    pendingActionRef.current = null;
    setPendingAction(null);
    setActionReceipt(null);
    const assistantMessage: Message = { role: 'assistant', content: 'Действие отменено. Ничего не открыто.' };
    onMessagesChange([...messagesRef.current.slice(-9), assistantMessage]);
    onPresenceChange(liveRequestedRef.current ? 'listening' : 'idle');
  };

  useEffect(() => {
    if (!externalTurn || externalTurn.mode !== 'voice' || appliedTurnRef.current === externalTurn.id) return;
    if (busy || busyRef.current) return;
    appliedTurnRef.current = externalTurn.id;
    onExternalTurnApplied();
    void respondTo(externalTurn.text);
  }, [busy, externalTurn, onExternalTurnApplied, respondTo]);

  useEffect(() => () => {
    modelCheckEpochRef.current += 1;
    void cancelVoiceModel();
    turnSequenceRef.current += 1;
    liveRequestedRef.current = false;
    abortRef.current?.abort();
    void stopLiveLocal();
    if (pendingActionRef.current) void cancelVoiceAction(pendingActionRef.current);
    stopSpeaking();
    busyRef.current = false;
    onPresenceChange('idle');
  }, [onPresenceChange]);

  const primaryAction = cancellingModel && !liveActive
    ? cancelModelPreparation
    : liveActive
    ? stopLiveConversation
    : busy || checkingModel
      ? () => Promise.resolve(stopTurn())
      : startLiveConversation;

  return (
    <section className="ultron-voice" data-motion={motionEnabled ? 'on' : 'off'} data-state={presence} data-live={liveActive ? 'on' : 'off'} aria-labelledby="ultron-voice-title">
      <div className="ultron-voice__ambient" aria-hidden="true" />
      <header className="ultron-voice__header">
        <p>Eclipse Forge · local voice</p>
        <h1 id="ultron-voice-title">{liveState === 'stopping' ? 'Завершаем разговор' : error ? 'Проверим подключение' : 'Поговорите с Альтроном'}</h1>
        <span>
          <ShieldCheck size={13} aria-hidden="true" />
          {liveState === 'stopping' ? 'Проверяем остановку микрофона' : liveActive ? 'Живой микрофон включён · аудио не сохраняется' : 'Микрофон включается только по вашей команде'}
        </span>
      </header>

      <div className="ultron-voice__stage" role="status" aria-live="polite" aria-atomic="true">
        <UltronAvatar presence={presence} size="stage" motionEnabled={motionEnabled} />
        <div className="ultron-voice__presence">
          <strong>{cancellingModel ? 'Останавливаю подготовку' : liveState === 'stopping' ? 'Останавливаю микрофон' : checkingModel ? ({ probe: 'Проверяю локальный сервис', preload: 'Подготавливаю модель', warmup: 'Проверяю генерацию' } as Partial<Record<ModelPreparationStage, string>>)[modelStage] || 'Подготавливаю ответ' : liveState === 'starting' ? 'Запускаю микрофон' : speechStatus === 'preparing' ? 'Готовлю голос Альтрона' : presenceCopy.label}</strong>
          <span>{cancellingModel ? 'Жду подтверждения от локального сервиса. Новый запрос пока заблокирован.' : liveState === 'stopping' ? liveDetail : checkingModel ? `Подготовка: ${modelWaitSeconds} с. Общий предел 4 минуты. Можно остановить в любой момент.` : liveState === 'listening' && !busy ? (liveDetail || 'Говорите, Альтрон ответит сам') : speechStatus === 'preparing' ? 'Текст уже готов. Готовлю локальную озвучку.' : presenceCopy.detail}</span>
        </div>

        <button
          type="button"
          className={`ultron-voice__primary ${busy || liveActive || checkingModel ? 'is-active' : ''}`}
          disabled={!liveVoiceAvailable && !busy && !checkingModel}
          onClick={() => void primaryAction()}
          aria-pressed={liveActive}
        >
          {liveActive || busy || checkingModel ? <Square size={20} aria-hidden="true" /> : <Radio size={22} aria-hidden="true" />}
          <span>
            <strong>{liveActive ? 'Остановить живой режим' : cancellingModel ? 'Повторить остановку подготовки' : checkingModel ? 'Остановить подготовку' : busy ? 'Остановить ответ' : 'Включить живой разговор'}</strong>
            <small>{liveActive ? 'Нажмите, чтобы выключить микрофон' : busy || checkingModel ? 'Текущий запрос можно прервать' : 'Дождитесь готовности микрофона, затем говорите'}</small>
          </span>
        </button>
        <button type="button" className="ultron-voice__single"
          disabled={!localVoiceAvailable || liveActive || busy || checkingModel}
          onClick={() => void respondTo('Проверка связи без микрофона. Сколько будет два плюс два?')}>
          <Volume2 size={15} aria-hidden="true" /> Проверить ответ
        </button>

        <button
          type="button"
          className="ultron-voice__single"
          disabled={!localVoiceAvailable || liveActive || busy || checkingModel}
          onClick={() => void startVoiceTurn()}
        >
          <Mic size={15} aria-hidden="true" />
          {capturing ? 'Слушаю одну фразу…' : 'Сказать одну фразу'}
        </button>
      </div>

      <div className="ultron-voice__dialog" aria-label="Последний голосовой обмен">
        <section data-speaker="user">
          <span>Вы сказали</span>
          <p>{lastQuestion || 'Здесь появится распознанная фраза.'}</p>
        </section>
        <section data-speaker="ultron" aria-busy={streaming}>
          <span>Альтрон</span>
          {streaming && !lastAnswer ? checkingModel ? <p>Фраза получена. Готовлю локальную модель…</p> : <div className="ultron-voice__thinking" aria-label="Альтрон формирует ответ"><i /><i /><i /></div> : <p>{lastAnswer || (error && lastQuestion ? 'Ответ на эту фразу не получен.' : 'Ответ появится здесь и прозвучит вслух.')}</p>}
          {lastAnswer && !busy && (
            <button type="button" disabled={!ttsAvailable} onClick={() => void repeatAnswer()}>
              <RotateCcw size={13} aria-hidden="true" /> {error ? 'Повторить озвучку' : 'Повторить ответ'}
            </button>
          )}
        </section>
      </div>

      {pendingAction && (
        <section ref={actionPreviewRef} className="ultron-voice__action-preview" aria-labelledby="voice-action-title" aria-live="polite">
          <header>
            <Globe2 size={18} aria-hidden="true" />
            <div><span>Нужно подтверждение</span><h2 id="voice-action-title">{pendingAction.label}</h2></div>
            <code>preview</code>
          </header>
          <p className="ultron-voice__action-target">{pendingAction.target}</p>
          <dl>
            <div><dt>Данные</dt><dd>{pendingAction.dataDisclosure}</dd></div>
            <div><dt>Результат</dt><dd>{pendingAction.expectedResult}</dd></div>
            <div><dt>Откат</dt><dd>{pendingAction.rollback}</dd></div>
          </dl>
          <div className="ultron-voice__action-controls">
            <button type="button" className="is-primary" disabled={busy} onClick={() => void approvePendingAction()}>
              <ExternalLink size={14} aria-hidden="true" />
              {actionExecuting ? 'Открываю…' : 'Открыть YouTube'}
            </button>
            <button type="button" disabled={actionExecuting} onClick={() => void cancelPendingAction()}>
              <X size={14} aria-hidden="true" /> Отменить
            </button>
          </div>
        </section>
      )}

      {actionReceipt && !pendingAction && (
        <section className="ultron-voice__action-receipt" aria-live="polite">
          <ShieldCheck size={16} aria-hidden="true" />
          <div><span>Receipt · команда передана браузеру</span><strong>{actionReceipt.target}</strong></div>
          <code>{actionReceipt.requestId.slice(0, 8)}</code>
        </section>
      )}

      {error && (
        <div className="ultron-voice__error" role="alert">
          <p>{error}</p>
          {lastQuestion && !lastAnswer && liveState !== 'stopping' && <button type="button" disabled={checkingModel || busy || liveActive || !localVoiceAvailable} onClick={() => void respondTo(lastQuestion)}>
            <RotateCcw size={15} aria-hidden="true" />Повторить запрос
          </button>}
        </div>
      )}

      <footer className="ultron-voice__footer">
        <span><Volume2 size={13} aria-hidden="true" /> Qwen 3 8B · {modelReady ? 'подготовка завершена' : 'локальный голосовой профиль'}</span>
        <span>Whisper offline · локально · без сохранения аудио и фоновых автозапусков</span>
      </footer>
    </section>
  );
}
