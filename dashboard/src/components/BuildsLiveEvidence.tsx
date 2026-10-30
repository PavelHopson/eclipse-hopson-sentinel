import { useEffect, useRef, useState } from 'react';
import { readBuildsEvidence } from '../lib/buildsLiveEvidence';
import type { BuildsEvidence, CheckEvidence } from '../lib/buildsLiveEvidence';
const labels = { passed: 'Проверка пройдена', failed: 'Ошибка проверки', interrupted: 'Процесс прерван', unverified: 'Не подтверждено' };
function Check({ title, check }: { title: string; check: CheckEvidence }) {
  return <div className="builds-check" data-state={check.state}><h3>{title}</h3><strong>{labels[check.state]}</strong>
    <p>Exit: {check.exitCode ?? 'нет данных'} · {check.durationMs === null ? 'время неизвестно' : `${check.durationMs} мс`}</p>
    <small>{check.at ?? 'Нет связанного события'}</small></div>;
}
export function BuildsLiveEvidence() {
  const [evidence, setEvidence] = useState<BuildsEvidence | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'cancelled'>('loading');
  const [error, setError] = useState(''), [selected, setSelected] = useState(0), [reload, setReload] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    let active = true;
    const timeout = setTimeout(() => abort.abort('timeout'), 8000);
    readBuildsEvidence(abort.signal).then(value => { if (active && !abort.signal.aborted) { setEvidence(value); setSelected(value.attempts.length - 1); setStatus('ready'); } })
      .catch(cause => { if (active && abort.signal.reason !== 'user') {
        setStatus('error');
        const code = cause instanceof Error ? cause.message : '';
        setError(abort.signal.reason === 'timeout' ? 'READ_TIMEOUT' : ['EVIDENCE_MISSING', 'EVIDENCE_READ_FAILED', 'EVIDENCE_TOO_LARGE', 'EVIDENCE_INVALID', 'ATTEMPT_INVALID'].includes(code) ? code : 'EVIDENCE_READ_FAILED');
      } })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); abort.abort(); };
  }, [reload]);
  const retry = () => { setEvidence(null); setStatus('loading'); setError(''); setReload(n => n + 1); };
  const cancel = () => { controller.current?.abort('user'); setEvidence(null); setStatus('cancelled'); };
  const attempt = evidence?.attempts[selected];
  return <main className="builds-live">
    <header><div><p className="builds-eyebrow">Eclipse Forge / Ultron · IDEA-029</p><h1>Цикл проверки</h1>
      <p>Изменение — ещё не результат. Сначала доказательства.</p></div><span className="builds-mode">Только чтение · локальный пилот</span></header>
    <section className="builds-scope" aria-label="Границы проверки"><strong>Изолированный тестовый модуль, не установленный Альтрон</strong>
      <p>Реальные file apply и Node-проверки. Предложения написаны вручную. Модель, микрофон, STOP и approval приложения не задействованы.</p></section>
    <div className="builds-toolbar"><p role="status">{status === 'loading' ? 'Читаем локальный снимок…' : status === 'cancelled' ? 'Чтение отменено. Запуск не отменялся.' : status === 'error' ? 'Снимок недоступен' : 'Снимок загружен — это не текущий runtime'}</p>
      {status === 'loading' ? <button onClick={cancel}>Отменить чтение</button> : <button onClick={retry}>{status === 'error' || status === 'cancelled' ? 'Повторить чтение' : 'Обновить снимок'}</button>}</div>
    {status === 'error' && <div className="builds-error" role="alert">{error === 'EVIDENCE_MISSING' ? 'Доказательства ещё не созданы. Сначала выполните локальный тестовый цикл.' : error === 'READ_TIMEOUT' ? 'Чтение заняло больше 8 секунд. Можно повторить.' : 'Файл недоступен или не прошёл проверку структуры. Успех не подтверждён.'}<code>{error.slice(0, 100)}</code></div>}
    {status === 'ready' && evidence && <>
      <section className="builds-task"><h2>{evidence.title}</h2><dl><dt>Задача пилота</dt><dd>{evidence.taskId} · нет связи с продуктовой задачей</dd>
        <dt>Run</dt><dd><code>{evidence.runId}</code></dd><dt>Git baseline</dt><dd><code>{evidence.baselineCommit}</code> · дерево не обязано быть чистым</dd>
        <dt>Снимок</dt><dd>{evidence.generatedAt}{evidence.stale && <strong className="builds-stale"> · Устарел: старше 10 минут. Исторические результаты сохранены.</strong>}</dd></dl></section>
      {!evidence.attempts.length && <p className="builds-empty">Запусков пока нет. Изменение и результат не подтверждены.</p>}
      {attempt && <>
        <nav className="builds-attempts" aria-label="Попытки проверки">{evidence.attempts.map((a, i) => <button key={a.id} aria-pressed={selected === i} onClick={() => setSelected(i)}>
          Попытка {i + 1}<small>{a.fixesPrevious ? 'Исправление подтверждено' : labels[a.runtime.state]}</small></button>)}</nav>
        <p className="builds-revision">Текущая попытка: <code>{attempt.id}</code><br />SHA-256 файла: <code>{attempt.revision}</code></p>
        <ol className="builds-chain" aria-label="Цепочка доказательств">
          <li><span>01 / Задача</span><strong>Тестовый критерий</strong><p>status === ready</p><small>Источник: harness · {evidence.taskId}</small></li>
          <li><span>02 / Изменение</span><strong>{attempt.change === 'applied' ? 'Применено к fixture' : attempt.change === 'preview' ? 'Только preview' : 'Не подтверждено'}</strong><p>{attempt.change === 'applied' ? 'Receipt связан с proposal и SHA-256' : 'Нет подтверждённого apply receipt'}</p><small>Источник: Developer policy</small></li>
          <li data-state={attempt.runtime.state}><span>03 / Запуск</span><strong>{labels[attempt.runtime.state]}</strong><p>Реальное выполнение Node</p><small>Источник: exit + observation</small></li>
          <li><span>04 / Замечание</span><strong>{attempt.feedback ? 'Ожидалось ready' : 'Нет нового замечания'}</strong><p>{attempt.feedback ? 'Получено pending · EXPECTED_READY' : 'Отсутствие замечания не означает общий успех'}</p><small>Источник: runtime assertion</small></li>
          <li data-state={attempt.fixesPrevious ? 'passed' : 'unverified'}><span>05 / Исправление</span><strong>{attempt.fixesPrevious ? 'Подтверждено на fixture' : 'Не подтверждено'}</strong><p>{attempt.fixesPrevious ? 'Связаны прошлый hash, retry и успешный runtime' : 'Нужны связанный retry и успешная проверка'}</p><small>{attempt.retryOf ? `Retry: ${attempt.retryOf}` : 'Связанный retry отсутствует'}</small></li>
        </ol>
        <section className="builds-checks" aria-label="Проверки конкретной ревизии"><Check title="Синтаксис · node --check" check={attempt.syntax} /><Check title="Поведение · status === ready" check={attempt.runtime} /></section>
        <p className="builds-note">Синтаксическая проверка не является сборкой продукта. Зелёный exit не подтверждает публикацию, UI, голос или готовность установленного приложения.</p>
        <details className="builds-proof"><summary>Доказательства и diff выбранной попытки</summary><dl><dt>Request</dt><dd>{attempt.requestId ?? 'Нет данных'}</dd><dt>Receipt</dt><dd>{attempt.receiptId ?? 'Нет данных'}</dd><dt>Before SHA-256</dt><dd>{attempt.before ?? 'Нет данных'}</dd></dl><pre>{attempt.diff ?? 'Diff отсутствует'}</pre></details>
      </>}
    </>}
    <section className="builds-gaps"><h2>Что пока не подтверждено</h2><ul><li>Связь с реальной продуктовой задачей и постоянным журналом run / review.</li>
      <li>Полная сборка продукта, проверка установленного Ultron и публикация.</li><li>Подтверждённая отмена операции: в снимке нет такого события.</li></ul>
      <p>JSON проверяется на согласованность, но не имеет цифровой подписи. Это локальное свидетельство теста, не разрешение на действие.</p></section>
  </main>;
}
