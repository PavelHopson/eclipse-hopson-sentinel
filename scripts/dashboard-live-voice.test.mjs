import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { EventEmitter } from 'node:events'

const require = createRequire(import.meta.url)
const { UltronLiveVoiceManager, normalizeTranscript } = require('../dashboard/electron/ultron-live-voice.cjs')

test('live transcript normalization removes timestamps and control tokens', () => {
  assert.equal(
    normalizeTranscript('[00:00:00.000 --> 00:00:02.000]  <|ru|>  Привет, Альтрон!'),
    'Привет, Альтрон!',
  )
})

test('live manager parses completed blocks and suppresses immediate duplicates', () => {
  const events = []
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: (channel, payload) => events.push({ channel, payload }),
  })
  manager.process = { killed: false }
  manager.ignoreUntil = 0
  manager.stdoutBuffer = [
    '### Transcription 0 START | t0 = 0 ms | t1 = 2000 ms',
    '[00:00:00.000 --> 00:00:01.500] Привет, Альтрон!',
    '### Transcription 0 END',
    '### Transcription 1 START | t0 = 0 ms | t1 = 2000 ms',
    '[00:00:00.000 --> 00:00:01.500] Привет, Альтрон!',
    '### Transcription 1 END',
  ].join('\n')

  manager.parseAvailableTranscripts()

  const transcripts = events.filter((event) => event.channel === 'sentinel:voice:live-transcript')
  assert.equal(transcripts.length, 1)
  assert.equal(transcripts[0].payload.text, 'Привет, Альтрон!')
})

test('live manager requires two matching sliding-window redraws', () => {
  const events = []
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: (channel, payload) => events.push({ channel, payload }),
  })
  manager.process = { killed: false }
  manager.ignoreUntil = 0

  manager.stdoutBuffer = '[Start speaking]\n\x1b[2K\r Привет, Альтрон'
  manager.parseAvailableTranscripts()
  assert.equal(events.filter(event => event.channel === 'sentinel:voice:live-transcript').length, 0)
  assert.equal(manager.ready, true)

  manager.stdoutBuffer += '\x1b[2K\r Привет, Альтрон, ты меня слышишь?\n'
  manager.parseAvailableTranscripts()
  assert.equal(events.filter(event => event.channel === 'sentinel:voice:live-transcript').length, 0)

  manager.stdoutBuffer += '\x1b[2K\r Привет, Альтрон, ты меня слышишь?\r'
  manager.parseAvailableTranscripts()

  const transcripts = events.filter((event) => event.channel === 'sentinel:voice:live-transcript')
  assert.equal(transcripts.length, 1)
  assert.equal(transcripts[0].payload.text, 'Привет, Альтрон, ты меня слышишь?')
  manager.process = null
  manager.stop()
})

test('live manager rejects common silence hallucinations even inside a completed VAD block', () => {
  const events = []
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: (channel, payload) => events.push({ channel, payload }),
  })
  manager.process = { killed: false }
  manager.ignoreUntil = 0
  manager.stdoutBuffer = '### Transcription 2 START\nПродолжение следует...\n### Transcription 2 END\n'
  manager.parseAvailableTranscripts()
  assert.equal(events.length, 0)

  manager.stdoutBuffer = '### Transcription 3 START\nСпасибо за просмотр…\n### Transcription 3 END\n'
  manager.parseAvailableTranscripts()
  assert.equal(events.length, 0)

  manager.stdoutBuffer = '\r Спасибо.\r Спасибо.\r Продолжение следует...\r Продолжение следует...\r'
  manager.parseAvailableTranscripts()
  assert.equal(events.length, 0)
})

test('live manager fails closed when fixed runtime files are unavailable', () => {
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: () => {},
  })

  const result = manager.start()
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'WHISPER_LIVE_RUNTIME_MISSING')
})

test('live manager trips a fail-closed circuit breaker on anomalous transcript bursts', async () => {
  const events = []
  let clock = 100_000
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: (channel, payload) => events.push({ channel, payload }),
    now: () => clock,
  })
  const child = new EventEmitter()
  child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close')) }
  manager.process = child
  manager.ignoreUntil = 0

  for (let index = 0; index < 9; index += 1) {
    manager.stdoutBuffer += `### Transcription ${index} START\nФраза номер ${index}\n### Transcription ${index} END\n`
    manager.parseAvailableTranscripts()
    clock += 1_000
  }

  const transcripts = events.filter((event) => event.channel === 'sentinel:voice:live-transcript')
  assert.equal(transcripts.length, 4)
  await manager.whenStopped
  const states = events.filter((event) => event.channel === 'sentinel:voice:live-state')
  assert.equal(manager.process, null)
  assert.equal(states.at(-1).payload.state, 'error')
  assert.match(states.at(-1).payload.detail, /Защита остановила живой режим/)
})

test('live stop delegates cleanup to the exact owned process-tree terminator', async () => {
  const child = new EventEmitter()
  let terminated = null
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: () => {},
    terminateProcessTree: (ownedChild) => { terminated = ownedChild; queueMicrotask(() => child.emit('close')) },
  })
  manager.process = child

  const result = manager.stop()

  assert.equal(result.ok, true)
  assert.equal(result.active, true, 'termination must be acknowledged before admission is released')
  assert.equal(terminated, child)
  await manager.whenStopped
  assert.equal(manager.isActive(), false)
})
