import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'

const IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/i
const HELPER_PATH = fileURLToPath(new URL('./windows-credential-manager.ps1', import.meta.url))
const POWERSHELL_PATH = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
const DELETE_PREFIX = 'DELETE'

const MESSAGES = Object.freeze({
  UNSUPPORTED_PLATFORM: 'Windows Credential Manager is available only on Windows.',
  INVALID_IDENTITY: 'Office producer identity is invalid.',
  INVALID_SECRET: 'Office producer secret must contain 32–128 bytes.',
  NOT_FOUND: 'Office producer credential is not provisioned.',
  ALREADY_EXISTS: 'Office producer credential already exists; use an explicit rotation workflow.',
  CONFIRMATION_REQUIRED: 'Credential deletion requires the exact confirmation shown by the status command.',
  HELPER_FAILED: 'Windows Credential Manager could not complete the requested operation.',
  HELPER_TIMEOUT: 'Windows Credential Manager did not respond before the timeout.',
  INVALID_HELPER_RESPONSE: 'Windows Credential Manager returned an invalid response.',
  DISPOSED: 'The credential lease has already been disposed.',
})

export class OfficeCredentialError extends Error {
  constructor(code) {
    super(MESSAGES[code] || 'Office credential operation failed.')
    this.name = 'OfficeCredentialError'
    this.code = code
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message }
  }
}

function fail(code) {
  throw new OfficeCredentialError(code)
}

function validateIdentity(value) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) fail('INVALID_IDENTITY')
  return value
}

function validateSecret(secret) {
  if (!(secret instanceof Uint8Array) || secret.byteLength < 32 || secret.byteLength > 128) fail('INVALID_SECRET')
  return Buffer.from(secret)
}

function identity(options) {
  const producerId = validateIdentity(options.producerId)
  const keyId = validateIdentity(options.keyId)
  return Object.freeze({
    producerId,
    keyId,
    target: `EclipseForge/Sentinel/OfficeCore/${producerId}/${keyId}`,
  })
}

function defaultRunner({ operation, target, producerId, input, timeoutMs }) {
  if (process.platform !== 'win32') return Promise.reject(new OfficeCredentialError('UNSUPPORTED_PLATFORM'))
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL_PATH, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
      '-File', HELPER_PATH,
      '-Operation', operation,
      '-Target', target,
      '-UserName', producerId,
    ], {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows' },
    })
    let stdout = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new OfficeCredentialError('HELPER_TIMEOUT'))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length
      if (stdoutBytes <= 1024) stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => { stderrBytes += chunk.length })
    child.once('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new OfficeCredentialError('HELPER_FAILED'))
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0 || stdoutBytes > 1024 || stderrBytes > 16 * 1024) {
        reject(new OfficeCredentialError('HELPER_FAILED'))
        return
      }
      resolve(stdout)
    })
    child.stdin.on('error', () => {})
    if (input) child.stdin.end(input)
    else child.stdin.end()
  })
}

export class OfficeProducerSecretLease {
  #secret

  constructor(secret) {
    this.#secret = validateSecret(secret)
    Object.freeze(this)
  }

  get disposed() {
    return this.#secret === null
  }

  withBytes(callback) {
    if (this.#secret === null) fail('DISPOSED')
    if (typeof callback !== 'function') throw new TypeError('Credential callback is required')
    const temporary = Buffer.from(this.#secret)
    try {
      return callback(temporary)
    } finally {
      temporary.fill(0)
    }
  }

  dispose() {
    if (this.#secret !== null) this.#secret.fill(0)
    this.#secret = null
  }

  toJSON() {
    return Object.freeze({ redacted: true, disposed: this.disposed })
  }

  [inspect.custom]() {
    return `OfficeProducerSecretLease { redacted: true, disposed: ${this.disposed} }`
  }
}

export function credentialDeleteConfirmation(options) {
  const { producerId, keyId } = identity(options)
  return `${DELETE_PREFIX} ${producerId}/${keyId}`
}

export function createWindowsOfficeCredentialStore(options = {}) {
  const runner = typeof options.runner === 'function' ? options.runner : defaultRunner
  const timeoutMs = Number.isSafeInteger(options.timeoutMs)
    ? Math.min(Math.max(options.timeoutMs, 1_000), 30_000)
    : 10_000

  async function invoke(operation, descriptor, input) {
    try {
      return await runner({ operation, ...descriptor, input, timeoutMs })
    } catch (error) {
      if (error instanceof OfficeCredentialError) throw error
      fail('HELPER_FAILED')
    }
  }

  return Object.freeze({
    async status(request) {
      const descriptor = identity(request)
      const response = await invoke('status', descriptor)
      if (response !== 'PRESENT' && response !== 'MISSING') fail('INVALID_HELPER_RESPONSE')
      return Object.freeze({
        provider: 'windows-credential-manager',
        producerId: descriptor.producerId,
        keyId: descriptor.keyId,
        provisioned: response === 'PRESENT',
        deleteConfirmation: credentialDeleteConfirmation(descriptor),
      })
    },

    async provision(request) {
      const descriptor = identity(request)
      const secret = validateSecret(request.secret)
      try {
        const response = await invoke('write', descriptor, secret.toString('base64'))
        if (response === 'EXISTS') fail('ALREADY_EXISTS')
        if (response !== 'STORED') fail('INVALID_HELPER_RESPONSE')
        return Object.freeze({
          provider: 'windows-credential-manager',
          producerId: descriptor.producerId,
          keyId: descriptor.keyId,
          provisioned: true,
        })
      } finally {
        secret.fill(0)
      }
    },

    async read(request) {
      const descriptor = identity(request)
      const response = await invoke('read', descriptor)
      if (response === 'MISSING') fail('NOT_FOUND')
      if (!response.startsWith('SECRET:')) fail('INVALID_HELPER_RESPONSE')
      let secret
      try {
        secret = Buffer.from(response.slice(7), 'base64')
        if (secret.byteLength < 32 || secret.byteLength > 128) fail('INVALID_HELPER_RESPONSE')
        return new OfficeProducerSecretLease(secret)
      } finally {
        if (secret) secret.fill(0)
      }
    },

    async delete(request) {
      const descriptor = identity(request)
      if (request.confirmation !== credentialDeleteConfirmation(descriptor)) fail('CONFIRMATION_REQUIRED')
      const response = await invoke('delete', descriptor)
      if (response !== 'DELETED' && response !== 'MISSING') fail('INVALID_HELPER_RESPONSE')
      return Object.freeze({
        provider: 'windows-credential-manager',
        producerId: descriptor.producerId,
        keyId: descriptor.keyId,
        deleted: response === 'DELETED',
      })
    },
  })
}
