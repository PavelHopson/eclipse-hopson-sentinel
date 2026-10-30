import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardList, History, Pause, Play, Plus, RefreshCw, X } from 'lucide-react';
import { TASK_ACTIONS, TASK_PROJECTS, TASK_STATES, taskError, type LedgerEvent, type LedgerTask, type TaskAction, type TaskProject } from '../lib/taskLedger';

const formatDate = (date: string) => new Date(date).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const allowedActions: Record<LedgerTask['state'], TaskAction[]> = { proposed: ['accept', 'cancel'], planned: ['pause', 'complete', 'cancel'], paused: ['resume', 'cancel'], completed: [], cancelled: [] };
const ActionIcons = { accept: Check, pause: Pause, resume: Play, complete: Check, cancel: X };

function ProjectLedger({ project }: { project: TaskProject }) {
  const [items, setItems] = useState<LedgerTask[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [pages, setPages] = useState([0]);
  const [selected, setSelected] = useState<LedgerTask | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [evidence, setEvidence] = useState('');
  const [completing, setCompleting] = useState(false);
  const session = useRef<string | null>(null);
  const busyRef = useRef(true);
  const active = useRef(true);
  const sequence = useRef(0);
  const completionDialog = useRef<HTMLDialogElement>(null);
  const detailPanel = useRef<HTMLElement>(null);
  const bridge = window.ultronTasks;
  const invalidate = useCallback(() => { sequence.current++; session.current = null; }, []);

  const refresh = useCallback(async (after = 0) => {
    const scope = session.current;
    if (!bridge || !scope || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setSelected(null); setEvents([]);
    const generation = ++sequence.current;
    try {
      const result = await bridge.request({ session: scope, projectId: project, kind: 'list', after });
      if (!active.current || generation !== sequence.current || scope !== session.current) return;
      if (!result.ok || !result.items || result.total === undefined) {
        setItems([]); setTotal(null); setNext(null); setCheckedAt(null); setError(taskError(result.ok ? 'unavailable' : result.error));
      } else {
        setItems(result.items); setTotal(result.total); setNext(result.nextCursor ?? null); setCheckedAt(new Date().toISOString());
      }
    } catch { if (active.current && generation === sequence.current) { setItems([]); setTotal(null); setCheckedAt(null); setError(taskError('unavailable')); } }
    finally { if (active.current && generation === sequence.current) { busyRef.current = false; setBusy(false); } }
  }, [bridge, project]);

  useEffect(() => {
    active.current = true; let disposed = false; let owned: string | null = null;
    if (!bridge) { busyRef.current = false; return () => { active.current = false; }; }
    void bridge.activate(project).then(result => {
      if (!result.ok) { if (!disposed) { setError(taskError(result.error)); setBusy(false); busyRef.current = false; } return; }
      owned = result.session;
      if (disposed) { void bridge.close(owned); return; }
      session.current = owned; busyRef.current = false; void refresh();
    }).catch(() => { if (!disposed) { setError(taskError('connection_required')); setBusy(false); busyRef.current = false; } });
    return () => { disposed = true; active.current = false; invalidate(); if (owned) void bridge.close(owned); };
  }, [bridge, project, refresh, invalidate]);

  useEffect(() => {
    if (completing) completionDialog.current?.showModal();
    else completionDialog.current?.close();
  }, [completing]);

  useEffect(() => {
    const panel = detailPanel.current;
    if (!selected || !panel) return;
    // Native focus scrolling also scrolls overflow-hidden shell ancestors.
    panel.focus({ preventScroll: true });
    if (window.matchMedia('(max-width:760px)').matches) {
      const scroller = panel.closest<HTMLElement>('.task-ledger');
      if (scroller) scroller.scrollTo({ top: scroller.scrollTop + panel.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12, behavior: 'instant' });
    }
  }, [selected]);

  const inspect = async (task: LedgerTask) => {
    if (!bridge || !session.current || busyRef.current) return;
    const scope = session.current; const generation = ++sequence.current;
    busyRef.current = true; setBusy(true); setSelected(null); setEvents([]); setError(''); setNotice('');
    try {
      const result = await bridge.request({ session: scope, projectId: project, kind: 'get', taskId: task.id });
      if (!active.current || sequence.current !== generation || session.current !== scope) return;
      if (!result.ok || !result.task) setError(taskError(result.ok ? 'unavailable' : result.error));
      else { setSelected(result.task); setEvents(result.events ?? []); setEvidence(''); }
    } catch { if (active.current) setError(taskError('unavailable')); }
    finally { if (active.current && sequence.current === generation) { busyRef.current = false; setBusy(false); } }
  };

  const mutate = async (action?: TaskAction) => {
    if (!bridge || !session.current || busyRef.current || (action && !selected)) return;
    const scope = session.current; const generation = ++sequence.current;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await bridge.request(action && selected
        ? { session: scope, projectId: project, kind: 'transition', taskId: selected.id, action, expectedRevision: selected.revision, ...(action === 'complete' ? { evidenceNote: evidence.trim() } : {}) }
        : { session: scope, projectId: project, kind: 'propose', title: title.trim(), detail: detail.trim() });
      if (!active.current || generation !== sequence.current || session.current !== scope) return;
      if (!result.ok) { if (result.error !== 'cancelled') setError(taskError(result.error)); return; }
      setCompleting(false);
      if (!action) { setForm(false); setTitle(''); setDetail(''); }
      setNotice(action === 'complete' ? 'Сохранено подтверждение владельца.' : 'Запись в журнале обновлена.');
      busyRef.current = false;
      await refresh(pages.at(-1) ?? 0);
    } catch { if (active.current && generation === sequence.current) setError(taskError('delivery_unconfirmed')); }
    finally { if (active.current && generation === sequence.current) { busyRef.current = false; setBusy(false); } }
  };

  if (!bridge) return <div className="task-ledger-state"><ClipboardList size={28} aria-hidden="true" /><h2>Журнал доступен в приложении Ultron</h2><p>Откройте настольное приложение для подключения к StarAI.</p></div>;
  return <>
    <div className="task-ledger-toolbar">
      <div><strong>{total === null ? 'Задачи' : `Задач в журнале: ${total}`}</strong><span>{busy ? 'Получаем данные…' : checkedAt ? `Снимок на ${formatDate(checkedAt)}` : 'Нет подтверждённых данных'}</span></div>
      <div className="task-ledger-actions"><button type="button" disabled={busy} aria-label="Обновить журнал" title="Обновить журнал" onClick={() => void refresh(pages.at(-1) ?? 0)}><RefreshCw size={18} aria-hidden="true" /></button><button type="button" disabled={busy || Boolean(error)} onClick={() => setForm(value => !value)}><Plus size={18} aria-hidden="true" />Предложить задачу</button></div>
    </div>
    {error && <div role="alert" className="task-ledger-error">{error}</div>}
    {notice && <p role="status" className="task-ledger-notice">{notice}</p>}
    {form && <form className="task-ledger-form" onSubmit={event => { event.preventDefault(); void mutate(); }}>
      <label>Название<input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} required disabled={busy} /></label>
      <label>Что нужно сделать<textarea value={detail} onChange={event => setDetail(event.target.value)} maxLength={800} rows={3} disabled={busy} /></label>
      <div className="task-ledger-actions"><button type="submit" disabled={busy || !title.trim() || Boolean(error)}>Предложить</button><button type="button" disabled={busy} onClick={() => setForm(false)}>Закрыть</button></div>
    </form>}
    <div className="task-ledger-content" aria-busy={busy}>
      <section className="task-ledger-list" aria-label="Задачи проекта">
        {!items.length && <div className="task-ledger-state"><ClipboardList size={28} aria-hidden="true" /><h2>{busy ? 'Загружаем журнал' : error ? 'Данные недоступны' : 'Пока нет задач'}</h2>{!busy && !error && <button type="button" onClick={() => setForm(true)}><Plus size={18} aria-hidden="true" />Предложить первую задачу</button>}</div>}
        <ul>{items.map(task => <li key={task.id}><button type="button" className="task-ledger-row" disabled={busy} aria-pressed={selected?.id === task.id} onClick={() => void inspect(task)}><span className="task-ledger-state-label" data-state={task.state}>{TASK_STATES[task.state]}</span><strong>{task.title}</strong><small>{formatDate(task.updatedAt)} · версия {task.revision}</small><ArrowRight size={18} aria-hidden="true" /></button></li>)}</ul>
        {(next !== null || pages.length > 1) && <nav className="task-ledger-pagination" aria-label="Страницы задач"><button type="button" disabled={busy || pages.length < 2} onClick={() => { const previous = pages.slice(0, -1); setPages(previous); void refresh(previous.at(-1) ?? 0); }}><ArrowLeft size={18} aria-hidden="true" />Назад</button><span>Страница {pages.length}</span><button type="button" disabled={busy || next === null} onClick={() => { if (next !== null) { setPages([...pages, next]); void refresh(next); } }}>Дальше<ArrowRight size={18} aria-hidden="true" /></button></nav>}
      </section>
      <section ref={detailPanel} tabIndex={-1} className="task-ledger-detail" aria-label="Выбранная задача">
        {!selected ? <div className="task-ledger-state"><History size={24} aria-hidden="true" /><h2>Выберите задачу</h2><p>Статус и история изменений</p></div> : <>
          <span className="task-ledger-state-label" data-state={selected.state}>{TASK_STATES[selected.state]}</span>
          <h2>{selected.title}</h2>{selected.detail && <p>{selected.detail}</p>}
          <p className="task-ledger-execution">Автоматическое выполнение: не подключено</p>
          {selected.completionEvidence && <div className="task-ledger-evidence"><strong>Подтверждено владельцем</strong><p>{selected.completionEvidence.note}</p><small>Проверка выполнения системой отсутствует</small></div>}
          <div className="task-ledger-actions">{allowedActions[selected.state].map(action => { const Icon = ActionIcons[action]; return <button key={action} type="button" disabled={busy || Boolean(error)} onClick={() => action === 'complete' ? setCompleting(true) : void mutate(action)}><Icon size={17} aria-hidden="true" />{TASK_ACTIONS[action]}</button>; })}</div>
          <h3><History size={17} aria-hidden="true" />История</h3><ol className="task-ledger-history">{events.map(event => <li key={event.revision}><strong>{({ propose: 'Предложена', accept: 'Принята в план', pause: 'План приостановлен', resume: 'Возвращена в план', complete: 'Завершена владельцем', cancel: 'Отменена' })[event.action]}</strong><span>{formatDate(event.at)} · {event.actor === 'owner-ledger' ? 'Владелец' : event.actor === 'pilot-tasks' ? 'StarAI Pilot' : 'Сервис проекта'}</span></li>)}</ol>
        </>}
      </section>
    </div>
    <dialog ref={completionDialog} className="task-ledger-dialog" aria-labelledby="task-completion-title" onCancel={() => setCompleting(false)} onClose={() => setCompleting(false)}>
      <form onSubmit={event => { event.preventDefault(); void mutate('complete'); }}><h2 id="task-completion-title">Подтвердить результат</h2><label>Что выполнено<textarea autoFocus value={evidence} onChange={event => setEvidence(event.target.value)} maxLength={400} required rows={4} disabled={busy} /></label>{error && <p role="alert">{error}</p>}<div className="task-ledger-actions"><button type="button" disabled={busy} onClick={() => setCompleting(false)}>Не менять</button><button type="submit" disabled={busy || !evidence.trim() || Boolean(error)}>Подтвердить выполнение</button></div></form>
    </dialog>
  </>;
}

export function TaskLedger() {
  const [project, setProject] = useState<TaskProject>('ultron');
  return <div className="task-ledger"><header className="task-ledger-heading"><div><span>AI HUB / ЖУРНАЛ</span><h1>Задачи проектов</h1></div><div className="task-ledger-project"><label htmlFor="task-ledger-project">Проект</label><select id="task-ledger-project" value={project} onChange={event => setProject(event.target.value as TaskProject)}>{Object.entries(TASK_PROJECTS).map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></div></header><ProjectLedger key={project} project={project} /></div>;
}
