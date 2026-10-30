import type { OperatorReceipt, OperatorTransport } from './operatorClient';
import type { VoicePlan } from './voiceCommandPolicy';

export type MascotState = 'idle' | 'working' | 'success' | 'error' | 'cancelled' | 'awaiting-confirmation' | 'unknown';
export const MASCOT_FRESH_MS = 30_000;
export interface OperatorMascotInput {
  stage: string;
  plan: Pick<VoicePlan, 'id' | 'skillId' | 'createdAt'> | null;
  receipt: OperatorReceipt | null;
  approvedAt: string | null;
  killSwitch: boolean;
  transport: OperatorTransport;
}
export interface MascotView {
  state: MascotState;
  source: 'product' | 'demo';
  confirmed: boolean;
  text: string;
  detail: string;
}

const unknown = (detail = 'Нет достоверного сигнала. Смотрите основной статус.') : MascotView =>
  ({ state: 'unknown', source: 'product', confirmed: false, text: 'Статус не подтверждён', detail });
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fresh = (value: number, now: number, ttl: number) => Number.isFinite(value) && value <= now && now - value < ttl;

export function operatorMascotExpiresAt(input: OperatorMascotInput, observedAt: number): number {
  const deadlines = [observedAt + MASCOT_FRESH_MS];
  if (input.plan) deadlines.push(Date.parse(input.plan.createdAt) + 30 * 60_000);
  if (input.stage === 'approved') deadlines.push(Date.parse(input.approvedAt || '') + 5 * 60_000);
  if (input.stage === 'receipt') deadlines.push(Date.parse(input.receipt?.completedAt || '') + MASCOT_FRESH_MS);
  return deadlines.every(Number.isFinite) ? Math.min(...deadlines) : observedAt;
}

// Projection only. Never invokes IPC, approves, cancels, speaks or changes a task.
// Inputs are the existing operator view's state, not a new backend event protocol.
export function projectOperatorMascot(input: OperatorMascotInput | null, observedAt: number, now: number): MascotView {
  if (!input || !Number.isFinite(now) || !fresh(observedAt, now, MASCOT_FRESH_MS)) return unknown('Сигнал отсутствует или устарел. Результат не предполагается.');
  const view = (state: MascotState, text: string, detail: string, confirmed = false): MascotView =>
    ({ state, text, detail, confirmed, source: 'product' });
  if (input.stage === 'command' && !input.plan && !input.receipt) return view('idle', 'Ожидаю команду', 'Это ожидание ввода, не проверка исправности системы.');
  if (input.stage === 'error') return view('error', 'Операция с ошибкой', 'Подробности и повтор — в основном интерфейсе.');
  const plan = input.plan;
  if (!plan || !uuid(plan.id) || !['workspace.status', 'skills.status', 'memory.preview'].includes(plan.skillId)
    || !fresh(Date.parse(plan.createdAt), now, 30 * 60_000)) return unknown();
  if (input.stage === 'plan' && !input.approvedAt) return view('awaiting-confirmation', 'План ждёт подтверждения', 'Маскот не выдаёт разрешений и не нажимает кнопки.');
  if (input.stage === 'approved' && fresh(Date.parse(input.approvedAt || ''), now, 5 * 60_000)) {
    return view('idle', input.killSwitch ? 'План подтверждён · STOP активен' : 'Ожидаю ручного запуска', 'Выполнение ещё не началось.');
  }
  if (input.stage === 'executing') return view('working', 'Обрабатывается команда', 'Результат появится только после receipt.');
  if (input.stage !== 'receipt') return unknown();
  const receipt = input.receipt;
  if (!receipt || receipt.schemaVersion !== 'eclipse.sentinel.operator-receipt.v1'
    || receipt.planId !== plan.id || receipt.skillId !== plan.skillId || receipt.status !== 'succeeded'
    || receipt.effect !== 'read-only' || !uuid(receipt.receiptId) || !uuid(receipt.requestId)
    || !fresh(Date.parse(receipt.completedAt), now, MASCOT_FRESH_MS)
    || !Number.isFinite(Date.parse(receipt.startedAt)) || Date.parse(receipt.startedAt) > Date.parse(receipt.completedAt)
    || Date.parse(receipt.startedAt) < Date.parse(plan.createdAt)) return unknown('Нет свежего receipt именно этой команды.');
  if (receipt.transport === 'browser-preview' && input.transport === 'browser-preview') {
    return view('idle', 'Предпросмотр завершён', 'Browser preview — не выполнение на компьютере.');
  }
  if (receipt.transport !== 'electron-ipc' || input.transport !== 'electron-ipc') return unknown('Транспорт результата не совпадает с текущим интерфейсом.');
  return view('success', 'Есть подтверждённый receipt', 'Завершена эта read-only команда. Не весь голосовой контур.', true);
}
