const { randomUUID } = require('crypto');

const VOICE_ACTION_PREVIEW_SCHEMA = 'eclipse.ultron.voice-action-preview.v1';
const VOICE_ACTION_APPROVAL_SCHEMA = 'eclipse.ultron.voice-action-approval.v1';
const VOICE_ACTION_RECEIPT_SCHEMA = 'eclipse.ultron.voice-action-receipt.v1';
const VOICE_ACTION_PREVIEW_TTL_MS = 2 * 60 * 1_000;

const VOICE_ACTIONS = Object.freeze({
  'browser.youtube': Object.freeze({
    id: 'browser.youtube',
    label: 'Открыть YouTube',
    target: 'https://www.youtube.com/',
    dataDisclosure: 'После подтверждения браузер сам подключится к youtube.com. Альтрон не передаёт историю диалога.',
    expectedResult: 'YouTube откроется в браузере по умолчанию.',
    rollback: 'Закройте открытую вкладку браузера.',
  }),
});

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
}

function createVoiceActionPreview(actionId, options = {}) {
  const action = VOICE_ACTIONS[actionId];
  if (!action) return null;
  const now = options.now ?? Date.now();
  const idFactory = options.idFactory ?? randomUUID;
  return Object.freeze({
    schemaVersion: VOICE_ACTION_PREVIEW_SCHEMA,
    requestId: idFactory(),
    actionId: action.id,
    label: action.label,
    target: action.target,
    dataDisclosure: action.dataDisclosure,
    expectedResult: action.expectedResult,
    rollback: action.rollback,
    expiresAt: new Date(now + VOICE_ACTION_PREVIEW_TTL_MS).toISOString(),
  });
}

function approveVoiceAction(preview, approval, now = Date.now()) {
  if (!preview || !exactKeys(approval, ['schemaVersion', 'requestId', 'actionId', 'confirmed'])) return null;
  if (approval.schemaVersion !== VOICE_ACTION_APPROVAL_SCHEMA || approval.confirmed !== true) return null;
  if (approval.requestId !== preview.requestId || approval.actionId !== preview.actionId) return null;
  const expiresAt = Date.parse(preview.expiresAt);
  if (!Number.isFinite(expiresAt) || now > expiresAt) return null;
  return VOICE_ACTIONS[preview.actionId] ?? null;
}

function createVoiceActionReceipt(preview, openedAt = new Date()) {
  return Object.freeze({
    schemaVersion: VOICE_ACTION_RECEIPT_SCHEMA,
    requestId: preview.requestId,
    actionId: preview.actionId,
    status: 'dispatched',
    target: VOICE_ACTIONS[preview.actionId].target,
    openedAt: openedAt.toISOString(),
  });
}

module.exports = {
  VOICE_ACTION_APPROVAL_SCHEMA,
  VOICE_ACTION_PREVIEW_SCHEMA,
  VOICE_ACTION_RECEIPT_SCHEMA,
  VOICE_ACTIONS,
  approveVoiceAction,
  createVoiceActionPreview,
  createVoiceActionReceipt,
};
