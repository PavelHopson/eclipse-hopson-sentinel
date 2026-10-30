export const TASK_PROJECTS = { ultron: 'Ultron', 'ai-hub': 'AI Hub', starai: 'StarAI', starcrm: 'StarCRM', starmarket: 'StarMarket' } as const;
export type TaskProject = keyof typeof TASK_PROJECTS;
export type TaskState = 'proposed' | 'planned' | 'paused' | 'completed' | 'cancelled';
export type TaskAction = 'accept' | 'pause' | 'resume' | 'complete' | 'cancel';
export type LedgerTask = {
  id: string; projectId: TaskProject; title: string; detail: string; state: TaskState; revision: number;
  createdAt: string; updatedAt: string; createdBy: string; executionAllowed: false;
  completionEvidence: null | { kind: 'owner_attested'; note: string; verifiedByRuntime: false };
};
export type LedgerEvent = { revision: number; action: TaskAction | 'propose'; actor: string; at: string };
type Result = { ok: false; error: string } | { ok: true; items?: LedgerTask[]; total?: number; nextCursor?: number | null; task?: LedgerTask; events?: LedgerEvent[] };
export type TaskRequest = { session: string; projectId: TaskProject } & (
  { kind: 'list'; after?: number } | { kind: 'get'; taskId: string } |
  { kind: 'propose'; title: string; detail: string } |
  { kind: 'transition'; taskId: string; action: TaskAction; expectedRevision: number; evidenceNote?: string }
);
declare global {
  interface Window {
    ultronTasks?: {
      activate(projectId: TaskProject): Promise<{ ok: true; session: string } | { ok: false; error: string }>;
      request(request: TaskRequest): Promise<Result>;
      close(session: string): Promise<boolean>;
    };
  }
}
export const TASK_STATES: Record<TaskState, string> = { proposed: 'Предложено', planned: 'В плане', paused: 'План приостановлен', completed: 'Завершено владельцем', cancelled: 'Отменено' };
export const TASK_ACTIONS: Record<TaskAction | 'propose', string> = { propose: 'Предложена', accept: 'Принять в план', pause: 'Приостановить план', resume: 'Вернуть в план', complete: 'Отметить выполненной', cancel: 'Отменить задачу' };
export function taskError(code: string): string {
  const messages: Record<string, string> = {
    connection_required: 'Нет SSH-соединения со StarAI. Войдите в star@100.83.22.120 и обновите журнал.',
    unavailable: 'Журнал временно недоступен. Обновите данные.', not_configured: 'На сервере не настроен доступ владельца к журналу.',
    forbidden: 'Нет доступа к задачам этого проекта.', unauthorized: 'Доступ к журналу не подтверждён.',
    conflict: 'Задача уже изменилась. Обновите журнал перед следующим действием.',
    delivery_unconfirmed: 'Подтверждение не получено. Сначала обновите журнал и проверьте результат.',
    not_found: 'Задача больше недоступна. Обновите журнал.', rate_limited: 'Слишком много запросов. Немного подождите и обновите журнал.',
    invalid_request: 'Проверьте текст. Не добавляйте ключи, пароли, ссылки и личные данные.',
    stale_session: 'Сеанс журнала завершён. Откройте раздел заново.', busy: 'Предыдущий запрос ещё не завершён.',
  };
  return messages[code] ?? 'Не удалось получить подтверждённые данные. Обновите журнал.';
}
