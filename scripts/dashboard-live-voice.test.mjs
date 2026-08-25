import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

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

test('live manager commits the final whisper-stream redraw instead of partial hypotheses', () => {
  const events = []
  const manager = new UltronLiveVoiceManager({
    runtimeRoot: 'E:\\missing-runtime-for-contract-test',
    sendEvent: (channel, payload) => events.push({ channel, payload }),
  })
  manager.process = { killed: false }
  manager.ignoreUntil = 0

  manager.stdoutBuffer = '[Start speaking]\n\x1b[2K\r Привет, Альтрон'
  manager.parseAvailableTranscripts()
  assert.equal(events.length, 0)

  manager.stdoutBuffer += '\x1b[2K\r Привет, Альтрон, ты меня слышишь?\n'
  manager.parseAvailableTranscripts()

  const transcripts = events.filter((event) => event.channel === 'sentinel:voice:live-transcript')
  assert.equal(transcripts.length, 1)
  assert.equal(transcripts[0].payload.text, 'Привет, Альтрон, ты меня слышишь?')
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
