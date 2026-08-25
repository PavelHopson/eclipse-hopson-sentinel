import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { detectVoiceAction } from '../dashboard/src/lib/voiceActions.ts'

const require = createRequire(import.meta.url)
const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const readText = (relativePath) => readFile(path.join(repoRoot, relativePath), 'utf8')
const {
  approveVoiceAction,
  createVoiceActionPreview,
  createVoiceActionReceipt,
  VOICE_ACTIONS,
} = require('../dashboard/electron/voice-action-policy.cjs')

const NOW = Date.parse('2026-08-25T18:00:00.000Z')
const REQUEST_ID = '00000000-0000-4000-8000-000000000001'

test('YouTube voice intent is deterministic and rejects compound or unrelated commands', () => {
  for (const command of [
    'Открой YouTube',
    'Альтрон, открой ютуб пожалуйста',
    'Запусти мне ютюб',
    'Перейди на youtube',
  ]) {
    assert.equal(detectVoiceAction(command), 'browser.youtube')
  }
  for (const command of [
    'Найди ролик на YouTube',
    'Открой YouTube и отправь сообщение',
    'Открой example.com',
    'Запусти PowerShell',
  ]) {
    assert.equal(detectVoiceAction(command), null)
  }
})

test('voice action approval is exact, expiring and bound to one fixed allowlisted target', () => {
  const preview = createVoiceActionPreview('browser.youtube', { now: NOW, idFactory: () => REQUEST_ID })
  assert.equal(preview.target, 'https://www.youtube.com/')
  assert.equal(Object.keys(VOICE_ACTIONS).length, 1)
  assert.equal(createVoiceActionPreview('browser.user-url'), null)

  const approval = {
    schemaVersion: 'eclipse.ultron.voice-action-approval.v1',
    requestId: REQUEST_ID,
    actionId: 'browser.youtube',
    confirmed: true,
  }
  assert.equal(approveVoiceAction(preview, approval, NOW + 1_000), VOICE_ACTIONS['browser.youtube'])
  assert.equal(approveVoiceAction(preview, { ...approval, target: 'https://example.com' }, NOW + 1_000), null)
  assert.equal(approveVoiceAction(preview, { ...approval, requestId: 'wrong' }, NOW + 1_000), null)
  assert.equal(approveVoiceAction(preview, approval, NOW + 3 * 60 * 1_000), null)

  assert.deepEqual(createVoiceActionReceipt(preview, new Date(NOW + 2_000)), {
    schemaVersion: 'eclipse.ultron.voice-action-receipt.v1',
    requestId: REQUEST_ID,
    actionId: 'browser.youtube',
    status: 'dispatched',
    target: 'https://www.youtube.com/',
    openedAt: '2026-08-25T18:00:02.000Z',
  })
})

test('trusted Electron action IPC requires preview and manual confirmation before fixed openExternal', async () => {
  const [main, preload, conversation, policy, css] = await Promise.all([
    readText('dashboard/electron/main.cjs'),
    readText('dashboard/electron/preload.cjs'),
    readText('dashboard/src/components/UltronVoiceConversation.tsx'),
    readText('dashboard/electron/voice-action-policy.cjs'),
    readText('dashboard/src/ultron.css'),
  ])

  assert.match(main, /VOICE_ACTION_PREVIEW_CHANNEL/)
  assert.match(main, /VOICE_ACTION_EXECUTE_CHANNEL/)
  assert.match(main, /isTrustedOperatorSender\(event\)/)
  assert.match(main, /approveVoiceAction\(preview, args\[0\]\)/)
  assert.match(main, /await shell\.openExternal\(action\.target\)/)
  assert.doesNotMatch(main, /shell\.openExternal\(args|shell\.openExternal\(request/)
  assert.match(preload, /previewAction\(actionId\)/)
  assert.match(preload, /executeAction\(approval\)/)
  assert.match(conversation, /Нужно подтверждение/)
  assert.match(conversation, /pendingAction\.dataDisclosure/)
  assert.match(conversation, /pendingAction\.rollback/)
  assert.match(conversation, /Открыть YouTube/)
  assert.match(conversation, /scrollIntoView/)
  assert.match(conversation, /behavior: motionEnabled \? 'smooth' : 'auto'/)
  assert.match(css, /\.ultron-voice__action-preview/)
  assert.match(css, /\.ultron-voice__action-controls button \{ min-height: 44px; \}/)
  assert.match(policy, /'browser\.youtube'/)
  assert.doesNotMatch(policy, /child_process|exec\(|spawn\(|eval\(/)

  const executeStart = main.indexOf('ipcMain.handle(VOICE_ACTION_EXECUTE_CHANNEL')
  const consumePreview = main.indexOf('pendingVoiceActionPreview = null', executeStart)
  const externalOpen = main.indexOf('await shell.openExternal(action.target)', executeStart)
  assert.ok(executeStart >= 0 && consumePreview > executeStart && externalOpen > consumePreview)
})
