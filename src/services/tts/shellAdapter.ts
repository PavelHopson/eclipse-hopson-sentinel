// Shell TTS adapter — wraps the existing sentinel-tts-universal.mjs script.
//
// This adapter delegates to platform-specific shell scripts (PowerShell on
// Windows, bash on macOS/Linux) and is always available as the baseline
// system TTS engine.

import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import type { TTSAdapter, TTSOptions, TTSResult } from '../ttsAdapter.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Resolve the universal TTS script relative to this file.
// At build time this module lives in src/services/tts/ → scripts/ is three
// levels up.  At runtime (dist/) the exact depth may differ, but the repo
// layout guarantees the scripts/ folder sits at the project root.
const SCRIPTS_DIR = join(__dirname, '..', '..', '..', 'scripts')

export class ShellTTSAdapter implements TTSAdapter {
  name = 'Shell (System TTS)'

  async isAvailable(): Promise<boolean> {
    // Shell-based TTS is always available — every supported platform has a
    // built-in speech synthesizer (SAPI on Windows, say on macOS, espeak/
    // festival on Linux).
    return true
  }

  async speak(text: string, options?: TTSOptions): Promise<TTSResult> {
    try {
      const scriptPath = join(SCRIPTS_DIR, 'sentinel-tts-universal.mjs')
      const mod = await import(scriptPath)
      const result = await mod.speak(text, {
        voice: options?.voice,
        rate: options?.rate,
      })
      return {
        ok: result.ok,
        engine: result.engine ?? 'shell',
        error: result.error,
      }
    } catch (err) {
      return {
        ok: false,
        engine: 'shell',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
