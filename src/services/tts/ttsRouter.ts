// TTS router — tries adapters in priority order (highest quality first) and
// falls back to the next available engine on failure.
//
// Default priority:
//   1. MOSS-TTS-Nano  (neural, high quality — requires local Python server)
//   2. Shell / System TTS (always available)

import type { TTSAdapter, TTSOptions, TTSResult } from '../ttsAdapter.js'
import { MossTTSAdapter } from './mossTTSAdapter.js'
import { ShellTTSAdapter } from './shellAdapter.js'

export class TTSRouter {
  private adapters: TTSAdapter[]

  constructor(adapters?: TTSAdapter[]) {
    this.adapters = adapters ?? [new MossTTSAdapter(), new ShellTTSAdapter()]
  }

  /**
   * Speak text using the first available TTS engine.
   *
   * Iterates through adapters in priority order.  If an adapter reports
   * itself as available but fails at synthesis time, the router moves on
   * to the next adapter.
   */
  async speak(text: string, options?: TTSOptions): Promise<TTSResult> {
    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        const result = await adapter.speak(text, options)
        if (result.ok) return result
        // Adapter was available but synthesis failed — try next
      }
    }
    return {
      ok: false,
      engine: 'none',
      error: 'No TTS engine available',
    }
  }

  /**
   * List the names of all currently reachable TTS engines.
   */
  async listAvailable(): Promise<string[]> {
    const available: string[] = []
    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        available.push(adapter.name)
      }
    }
    return available
  }
}
