import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Code2, Cpu, FileDiff, FolderGit2, LoaderCircle, ShieldCheck, Undo2 } from 'lucide-react';
import {
  applyDeveloperProposal,
  cancelDeveloperProposal,
  executeDeveloperRollback,
  previewDeveloperRollback,
  requestDeveloperProposal,
  selectDeveloperWorkspace,
  type DeveloperProposal,
  type DeveloperReceipt,
  type DeveloperWorkspace,
  type RollbackPreview,
} from '../lib/developerMode';
import type { UltronPresenceState } from '../lib/ultronPresence';

interface DeveloperModeProps { onPresenceChange: (state: UltronPresenceState) => void }
type BusyState = 'selecting' | 'proposing' | 'applying' | 'rollback-preview' | 'rolling-back' | null;

export function DeveloperMode({ onPresenceChange }: DeveloperModeProps) {
  const [workspace, setWorkspace] = useState<DeveloperWorkspace | null>(null);
  const [task, setTask] = useState('');
  const [proposal, setProposal] = useState<DeveloperProposal | null>(null);
  const [model, setModel] = useState('');
  const [receipt, setReceipt] = useState<DeveloperReceipt | null>(null);
  const [rollbackPreview, setRollbackPreview] = useState<RollbackPreview | null>(null);
  const [approved, setApproved] = useState(false);
  const [rollbackApproved, setRollbackApproved] = useState(false);
  const [busy, setBusy] = useState<BusyState>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  const fail = (message?: string) => {
    setError(message || 'Операция остановлена безопасно. Повторите попытку.');
    onPresenceChange('error');
  };

  const chooseWorkspace = async () => {
    if (busy) return;
    setBusy('selecting');
    setError('');
    const result = await selectDeveloperWorkspace();
    setBusy(null);
    if (!result.ok) {
      if (!result.canceled) fail(result.error?.message);
      return;
    }
    setWorkspace(result.workspace);
    setProposal(null);
    setReceipt(null);
    setRollbackPreview(null);
    setApproved(false);
    onPresenceChange('idle');
  };

  const createProposal = async () => {
    if (!workspace || busy || !task.trim()) return;
    setBusy('proposing');
    setError('');
    setProposal(null);
    setReceipt(null);
    setApproved(false);
    onPresenceChange('thinking');
    const result = await requestDeveloperProposal(task.trim());
    setBusy(null);
    if (!result.ok) {
      if (result.error?.code === 'DEVELOPER_CANCELLED') {
        setError('');
        onPresenceChange('idle');
        return;
      }
      fail(result.error?.message);
      return;
    }
    setProposal(result.proposal);
    setModel(result.model);
    onPresenceChange('success');
  };

  const cancelProposal = async () => {
    if (busy !== 'proposing' || cancelling) return;
    setCancelling(true);
    await cancelDeveloperProposal();
    setCancelling(false);
  };

  const apply = async () => {
    if (!proposal || !approved || busy) return;
    setBusy('applying');
    setError('');
    onPresenceChange('thinking');
    const result = await applyDeveloperProposal(proposal);
    setBusy(null);
    if (!result.ok) { setProposal(null); fail(result.error?.message); return; }
    setReceipt(result.receipt);
    setProposal(null);
    setApproved(false);
    onPresenceChange('success');
  };

  const prepareRollback = async () => {
    if (!receipt || busy) return;
    setBusy('rollback-preview');
    setError('');
    const result = await previewDeveloperRollback();
    setBusy(null);
    if (!result.ok) { fail(result.error?.message); return; }
    setRollbackPreview(result.preview);
    setRollbackApproved(false);
  };

  const rollback = async () => {
    if (!rollbackPreview || !rollbackApproved || busy) return;
    setBusy('rolling-back');
    setError('');
    onPresenceChange('thinking');
    const result = await executeDeveloperRollback(rollbackPreview);
    setBusy(null);
    if (!result.ok) { fail(result.error?.message); return; }
    setReceipt(result.receipt);
    setRollbackPreview(null);
    setRollbackApproved(false);
    onPresenceChange('success');
  };

  return (
    <section className="developer-mode" aria-labelledby="developer-mode-title">
      <header className="developer-mode__hero">
        <div>
          <p className="developer-mode__eyebrow"><Code2 size={14} aria-hidden="true" /> Eclipse Ultron · bounded coding</p>
          <h1 id="developer-mode-title">Developer Mode</h1>
          <p>Альтрон читает ограниченный контекст, показывает diff и ничего не меняет без вашего подтверждения.</p>
        </div>
        <div className="developer-mode__guard" aria-label="Ограничения режима">
          <ShieldCheck size={20} aria-hidden="true" />
          <span><strong>Human approval</strong><small>без shell · без сети · без автозаписи</small></span>
        </div>
      </header>

      <div className="developer-mode__steps" aria-label="Этапы Developer Mode">
        {['Репозиторий', 'Read-only анализ', 'Diff', 'Подтверждение', 'Receipt'].map((label, index) => (
          <span key={label} data-active={(index === 0 && !workspace) || (index === 1 && workspace && !proposal && !receipt)
            || (index === 2 && proposal) || (index === 4 && receipt) ? 'true' : 'false'}><b>{index + 1}</b>{label}</span>
        ))}
      </div>

      <div className="developer-mode__grid">
        <div className="developer-mode__compose">
          <button className="developer-mode__workspace" type="button" onClick={() => void chooseWorkspace()} disabled={Boolean(busy)}>
            {busy === 'selecting' ? <LoaderCircle className="spin" size={19} aria-hidden="true" /> : <FolderGit2 size={19} aria-hidden="true" />}
            <span>{workspace ? <><strong>{workspace.name}</strong><small>{workspace.files} безопасных текстовых файлов{workspace.truncated ? ' · список ограничен' : ''}</small></> : <><strong>Выбрать Git-репозиторий</strong><small>Только через системное окно; путь не вводится вручную</small></>}</span>
          </button>

          <label htmlFor="developer-task">Что нужно изменить</label>
          <textarea id="developer-task" maxLength={2000} value={task} onChange={(event) => setTask(event.target.value)}
            placeholder="Например: добавь обработку пустого состояния и focused test, сохрани текущую архитектуру."
            disabled={Boolean(busy)} />
          <div className="developer-mode__compose-footer">
            <span>{task.length}/2000</span>
            <button type="button" onClick={() => void (busy === 'proposing' ? cancelProposal() : createProposal())}
              disabled={busy === 'proposing' ? cancelling : (!workspace || !task.trim() || Boolean(busy))}>
              {busy === 'proposing' ? (cancelling ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />) : <FileDiff size={16} aria-hidden="true" />}
              {busy === 'proposing' ? (cancelling ? 'Отменяю…' : 'Отменить proposal') : 'Сформировать безопасный diff'}
            </button>
          </div>

          <div className="developer-mode__resource-note">
            <Cpu size={17} aria-hidden="true" />
            <span><strong>Media-safe профиль</strong><small>27B запускается только здесь на CPU и выгружается сразу после proposal. Живой голос на это время блокируется.</small></span>
          </div>
          {error && <div className="developer-mode__error" role="alert"><AlertTriangle size={17} aria-hidden="true" />{error}</div>}
        </div>

        <div className="developer-mode__review" aria-live="polite">
          {!proposal && !receipt && busy !== 'proposing' && (
            <div className="developer-mode__empty"><FileDiff size={28} aria-hidden="true" /><strong>Diff появится здесь</strong><p>Сначала выберите репозиторий и сформулируйте одну конкретную задачу.</p></div>
          )}
          {busy === 'proposing' && (
            <div className="developer-mode__empty" role="status"><LoaderCircle className="spin" size={28} aria-hidden="true" /><strong>Локальная модель анализирует контекст</strong><p>27B работает на CPU, поэтому первый proposal может занять несколько минут. Файлы пока не меняются.</p></div>
          )}
          {proposal && (
            <div className="developer-mode__proposal">
              <div className="developer-mode__proposal-head"><span><FileDiff size={17} aria-hidden="true" /><strong>Preview · {proposal.changes.length} файл(а)</strong></span><small>{model}</small></div>
              <p>{proposal.summary}</p>
              {(proposal.risks.length > 0 || proposal.assumptions.length > 0) && <div className="developer-mode__claims">
                {proposal.assumptions.map((item) => <span key={`a-${item}`}>Допущение: {item}</span>)}
                {proposal.risks.map((item) => <span key={`r-${item}`} data-risk="true">Риск: {item}</span>)}
              </div>}
              <div className="developer-mode__diffs">
                {proposal.changes.map((change) => <details key={change.path} open={proposal.changes.length === 1}>
                  <summary>{change.path}</summary><pre>{change.diff}</pre>
                </details>)}
              </div>
              <label className="developer-mode__approval"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /><span><strong>Я проверил diff и разрешаю применить именно его</strong><small>Подтверждение одноразовое и истекает через 10 минут.</small></span></label>
              <button className="developer-mode__apply" type="button" disabled={!approved || Boolean(busy)} onClick={() => void apply()}>
                {busy === 'applying' ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
                {busy === 'applying' ? 'Применяю…' : 'Применить подтверждённый diff'}
              </button>
            </div>
          )}
          {receipt && (
            <div className="developer-mode__receipt">
              <CheckCircle2 size={30} aria-hidden="true" />
              <h2>{receipt.status === 'rolled-back' ? 'Изменения отменены' : 'Изменения применены'}</h2>
              <p>Receipt <code>{receipt.receiptId}</code> · {receipt.files.length} файл(а). Скрытых действий не выполнялось.</p>
              {receipt.status === 'applied' && !rollbackPreview && <button type="button" onClick={() => void prepareRollback()} disabled={Boolean(busy)}><Undo2 size={16} aria-hidden="true" />Подготовить откат</button>}
              {rollbackPreview && <div className="developer-mode__rollback">
                <p>Будут восстановлены {rollbackPreview.files.length} файл(а). Откат остановится, если файлы изменились после применения.</p>
                <label><input type="checkbox" checked={rollbackApproved} onChange={(event) => setRollbackApproved(event.target.checked)} />Я проверил preview отката</label>
                <button type="button" onClick={() => void rollback()} disabled={!rollbackApproved || Boolean(busy)}><Undo2 size={16} aria-hidden="true" />Выполнить откат</button>
              </div>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
