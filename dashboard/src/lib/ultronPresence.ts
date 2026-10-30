export type UltronPresenceState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'error';

export interface ContactTurn {
  id: number;
  text: string;
  mode: 'draft' | 'voice';
}

export const ULTRON_PRESENCE_COPY: Record<UltronPresenceState, { label: string; detail: string }> = {
  idle: { label: 'Ожидаю команду', detail: 'Микрофон выключен' },
  listening: { label: 'Слушаю', detail: 'Локальное распознавание речи' },
  thinking: { label: 'Думаю', detail: 'Формирую ответ' },
  speaking: { label: 'Говорю', detail: 'Озвучиваю ответ' },
  success: { label: 'Готово', detail: 'Реплика завершена' },
  error: { label: 'Нужна проверка', detail: 'Не удалось завершить запрос' },
};
