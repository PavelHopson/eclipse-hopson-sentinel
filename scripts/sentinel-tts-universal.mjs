// Universal TTS wrapper for Sentinel.
//
// Detects the current OS and delegates to the appropriate TTS backend:
//   - Windows  → sentinel-tts.ps1 via PowerShell
//   - macOS    → sentinel-tts.sh via bash
//   - Linux    → sentinel-tts.sh via bash
//
// Usage (ESM):
//   import { speak } from './sentinel-tts-universal.mjs'
//   const result = await speak('Hello world', { voice: 'Alex', rate: 200 })

import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Speak text using the platform-appropriate TTS engine.
 *
 * @param {string} text - The text to speak (required).
 * @param {{ voice?: string; rate?: number }} [options] - Optional voice and rate.
 * @returns {Promise<{ ok: boolean; engine?: string; error?: string }>}
 */
export function speak(text, options) {
  if (!text || typeof text !== 'string') {
    return Promise.resolve({ ok: false, error: 'No text provided' })
  }

  const platform = process.platform

  if (platform === 'win32') {
    return speakWindows(text, options)
  }

  if (platform === 'darwin' || platform === 'linux') {
    return speakUnix(text, options)
  }

  return Promise.resolve({ ok: false, error: `Unsupported platform: ${platform}` })
}

// ─── Windows: PowerShell + sentinel-tts.ps1 ─────────────────────────

function speakWindows(text, options) {
  return new Promise(resolve => {
    const scriptPath = join(__dirname, 'sentinel-tts.ps1')
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Text',
      text,
    ]

    if (options?.voice) {
      args.push('-Voice', options.voice)
    }
    if (options?.rate != null) {
      args.push('-Rate', String(options.rate))
    }

    const child = spawn('powershell', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stderr = ''
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('close', code => {
      if (code === 0) {
        resolve({ ok: true, engine: 'sapi' })
      } else {
        resolve({ ok: false, engine: 'sapi', error: stderr.trim() || `exit code ${code}` })
      }
    })

    child.on('error', err => {
      resolve({ ok: false, engine: 'sapi', error: err.message })
    })
  })
}

// ─── macOS / Linux: bash + sentinel-tts.sh ──────────────────────────

function speakUnix(text, options) {
  return new Promise(resolve => {
    const scriptPath = join(__dirname, 'sentinel-tts.sh')
    const args = [scriptPath, text]

    if (options?.voice) {
      args.push('--voice', options.voice)
    }
    if (options?.rate != null) {
      args.push('--rate', String(options.rate))
    }

    const child = spawn('bash', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('close', code => {
      // Try to parse the JSON result from the shell script
      try {
        const result = JSON.parse(stdout.trim())
        resolve(result)
      } catch {
        if (code === 0) {
          resolve({ ok: true, engine: 'unknown' })
        } else {
          resolve({ ok: false, error: stderr.trim() || `exit code ${code}` })
        }
      }
    })

    child.on('error', err => {
      resolve({ ok: false, error: err.message })
    })
  })
}
