export type VoiceActionId = 'browser.youtube';

export interface VoiceActionPreview {
  schemaVersion: 'eclipse.ultron.voice-action-preview.v1';
  requestId: string;
  actionId: VoiceActionId;
  label: string;
  target: string;
  dataDisclosure: string;
  expectedResult: string;
  rollback: string;
  expiresAt: string;
}

export interface VoiceActionReceipt {
  schemaVersion: 'eclipse.ultron.voice-action-receipt.v1';
  requestId: string;
  actionId: VoiceActionId;
  status: 'dispatched';
  target: string;
  openedAt: string;
}

type VoiceActionError = { code: string; message: string };
type PreviewResult = { ok: true; preview: VoiceActionPreview } | { ok: false; error: VoiceActionError };
type ExecuteResult = { ok: true; receipt: VoiceActionReceipt } | { ok: false; error: VoiceActionError };

interface VoiceActionBridge {
  previewAction(actionId: VoiceActionId): Promise<PreviewResult>;
  executeAction(approval: {
    schemaVersion: 'eclipse.ultron.voice-action-approval.v1';
    requestId: string;
    actionId: VoiceActionId;
    confirmed: true;
  }): Promise<ExecuteResult>;
  cancelAction(requestId: string): Promise<boolean>;
}

type VoiceActionWindow = Window & { ultronVoice?: Partial<VoiceActionBridge> };

const YOUTUBE_INTENT = /^(?:альтрон\s+)?(?:(?:открой|запусти)\s+(?:пожалуйста\s+)?(?:мне\s+)?(?:ютуб|ютюб|youtube)|перейди\s+на\s+(?:ютуб|ютюб|youtube))(?:\s+пожалуйста)?$/;

function normalizeVoiceCommand(input: string): string {
  return input
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[.,!?;:()[\]{}"'«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectVoiceAction(input: string): VoiceActionId | null {
  return YOUTUBE_INTENT.test(normalizeVoiceCommand(input)) ? 'browser.youtube' : null;
}

function bridge(): Partial<VoiceActionBridge> | undefined {
  return (window as VoiceActionWindow).ultronVoice;
}

export function isVoiceActionSupported(): boolean {
  const actionBridge = bridge();
  return typeof actionBridge?.previewAction === 'function'
    && typeof actionBridge.executeAction === 'function'
    && typeof actionBridge.cancelAction === 'function';
}

export async function previewVoiceAction(actionId: VoiceActionId): Promise<PreviewResult> {
  const actionBridge = bridge();
  if (!actionBridge?.previewAction) {
    return { ok: false, error: { code: 'ACTION_DESKTOP_REQUIRED', message: 'Действия доступны только в Eclipse Ultron Desktop.' } };
  }
  return actionBridge.previewAction(actionId);
}

export async function executeVoiceAction(preview: VoiceActionPreview): Promise<ExecuteResult> {
  const actionBridge = bridge();
  if (!actionBridge?.executeAction) {
    return { ok: false, error: { code: 'ACTION_DESKTOP_REQUIRED', message: 'Действия доступны только в Eclipse Ultron Desktop.' } };
  }
  return actionBridge.executeAction({
    schemaVersion: 'eclipse.ultron.voice-action-approval.v1',
    requestId: preview.requestId,
    actionId: preview.actionId,
    confirmed: true,
  });
}

export async function cancelVoiceAction(preview: VoiceActionPreview): Promise<boolean> {
  return bridge()?.cancelAction?.(preview.requestId) ?? false;
}
