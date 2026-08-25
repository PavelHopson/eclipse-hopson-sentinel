import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  createEphemeralTtsPath,
  isValidPcmWav,
  prepareEphemeralTtsFile,
  pruneStaleTtsFiles,
  readBoundedPcmWav,
  removeEphemeralTtsFile,
} = require('../dashboard/electron/tts-wav-transport.cjs')

function createPcmWav(sampleBytes = 32) {
  const wav = Buffer.alloc(44 + sampleBytes)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(22_050, 24)
  wav.writeUInt32LE(44_100, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(sampleBytes, 40)
  return wav
}

test('ephemeral Piper transport accepts exact RIFF audio and removes it after reading', async (t) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'ultron-tts-transport-'))
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }))

  const output = await prepareEphemeralTtsFile(runtimeRoot)
  assert.equal(path.dirname(output.filePath), output.directory)
  assert.match(path.basename(output.filePath), /^ultron-tts-[0-9a-f-]+\.wav$/i)

  const expected = createPcmWav()
  await writeFile(output.filePath, expected)
  const actual = await readBoundedPcmWav(output.filePath, 1024)
  assert.deepEqual(actual, expected)
  assert.equal(await removeEphemeralTtsFile(output.filePath), true)
  await assert.rejects(readFile(output.filePath), { code: 'ENOENT' })
})

test('ephemeral Piper transport rejects stdout-style CRLF corruption and oversized files', async (t) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'ultron-tts-corruption-'))
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }))
  const output = await prepareEphemeralTtsFile(runtimeRoot)
  const valid = createPcmWav()
  const corrupted = Buffer.concat([valid, Buffer.from([0x0d])])

  assert.equal(isValidPcmWav(corrupted), false)
  await writeFile(output.filePath, corrupted)
  assert.equal(await readBoundedPcmWav(output.filePath, 1024), null)
  assert.equal(await readBoundedPcmWav(output.filePath, 44), null)
})

test('startup cleanup only removes scoped Ultron TTS files', async (t) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'ultron-tts-prune-'))
  t.after(() => rm(runtimeRoot, { recursive: true, force: true }))
  const { directory } = createEphemeralTtsPath(runtimeRoot)
  const stale = path.join(directory, 'ultron-tts-00000000-0000-4000-8000-000000000000.wav')
  const unrelated = path.join(directory, 'keep-me.wav')

  await prepareEphemeralTtsFile(runtimeRoot)
  await writeFile(stale, createPcmWav())
  await writeFile(unrelated, createPcmWav())
  const oldTimestamp = new Date(Date.now() - 11 * 60 * 1_000)
  await utimes(stale, oldTimestamp, oldTimestamp)
  await pruneStaleTtsFiles(directory)

  await assert.rejects(readFile(stale), { code: 'ENOENT' })
  assert.equal((await readFile(unrelated)).length, createPcmWav().length)
})
