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

export type LiveVoiceStateName = 'idle' | 'starting' | 'listening' | 'paused' | 'error';

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

type FastSpeechResult =
  | { ok: true; audio: Uint8Array; engine: 'piper-dmitri-medium' }
  | { ok: false; error?: { code: string; message: string } };

type UltronVoiceWindow = Window & {
  ultronVoice?: {
    listenOnce(): Promise<LocalSpeechResult>;
    synthesize(text: string): Promise<FastSpeechResult>;
    stopSpeech(): Promise<boolean>;
    startLive(): Promise<LiveVoiceControlResult>;
    stopLive(): Promise<LiveVoiceControlResult>;
    pauseLive(): Promise<LiveVoiceControlResult>;
    resumeLive(): Promise<LiveVoiceControlResult>;
    onLiveState(callback: (payload: unknown) => void): number;
    onLiveTranscript(callback: (payload: unknown) => void): number;
    removeLiveListener(id: number): boolean;
  };
};

export function isLocalSTTSupported(): boolean {
  return typeof (window as UltronVoiceWindow).ultronVoice?.listenOnce === 'function';
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

export function isLiveSTTSupported(): boolean {
  return typeof (window as UltronVoiceWindow).ultronVoice?.startLive === 'function';
}

const LIVE_STATES = new Set<LiveVoiceStateName>(['idle', 'starting', 'listening', 'paused', 'error']);

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
  return liveBridge()?.startLive() ?? unavailableLiveResult();
}

export async function stopLiveLocal(): Promise<LiveVoiceControlResult> {
  return liveBridge()?.stopLive() ?? unavailableLiveResult();
}

export async function pauseLiveLocal(): Promise<LiveVoiceControlResult> {
  return liveBridge()?.pauseLive() ?? unavailableLiveResult();
}

export async function resumeLiveLocal(): Promise<LiveVoiceControlResult> {
  return liveBridge()?.resumeLive() ?? unavailableLiveResult();
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

export function isSpeechSupported(): boolean {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window;
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

let speechSequence = 0;
let activeSpeech: { id: number; resolve: () => void; timeoutId: number } | null = null;
let activeAudioSpeech: {
  id: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  resolve: (played: boolean) => void;
} | null = null;
let neuralAudioContext: AudioContext | null = null;

const MAX_LOCAL_AUDIO_BYTES = 12 * 1024 * 1024;

const VOICE_PREFERENCES_KEY = 'ultron-voice-preferences-v1';
const DEFAULT_VOICE_RATE = 1.06;
const DEFAULT_VOICE_PITCH = 0.82;

export interface VoicePreferences {
  voiceName: string;
  rate: number;
  pitch: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function loadVoicePreferences(): VoicePreferences {
  const fallback: VoicePreferences = {
    voiceName: 'Microsoft Pavel',
    rate: DEFAULT_VOICE_RATE,
    pitch: DEFAULT_VOICE_PITCH,
  };

  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VOICE_PREFERENCES_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    const candidate = parsed as Partial<VoicePreferences>;
    return {
      voiceName: typeof candidate.voiceName === 'string' ? candidate.voiceName.slice(0, 120) : fallback.voiceName,
      rate: typeof candidate.rate === 'number' && Number.isFinite(candidate.rate)
        ? clamp(candidate.rate, 0.95, 1.12)
        : fallback.rate,
      pitch: typeof candidate.pitch === 'number' && Number.isFinite(candidate.pitch)
        ? clamp(candidate.pitch, 0.7, 1.05)
        : fallback.pitch,
    };
  } catch {
    return fallback;
  }
}

export function saveVoicePreferences(preferences: VoicePreferences): VoicePreferences {
  const normalized: VoicePreferences = {
    voiceName: preferences.voiceName.slice(0, 120),
    rate: clamp(preferences.rate, 0.95, 1.12),
    pitch: clamp(preferences.pitch, 0.7, 1.05),
  };
  localStorage.setItem(VOICE_PREFERENCES_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function getAvailableVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isTTSSupported()) return [];
  const current = speechSynthesis.getVoices();
  if (current.length) return current;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(speechSynthesis.getVoices());
    };
    const timeoutId = window.setTimeout(finish, 900);
    speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
  });
}

function selectPreferredVoice(voices: SpeechSynthesisVoice[], voiceName: string, lang: string) {
  const exact = voices.find((voice) => voice.name.toLocaleLowerCase() === voiceName.toLocaleLowerCase());
  if (exact) return exact;

  const russian = voices.filter((voice) => voice.lang.toLocaleLowerCase().startsWith('ru'));
  return russian.find((voice) => /pavel|павел/i.test(voice.name))
    || russian.find((voice) => /dmitr|дмитр|maxim|максим/i.test(voice.name))
    || russian[0]
    || voices.find((voice) => voice.lang.toLocaleLowerCase().startsWith(lang.slice(0, 2).toLocaleLowerCase()))
    || null;
}

function finishActiveSpeech(id: number) {
  if (!activeSpeech || activeSpeech.id !== id) return;
  window.clearTimeout(activeSpeech.timeoutId);
  const resolve = activeSpeech.resolve;
  activeSpeech = null;
  resolve();
}

function finishActiveAudioSpeech(id: number, played: boolean) {
  if (!activeAudioSpeech || activeAudioSpeech.id !== id) return;
  const active = activeAudioSpeech;
  activeAudioSpeech = null;
  active.source.onended = null;
  active.source.disconnect();
  active.gain.disconnect();
  active.resolve(played);
}

async function playAudioBuffer(audioBytes: ArrayBuffer, id: number): Promise<boolean> {
  if (audioBytes.byteLength <= 44 || audioBytes.byteLength > MAX_LOCAL_AUDIO_BYTES || speechSequence !== id) return false;

  if (!neuralAudioContext || neuralAudioContext.state === 'closed') {
    neuralAudioContext = new AudioContext({ latencyHint: 'playback' });
  }

  const context = neuralAudioContext;
  const decoded = await context.decodeAudioData(audioBytes.slice(0));
  if (speechSequence !== id || decoded.duration <= 0) return false;
  if (context.state === 'suspended') await context.resume();

  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = 0.96;
  source.buffer = decoded;
  source.connect(gain);
  gain.connect(context.destination);

  return new Promise<boolean>((resolve) => {
    activeAudioSpeech = { id, source, gain, resolve };
    source.onended = () => finishActiveAudioSpeech(id, true);
    try {
      source.start();
    } catch {
      finishActiveAudioSpeech(id, false);
    }
  });
}

async function playFastLocalSpeech(text: string, id: number): Promise<boolean> {
  const bridge = liveBridge();
  if (!bridge?.synthesize) return false;
  try {
    const result = await bridge.synthesize(text);
    if (!result?.ok || !(result.audio instanceof Uint8Array)) return false;
    const bytes = new Uint8Array(result.audio);
    if (bytes.byteLength <= 44 || bytes.byteLength > MAX_LOCAL_AUDIO_BYTES) return false;
    const header = String.fromCharCode(...bytes.slice(0, 12));
    if (!header.startsWith('RIFF') || header.slice(8, 12) !== 'WAVE') return false;
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return playAudioBuffer(buffer, id);
  } catch {
    return false;
  }
}

export async function speak(text: string, lang: string = 'ru-RU'): Promise<void> {
  if (!isTTSSupported()) return;

  stopSpeaking();
  const speechId = ++speechSequence;

  // Clean markdown from text
  const clean = text
    .replace(/```[\s\S]*?```/g, 'блок кода')
    .replace(/`[^`]+`/g, '')
    .replace(/(?:[#*_~>()]|\[|\])/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();

  if (!clean) return;

  // Take first 500 chars for TTS
  const short = clean.length > 500 ? clean.slice(0, 500) + '...' : clean;
  const fastText = short.slice(0, 400);
  if (await playFastLocalSpeech(fastText, speechId)) return;
  if (speechSequence !== speechId) return;

  const preferences = loadVoicePreferences();
  const voices = await getAvailableVoices();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(short);
    utterance.lang = lang;
    utterance.rate = preferences.rate;
    utterance.pitch = preferences.pitch;
    utterance.volume = 0.96;

    // Chromium loads OneCore/SAPI voices asynchronously. Waiting briefly avoids
    // the unpredictable default voice on the first reply.
    const preferredVoice = selectPreferredVoice(voices, preferences.voiceName, lang);
    if (preferredVoice) utterance.voice = preferredVoice;

    const timeoutId = window.setTimeout(() => {
      speechSynthesis.cancel();
      finishActiveSpeech(speechId);
    }, 45_000);

    activeSpeech = { id: speechId, resolve, timeoutId };
    utterance.onend = () => finishActiveSpeech(speechId);
    utterance.onerror = () => finishActiveSpeech(speechId);
    try {
      speechSynthesis.speak(utterance);
    } catch {
      finishActiveSpeech(speechId);
    }
  });
}

export function stopSpeaking() {
  speechSequence += 1;
  void liveBridge()?.stopSpeech?.();
  if (activeAudioSpeech) {
    const activeId = activeAudioSpeech.id;
    try { activeAudioSpeech.source.stop(); } catch { /* already stopped */ }
    finishActiveAudioSpeech(activeId, false);
  }
  if (isTTSSupported()) speechSynthesis.cancel();
  if (activeSpeech) finishActiveSpeech(activeSpeech.id);
}
