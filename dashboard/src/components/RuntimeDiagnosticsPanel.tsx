import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle2, CircleDot, HardDrive, MemoryStick, RefreshCw, ShieldCheck, TriangleAlert, X, XCircle } from 'lucide-react';
import { collectDiagnostics, type DiagnosticState, type RuntimeDiagnostics } from '../lib/diagnostics';

interface RuntimeDiagnosticsPanelProps {
  open: boolean;
  onClose: () => void;
}

const STATE_LABEL: Record<DiagnosticState, string> = {
  ready: 'Готово',
  idle: 'Ожидает',
  active: 'Активно',
  warning: 'Внимание',
  blocked: 'Недоступно',
};

function StateIcon({ state }: { state: DiagnosticState }) {
  if (state === 'blocked') return <XCircle size={17} aria-hidden="true" />;
  if (state === 'warning') return <TriangleAlert size={17} aria-hidden="true" />;
  if (state === 'active') return <Activity size={17} aria-hidden="true" />;
  if (state === 'idle') return <CircleDot size={17} aria-hidden="true" />;
  return <CheckCircle2 size={17} aria-hidden="true" />;
}

export function RuntimeDiagnosticsPanel({ open, onClose }: RuntimeDiagnosticsPanelProps) {
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const requestRef = useRef(0);

  const run = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    const result = await collectDiagnostics();
    if (requestId !== requestRef.current) return;
    setLoading(false);
    if (result.ok) setDiagnostics(result.diagnostics);
    else setError(result.error.message);
  }, []);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    void collectDiagnostics().then((result) => {
      if (requestId !== requestRef.current) return;
      setLoading(false);
      if (result.ok) { setDiagnostics(result.diagnostics); setError(''); }
      else setError(result.error.message);
    });
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frameId = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      requestRef.current += 1;
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [onClose, open, run]);

  if (!open) return null;
  const summary = diagnostics?.overall === 'ready'
    ? { label: 'Контур готов', detail: 'Голос работает на быстрой модели, тяжёлая модель выгружена.' }
    : diagnostics?.overall === 'attention'
      ? { label: 'Нужно внимание', detail: 'Основной контур доступен, но одна из защит требует проверки.' }
      : diagnostics?.overall === 'blocked'
        ? { label: 'Есть блокировка', detail: 'Исправьте отмеченные пункты перед живым разговором.' }
        : { label: 'Проверяю локальный контур', detail: 'Модели и микрофон не запускаются автоматически.' };

  return (
    <div className="runtime-diagnostics-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="runtime-diagnostics" role="dialog" aria-modal="true" aria-labelledby="runtime-diagnostics-title" aria-busy={loading}>
        <header className="runtime-diagnostics__header">
          <div className="runtime-diagnostics__mark"><Activity size={20} aria-hidden="true" /></div>
          <div>
            <span>Local runtime · read-only</span>
            <h2 id="runtime-diagnostics-title">Диагностика Альтрона</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="Закрыть диагностику" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </header>

        <section className="runtime-diagnostics__summary" data-state={diagnostics?.overall || 'loading'} aria-live="polite">
          <ShieldCheck size={22} aria-hidden="true" />
          <div><strong>{summary.label}</strong><span>{summary.detail}</span></div>
          <button type="button" disabled={loading} onClick={() => void run()}>
            <RefreshCw size={14} aria-hidden="true" /> {loading ? 'Проверяю…' : 'Проверить ещё раз'}
          </button>
        </section>

        {error ? <div className="runtime-diagnostics__error" role="alert"><TriangleAlert size={17} aria-hidden="true" /><span>{error}</span></div> : null}

        <div className="runtime-diagnostics__checks">
          {loading && !diagnostics ? Array.from({ length: 6 }, (_, index) => <div className="runtime-diagnostics__skeleton" key={index} aria-hidden="true" />) : null}
          {diagnostics?.checks.map((check) => (
            <article key={check.id} data-state={check.state}>
              <StateIcon state={check.state} />
              <div><strong>{check.label}</strong><p>{check.detail}</p></div>
              <span>{STATE_LABEL[check.state]}</span>
            </article>
          ))}
        </div>

        {diagnostics ? (
          <div className="runtime-diagnostics__resources" aria-label="Ресурсы компьютера">
            <div><HardDrive size={15} aria-hidden="true" /><span>Диск E:</span><strong>{diagnostics.resources.diskFreeGiB ?? '—'} ГиБ свободно</strong></div>
            <div><MemoryStick size={15} aria-hidden="true" /><span>Оперативная память</span><strong>{diagnostics.resources.memoryFreeGiB} из {diagnostics.resources.memoryTotalGiB} ГиБ свободно</strong></div>
          </div>
        ) : null}

        <footer>
          Проверка читает только фиксированные пути Eclipse на диске E: и локальные порты 127.0.0.1. Она не включает микрофон, не загружает модели и не просматривает личные файлы.
        </footer>
      </div>
    </div>
  );
}
