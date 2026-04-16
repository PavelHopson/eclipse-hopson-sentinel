// MOSS-TTS-Nano adapter — connects to a local Python HTTP server that wraps
// the MOSS-TTS-Nano model for higher-quality speech synthesis.
//
// The server is expected to run on localhost (default port 8765).  When the
// server is unavailable the TTSRouter will automatically fall back to the
// shell-based system TTS.
//
// Server setup: see scripts/moss-tts-server.py

import type { TTSAdapter, TTSOptions, TTSResult } from '../ttsAdapter.js'

const DEFAULT_URL = 'http://localhost:8765'

export class MossTTSAdapter implements TTSAdapter {
  name = 'MOSS-TTS-Nano'
  private baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? (process.env.MOSS_TTS_URL || DEFAULT_URL)
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { status?: string }
      // The server reports status='ok' when the model is loaded and ready.
      return data.status === 'ok'
    } catch {
      return false
    }
  }

  async speak(text: string, options?: TTSOptions): Promise<TTSResult> {
    try {
      const res = await fetch(`${this.baseUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: options?.language ?? 'ru',
          speed: options?.rate ?? 1.0,
        }),
        signal: AbortSignal.timeout(30_000),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(
          `MOSS-TTS server responded with ${res.status}: ${body}`,
        )
      }

      // The server returns audio/wav.  For now we consume the response to
      // confirm success; callers that need the audio data can extend this
      // to write to a temp file or stream directly.
      // Future: save to temp file and return audioPath.
      await res.arrayBuffer()

      return { ok: true, engine: 'moss-tts-nano' }
    } catch (err) {
      return {
        ok: false,
        engine: 'moss-tts-nano',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
