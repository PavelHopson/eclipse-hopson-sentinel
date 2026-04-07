// Wake word detection module for Sentinel.
//
// Listens for a configurable wake phrase (default: "sentinel") by running
// continuous STT in the background and checking transcripts for the keyword.
// Uses the existing audio-capture-napi module for microphone access.

import { logEvent } from './analytics/index.js'
import { logForDebugging } from '../utils/debug.js'
import { logError } from '../utils/log.js'

// ─── Types ──────────────────────────────────────────────────────────

export interface WakeWordConfig {
  /** The keyword or phrase to listen for. */
  keyword: string
  /**
   * Sensitivity threshold (0.0–1.0). Lower values require a closer match;
   * higher values are more permissive. Default: 0.5.
   */
  sensitivity: number
  /** Called when the wake word is detected. */
  callback: () => void
}

export interface WakeWordEngine {
  /** Begin listening for the wake word. */
  start(): Promise<void>
  /** Stop listening and release the microphone. */
  stop(): void
  /** Whether the engine is currently listening. */
  isListening(): boolean
}

// ─── Constants ──────────────────────────────────────────────────────

const DEFAULT_KEYWORD = 'sentinel'
const DEFAULT_SENSITIVITY = 0.5
const COOLDOWN_MS = 2_000
const CHUNK_INTERVAL_MS = 1_500

// ─── Lazy-loaded native audio module ────────────────────────────────

type AudioNapi = typeof import('audio-capture-napi')

async function loadAudioNapi(): Promise<AudioNapi> {
  const mod = await import('audio-capture-napi')
  return mod
}

// ─── Simple keyword-spotting engine ─────────────────────────────────
//
// This implementation captures audio via the native module, feeds chunks
// to a background STT pass, and checks whether the transcript contains
// the wake keyword. It is intentionally simple — a production system
// would use a dedicated wake-word model (Porcupine, Rustpotter, etc.).

class SimpleWakeWordEngine implements WakeWordEngine {
  private readonly config: Required<WakeWordConfig>
  private listening = false
  private lastActivation = 0
  private audioNapi: AudioNapi | null = null
  private chunkTimer: ReturnType<typeof setInterval> | null = null
  private audioBuffer: Buffer[] = []

  constructor(config: Partial<WakeWordConfig> & Pick<WakeWordConfig, 'callback'>) {
    this.config = {
      keyword: config.keyword ?? DEFAULT_KEYWORD,
      sensitivity: config.sensitivity ?? DEFAULT_SENSITIVITY,
      callback: config.callback,
    }
  }

  async start(): Promise<void> {
    if (this.listening) {
      return
    }

    const napi = await loadAudioNapi()
    if (!napi.isNativeAudioAvailable()) {
      logForDebugging('[wakeWord] native audio not available, cannot start')
      throw new Error('Native audio module is not available')
    }
    this.audioNapi = napi

    const started = napi.startNativeRecording(
      (chunk: Buffer) => {
        this.audioBuffer.push(chunk)
      },
      () => {
        // Silence callback — restart recording if still listening
        if (this.listening) {
          this.restartRecording()
        }
      },
    )

    if (!started) {
      throw new Error('Failed to start native audio recording')
    }

    this.listening = true

    // Periodically process accumulated audio chunks
    this.chunkTimer = setInterval(() => {
      void this.processAudioChunks()
    }, CHUNK_INTERVAL_MS)

    logForDebugging(`[wakeWord] started, keyword="${this.config.keyword}"`)
    void logEvent('wakeWord_started', {})
  }

  stop(): void {
    if (!this.listening) {
      return
    }

    this.listening = false

    if (this.chunkTimer) {
      clearInterval(this.chunkTimer)
      this.chunkTimer = null
    }

    if (this.audioNapi) {
      this.audioNapi.stopNativeRecording()
    }

    this.audioBuffer = []
    logForDebugging('[wakeWord] stopped')
    void logEvent('wakeWord_stopped', {})
  }

  isListening(): boolean {
    return this.listening
  }

  // ── Internal ────────────────────────────────────────────────────

  private restartRecording(): void {
    if (!this.listening || !this.audioNapi) {
      return
    }

    this.audioNapi.startNativeRecording(
      (chunk: Buffer) => {
        this.audioBuffer.push(chunk)
      },
      () => {
        if (this.listening) {
          this.restartRecording()
        }
      },
    )
  }

  private async processAudioChunks(): Promise<void> {
    if (this.audioBuffer.length === 0) {
      return
    }

    // Drain the buffer
    const chunks = this.audioBuffer.splice(0)
    const combined = Buffer.concat(chunks)

    // In a full implementation this buffer would be sent to a local STT
    // engine (Whisper, Vosk, etc.) and the resulting transcript checked
    // for the keyword. For now we use a placeholder that demonstrates
    // the architecture without adding a heavy STT dependency.
    const transcript = await this.transcribeChunk(combined)

    if (transcript && this.matchesKeyword(transcript)) {
      const now = Date.now()
      if (now - this.lastActivation < COOLDOWN_MS) {
        logForDebugging('[wakeWord] activation suppressed (cooldown)')
        return
      }

      this.lastActivation = now
      logForDebugging(`[wakeWord] keyword detected in: "${transcript}"`)
      void logEvent('wakeWord_detected', {})

      try {
        this.config.callback()
      } catch (err) {
        logError(err as Error)
      }
    }
  }

  /**
   * Transcribe a raw PCM audio chunk. This is a stub — plug in a local
   * STT engine (e.g. whisper.cpp via addon, Vosk, or a WebSocket to a
   * local server) to get real transcription.
   */
  private async transcribeChunk(_audio: Buffer): Promise<string | null> {
    // TODO: integrate local STT engine (whisper.cpp, Vosk, etc.)
    // For now, return null — no keyword will be detected until a real
    // STT backend is wired in.
    return null
  }

  private matchesKeyword(transcript: string): boolean {
    const lower = transcript.toLowerCase()
    const keyword = this.config.keyword.toLowerCase()

    // Direct substring match — sufficient for simple keyword spotting.
    // A production implementation would use fuzzy matching or phonetic
    // distance (Levenshtein on phonemes) scaled by `sensitivity`.
    if (lower.includes(keyword)) {
      return true
    }

    // Support Russian wake phrase "эй сентинел"
    if (keyword === DEFAULT_KEYWORD && lower.includes('сентинел')) {
      return true
    }

    return false
  }
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a wake word detection engine.
 *
 * @example
 * ```ts
 * const engine = createWakeWordEngine({
 *   keyword: 'sentinel',
 *   sensitivity: 0.5,
 *   callback: () => console.log('Wake word detected!'),
 * })
 * await engine.start()
 * ```
 */
export function createWakeWordEngine(
  config: Partial<WakeWordConfig> & Pick<WakeWordConfig, 'callback'>,
): WakeWordEngine {
  return new SimpleWakeWordEngine(config)
}
