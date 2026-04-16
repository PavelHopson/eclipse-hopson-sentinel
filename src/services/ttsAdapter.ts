// TTS adapter interface for Eclipse Hopson Sentinel.
//
// Abstracts text-to-speech engines behind a common contract so the system
// can swap between shell-based system TTS and higher-quality providers
// (e.g. MOSS-TTS-Nano) without changing call sites.

export interface TTSOptions {
  voice?: string
  rate?: number
  language?: string
}

export interface TTSResult {
  ok: boolean
  engine: string
  audioPath?: string
  error?: string
}

export interface TTSAdapter {
  /** Human-readable name of the TTS engine. */
  name: string

  /** Check whether this adapter can serve requests right now. */
  isAvailable(): Promise<boolean>

  /** Synthesize speech from text. */
  speak(text: string, options?: TTSOptions): Promise<TTSResult>
}
