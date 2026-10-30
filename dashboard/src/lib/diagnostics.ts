export type DiagnosticState = 'ready' | 'idle' | 'active' | 'warning' | 'blocked';

export interface DiagnosticCheck {
  id: string;
  label: string;
  state: DiagnosticState;
  detail: string;
}

export interface RuntimeDiagnostics {
  schemaVersion: 'eclipse.ultron.diagnostics.v1';
  overall: 'ready' | 'attention' | 'blocked';
  checkedAt: string;
  checks: DiagnosticCheck[];
  resources: {
    diskFreeGiB: number | null;
    memoryFreeGiB: number;
    memoryTotalGiB: number;
    labModelsLoaded: number;
    voiceActive: boolean;
    developerActive: boolean;
  };
}

type DiagnosticsResult =
  | { ok: true; diagnostics: RuntimeDiagnostics }
  | { ok: false; error: { code: string; message: string } };

type DiagnosticsWindow = Window & typeof globalThis & {
  ultronDiagnostics?: { collect(): Promise<unknown> };
};

const STATES = new Set<DiagnosticState>(['ready', 'idle', 'active', 'warning', 'blocked']);

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeNumber(value: unknown, fallback: number | null = null) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeDiagnostics(value: unknown): RuntimeDiagnostics | null {
  if (!record(value) || value.schemaVersion !== 'eclipse.ultron.diagnostics.v1'
    || !['ready', 'attention', 'blocked'].includes(String(value.overall))
    || typeof value.checkedAt !== 'string' || !Array.isArray(value.checks) || !record(value.resources)) return null;
  const checks = value.checks.slice(0, 12).flatMap((candidate) => {
    if (!record(candidate) || typeof candidate.id !== 'string' || typeof candidate.label !== 'string'
      || typeof candidate.detail !== 'string' || !STATES.has(candidate.state as DiagnosticState)) return [];
    return [{
      id: candidate.id.slice(0, 48),
      label: candidate.label.slice(0, 100),
      state: candidate.state as DiagnosticState,
      detail: candidate.detail.slice(0, 320),
    }];
  });
  if (checks.length === 0) return null;
  return {
    schemaVersion: 'eclipse.ultron.diagnostics.v1',
    overall: value.overall as RuntimeDiagnostics['overall'],
    checkedAt: value.checkedAt.slice(0, 40),
    checks,
    resources: {
      diskFreeGiB: safeNumber(value.resources.diskFreeGiB),
      memoryFreeGiB: safeNumber(value.resources.memoryFreeGiB, 0) || 0,
      memoryTotalGiB: safeNumber(value.resources.memoryTotalGiB, 0) || 0,
      labModelsLoaded: safeNumber(value.resources.labModelsLoaded, 0) || 0,
      voiceActive: value.resources.voiceActive === true,
      developerActive: value.resources.developerActive === true,
    },
  };
}

export async function collectDiagnostics(): Promise<DiagnosticsResult> {
  const bridge = (window as DiagnosticsWindow).ultronDiagnostics;
  if (!bridge?.collect) return { ok: false, error: {
    code: 'DIAGNOSTICS_DESKTOP_REQUIRED',
    message: 'Диагностика доступна в установленном Eclipse Ultron Desktop.',
  } };
  try {
    const result = await bridge.collect();
    if (!record(result) || result.ok !== true) {
      const error = record(result) && record(result.error) ? result.error : null;
      return { ok: false, error: {
        code: typeof error?.code === 'string' ? error.code.slice(0, 80) : 'DIAGNOSTICS_FAILED',
        message: typeof error?.message === 'string' ? error.message.slice(0, 320) : 'Не удалось собрать локальную диагностику.',
      } };
    }
    const diagnostics = normalizeDiagnostics(result.diagnostics);
    return diagnostics
      ? { ok: true, diagnostics }
      : { ok: false, error: { code: 'DIAGNOSTICS_INVALID', message: 'Диагностика вернула некорректный результат.' } };
  } catch {
    return { ok: false, error: { code: 'DIAGNOSTICS_FAILED', message: 'Локальная диагностика временно недоступна.' } };
  }
}
