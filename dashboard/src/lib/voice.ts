// Web Speech API — STT + TTS

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: { [index: number]: SpeechRecognitionResultLike };
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export type LocalSpeechResult =
  | { ok: true; text: string; confidence: number | null }
  | { ok: false; error: { code: string; message: string } };

export type LiveVoiceStateName = 'idle' | 'starting' | 'listening' | 'paused' | 'stopping' | 'error';

export interface LiveVoiceState {
  state: LiveVoiceStateName;
  detail: string;
}

export type LiveVoiceControlResult =
  | { ok: true; active: boolean; state: LiveVoiceStateName }
  | { ok: false; active?: boolean; state?: LiveVoiceStateName; error?: { code: string; message: string } };

export interface LiveVoiceTranscript {
  text: string;
  capturedAt: number;
  engine: 'whisper.cpp-live';
}

export type ModelPreparationStage = 'idle' | 'probe' | 'preload' | 'warmup' | 'ready' | 'cancelling' | 'error';
export interface ModelPreparationProgress {
  id: number;
  stage: ModelPreparationStage;
  elapsedMs: number;
}

export type LiveVoiceControlAction = 'start' | 'stop' | 'emergency-stop';

export interface LiveVoiceControlEvent {
  action: LiveVoiceControlAction;
  source: 'tray' | 'window-close' | 'emergency' | 'manual';
}

type FastSpeechResult =
  | { ok: true; audio: Uint8Array; engine: 'ultron-angry'; mimeType: 'audio/mpeg' }
  | { ok: false; error?: { code: string; message: string } };

type UltronVoiceWindow = Window & {
  ultronVoice?: {
    ensureModel(): Promise<{ ok: true; model: string } | { ok: false; error: { code: string; message: string } }>;
    cancelModel(): Promise<boolean>;
    onModelProgress?(callback: (payload: unknown) => void): number;
    listenOnce(): Promise<LocalSpeechResult>;
    cancelListen(): Promise<boolean>;
    synthesize(text: string): Promise<FastSpeechResult>;
    stopSpeech(): Promise<boolean>;
    previewSpeech(): Promise<FastSpeechResult>;
    startLive(): Promise<LiveVoiceControlResult>;
    stopLive(): Promise<LiveVoiceControlResult>;
    pauseLive(): Promise<LiveVoiceControlResult>;
    resumeLive(): Promise<LiveVoiceControlResult>;
    getLiveStatus(): Promise<LiveVoiceControlResult>;
    onLiveState(callback: (payload: unknown) => void): number;
    onLiveTranscript(callback: (payload: unknown) => void): number;
    onLiveControl(callback: (payload: unknown) => void): number;
    removeLiveListener(id: number): boolean;
  };
};

export function isLocalSTTSupported(): boolean {
  return typeof (window as UltronVoiceWindow).ultronVoice?.listenOnce === 'function';
}

export async function ensureVoiceModel() {
  const bridge = (window as UltronVoiceWindow).ultronVoice;
  if (!bridge?.ensureModel) return { ok: false as const, error: {
    code: 'VOICE_DESKTOP_REQUIRED', message: 'Проверка локальной модели доступна в обновлённом Eclipse Ultron Desktop.',
  } };
  try { return await bridge.ensureModel(); }
  catch { return { ok: false as const, error: { code: 'VOICE_MODEL_OFFLINE', message: 'Не удалось проверить Ollama. Повторите проверку модели.' } }; }
}

export async function cancelVoiceModel(): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (window as UltronVoiceWindow).ultronVoice?.cancelModel?.() || Promise.resolve(false),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 8000); }),
    ]);
  } catch { return false; }
  finally { clearTimeout(timer); }
}

export function subscribeModelPreparation(callback: (progress: ModelPreparationProgress) => void): () => void {
  const bridge = (window as UltronVoiceWindow).ultronVoice;
  if (!bridge?.onModelProgress) return () => {};
  const id = bridge.onModelProgress(payload => {
    if (!payload || typeof payload !== 'object') return;
    const value = payload as ModelPreparationProgress;
    if (!Number.isSafeInteger(value.id) || value.id < 1 || !Number.isFinite(value.elapsedMs)
      || value.elapsedMs < 0 || value.elapsedMs > 3600000
      || !['idle', 'probe', 'preload', 'warmup', 'ready', 'cancelling', 'error'].includes(value.stage)) return;
    callback({ id: value.id, stage: value.stage, elapsedMs: value.elapsedMs });
  });
  return () => { bridge.removeLiveListener(id); };
}

export async function listenOnceLocal(): Promise<LocalSpeechResult> {
  const bridge = (window as UltronVoiceWindow).ultronVoice;
  if (!bridge) {
    return {
      ok: false,
      error: { code: 'VOICE_DESKTOP_REQUIRED', message: 'Локальный микрофон доступен только в Eclipse Ultron Desktop.' },
    };
  }
  return bridge.listenOnce();
}

export async function cancelListenOnceLocal(): Promise<boolean> {
  try { return await (window as UltronVoiceWindow).ultronVoice?.cancelListen?.() || false; }
  catch { return false; }
}

export function isLiveSTTSupported(): boolean {
  return typeof (window as UltronVoiceWindow).ultronVoice?.startLive === 'function';
}

const LIVE_STATES = new Set<LiveVoiceStateName>(['idle', 'starting', 'listening', 'paused', 'stopping', 'error']);
const LIVE_CONTROL_ACTIONS = new Set<LiveVoiceControlAction>(['start', 'stop', 'emergency-stop']);
const LIVE_CONTROL_SOURCES = new Set<LiveVoiceControlEvent['source']>(['tray', 'window-close', 'emergency', 'manual']);

function normalizeLiveState(payload: unknown): LiveVoiceState | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as Partial<LiveVoiceState>;
  if (!candidate.state || !LIVE_STATES.has(candidate.state)) return null;
  return { state: candidate.state, detail: String(candidate.detail || '').slice(0, 240) };
}

function normalizeLiveTranscript(payload: unknown): LiveVoiceTranscript | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as Partial<LiveVoiceTranscript>;
  const text = typeof candidate.text === 'string' ? candidate.text.trim().slice(0, 500) : '';
  if (!text) return null;
  return {
    text,
    capturedAt: Number.isFinite(candidate.capturedAt) ? Number(candidate.capturedAt) : Date.now(),
    engine: 'whisper.cpp-live',
  };
}

function normalizeLiveControl(payload: unknown): LiveVoiceControlEvent | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as Partial<LiveVoiceControlEvent>;
  if (!candidate.action || !LIVE_CONTROL_ACTIONS.has(candidate.action)) return null;
  const source = candidate.source && LIVE_CONTROL_SOURCES.has(candidate.source) ? candidate.source : 'manual';
  return { action: candidate.action, source };
}

function liveBridge() {
  return (window as UltronVoiceWindow).ultronVoice;
}

function unavailableLiveResult(): LiveVoiceControlResult {
  return {
    ok: false,
    active: false,
    state: 'idle',
    error: { code: 'VOICE_DESKTOP_REQUIRED', message: 'Живой микрофон доступен только в Eclipse Ultron Desktop.' },
  };
}

export async function startLiveLocal(): Promise<LiveVoiceControlResult> {
  try { return await (liveBridge()?.startLive() ?? unavailableLiveResult()); }
  catch { return failedLiveResult(); }
}

export async function stopLiveLocal(): Promise<LiveVoiceControlResult> {
  try { return await (liveBridge()?.stopLive() ?? unavailableLiveResult()); }
  catch { return failedLiveResult(); }
}

export async function pauseLiveLocal(): Promise<LiveVoiceControlResult> {
  try { return await (liveBridge()?.pauseLive() ?? unavailableLiveResult()); }
  catch { return failedLiveResult(); }
}

export async function resumeLiveLocal(): Promise<LiveVoiceControlResult> {
  try { return await (liveBridge()?.resumeLive() ?? unavailableLiveResult()); }
  catch { return failedLiveResult(); }
}

export async function getLiveStatusLocal(): Promise<LiveVoiceControlResult> {
  try { return await (liveBridge()?.getLiveStatus?.() ?? unavailableLiveResult()); }
  catch { return failedLiveResult(); }
}

function failedLiveResult(): LiveVoiceControlResult {
  return { ok: false, active: false, state: 'error', error: {
    code: 'VOICE_IPC_FAILED', message: 'Связь с локальным микрофоном прервана. Повторите запуск.',
  } };
}

export function subscribeLiveVoice(
  onState: (state: LiveVoiceState) => void,
  onTranscript: (transcript: LiveVoiceTranscript) => void,
): () => void {
  const bridge = liveBridge();
  if (!bridge) return () => {};
  const stateId = bridge.onLiveState((payload) => {
    const state = normalizeLiveState(payload);
    if (state) onState(state);
  });
  const transcriptId = bridge.onLiveTranscript((payload) => {
    const transcript = normalizeLiveTranscript(payload);
    if (transcript) onTranscript(transcript);
  });
  return () => {
    bridge.removeLiveListener(stateId);
    bridge.removeLiveListener(transcriptId);
  };
}

export function subscribeLiveVoiceControl(onControl: (control: LiveVoiceControlEvent) => void): () => void {
  const bridge = liveBridge();
  if (!bridge?.onLiveControl) return () => {};
  const listenerId = bridge.onLiveControl((payload) => {
    const control = normalizeLiveControl(payload);
    if (control) onControl(control);
  });
  return () => { bridge.removeLiveListener(listenerId); };
}

export function isSpeechSupported(): boolean {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export function isTTSSupported(): boolean {
  return typeof liveBridge()?.synthesize === 'function' && 'AudioContext' in window;
}

export function createRecognition(
  onResult: (text: string) => void,
  onEnd: () => void,
  lang: string = 'ru-RU',
): SpeechRecognitionLike | null {
  const speechWindow = window as SpeechRecognitionWindow;
  const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  if (!SR) return null;

  const recognition = new SR();
  recognition.lang = lang;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    const text = event.results[0][0].transcript;
    onResult(text);
  };

  recognition.onend = onEnd;
  recognition.onerror = () => onEnd();

  return recognition;
}

export type SpeechStatus = 'idle' | 'preparing' | 'playing';
let speechStatus: SpeechStatus = 'idle';
const speechListeners = new Set<(state: SpeechStatus) => void>();
export function subscribeSpeechStatus(listener: (state: SpeechStatus) => void) {
  speechListeners.add(listener); listener(speechStatus);
  return () => { speechListeners.delete(listener); };
}
function setSpeechStatus(state: SpeechStatus) {
  speechStatus = state;
  for (const listener of speechListeners) listener(state);
}

let speechSequence = 0;
let pendingStop = Promise.resolve();
let activeAudioSpeech: { id: number; source: AudioBufferSourceNode; resolve: () => void; reject: (error: Error) => void; timer: number } | null = null;
let neuralAudioContext: AudioContext | null = null;
const MAX_LOCAL_AUDIO_BYTES = 800000;

function speechDeadline<T>(operation: Promise<T>, milliseconds: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([operation, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Голос не завершил текущий этап. Повторите озвучку. Код: ${code}.`)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}

export function speechChunks(text: string): string[] {
  const clean = text.replace(/```[\s\S]*?```/g, 'блок кода').replace(/`[^`]+`/g, '')
    .replace(/(?:[#*_~>()]|\[|\])/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if ([...clean].length > 1200) throw new Error('Для озвучки выберите текст короче 1200 символов.');
  const chunks: string[] = [];
  let chunk = '';
  for (const word of clean.split(' ')) {
    if ([...word].length > 240) throw new Error('В тексте слишком длинное слово для озвучки.');
    if ([...chunk, ...word].length + 1 > 240) { chunks.push(chunk); chunk = ''; }
    chunk += (chunk ? ' ' : '') + word;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function finishAudio(id: number, error?: Error) {
  if (!activeAudioSpeech || activeAudioSpeech.id !== id) return;
  const active = activeAudioSpeech; activeAudioSpeech = null;
  window.clearTimeout(active.timer); active.source.onended = null; active.source.disconnect();
  if (error) active.reject(error); else active.resolve();
}
async function playAudioBuffer(audioBytes: ArrayBuffer, id: number) {
  if (speechSequence !== id) return;
  if (!neuralAudioContext || neuralAudioContext.state === 'closed') neuralAudioContext = new AudioContext({ latencyHint: 'playback' });
  const context = neuralAudioContext;
  const decoded = await speechDeadline(context.decodeAudioData(audioBytes.slice(0)), 5_000, 'TTS_DECODE_TIMEOUT');
  if (speechSequence !== id) return;
  if (decoded.duration < 0.1 || decoded.duration > 26 || decoded.numberOfChannels !== 1) throw new Error('Голос вернул некорректное аудио.');
  if (context.state === 'suspended') await speechDeadline(context.resume(), 3_000, 'TTS_OUTPUT_SUSPENDED');
  if (speechSequence !== id) return;
  if (context.state !== 'running') throw new Error('Аудиовыход недоступен. Проверьте устройство вывода Windows. Код: TTS_OUTPUT_UNAVAILABLE.');
  const source = context.createBufferSource(); source.buffer = decoded; source.connect(context.destination);
  setSpeechStatus('playing');
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
      finishAudio(id, new Error('Воспроизведение голоса не завершилось. Повторите озвучку. Код: TTS_PLAYBACK_TIMEOUT.'));
    }, (decoded.duration + 2) * 1000);
    activeAudioSpeech = { id, source, resolve, reject, timer };
    source.onended = () => finishAudio(id);
    try { source.start(); } catch { finishAudio(id, new Error('Не удалось воспроизвести голос. Код: TTS_OUTPUT_START.')); }
  });
}

export async function speak(text: string): Promise<void> {
  // Completed consecutive phrases can reuse the isolated model. An explicit
  // Stop, new turn, preview or interrupted utterance still disposes it.
  if (speechStatus !== 'idle' || activeAudioSpeech) stopSpeaking();
  const speechId = ++speechSequence;
  const bridge = liveBridge();
  if (!bridge?.synthesize) throw new Error('Голос Альтрона доступен в установленном приложении.');
  const chunks = speechChunks(text);
  try {
    await pendingStop;
    for (const chunk of chunks) {
      if (speechSequence !== speechId) return;
      setSpeechStatus('preparing');
      const result = await speechDeadline(bridge.synthesize(chunk), 45_000, 'TTS_SYNTHESIS_TIMEOUT');
      if (speechSequence !== speechId) return;
      if (!result?.ok) throw new Error(result?.error?.message || 'Не удалось подготовить голос Альтрона.');
      if (result.engine !== 'ultron-angry' || result.mimeType !== 'audio/mpeg' || !(result.audio instanceof Uint8Array)
        || result.audio.byteLength < 512 || result.audio.byteLength > MAX_LOCAL_AUDIO_BYTES) throw new Error('Получен неизвестный голос или некорректное аудио.');
      const bytes = new Uint8Array(result.audio);
      await playAudioBuffer(bytes.buffer, speechId);
    }
  } catch (error) {
    if (speechSequence !== speechId) return;
    stopSpeaking();
    throw error;
  } finally {
    if (speechSequence === speechId) setSpeechStatus('idle');
  }
}

export function stopSpeaking() {
  speechSequence += 1;
  pendingStop = speechDeadline(Promise.resolve(liveBridge()?.stopSpeech?.()), 8_000, 'TTS_STOP_TIMEOUT').then(() => {});
  // Keep rejection for the next operation, but avoid an unhandled rejection
  // when Stop is not followed by another utterance. Never synthesize before ack.
  void pendingStop.catch(() => {});
  if (activeAudioSpeech) {
    const active = activeAudioSpeech;
    try { active.source.stop(); } catch { /* already stopped */ }
    finishAudio(active.id);
  }
  // Also stop any speech left by an older renderer. Never use it as a fallback.
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  setSpeechStatus('idle');
}

export async function previewUltronVoice() {
  stopSpeaking();
  const id = ++speechSequence;
  try {
    await pendingStop;
    if (speechSequence !== id) return;
    const result = await speechDeadline(Promise.resolve(liveBridge()?.previewSpeech?.()), 45_000, 'TTS_SYNTHESIS_TIMEOUT');
    if (speechSequence !== id) return;
    if (!result?.ok || result.engine !== 'ultron-angry' || result.mimeType !== 'audio/mpeg'
      || !(result.audio instanceof Uint8Array) || result.audio.byteLength > MAX_LOCAL_AUDIO_BYTES) throw new Error('Образец голоса недоступен.');
    await playAudioBuffer(new Uint8Array(result.audio).buffer, id);
  } finally { if (speechSequence === id) setSpeechStatus('idle'); }
}
