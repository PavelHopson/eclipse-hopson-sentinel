import { useMemo, useState } from 'react';
import { Ban, Check, FileDiff, LockKeyhole, MicOff, ShieldCheck, Speaker, TerminalSquare } from 'lucide-react';
import { buildVoicePlan, executeReadOnlyPlan, VOICE_SKILL_ALLOWLIST, type VoicePlan, type VoiceSkillId } from '../lib/voiceCommandPolicy';

type Stage = 'command' | 'plan' | 'approved' | 'receipt';

export function VoiceCommandRoom() {
  const [skillId, setSkillId] = useState<VoiceSkillId>('workspace.status');
  const [command, setCommand] = useState('Покажи безопасный статус рабочего места');
  const [plan, setPlan] = useState<VoicePlan | null>(null);
  const [stage, setStage] = useState<Stage>('command');
  const [killSwitch, setKillSwitch] = useState(true);
  const [receipt, setReceipt] = useState<string[]>([]);
  const selectedSkill = useMemo(() => VOICE_SKILL_ALLOWLIST.find((skill) => skill.id === skillId)!, [skillId]);

  const reset = () => {
    setPlan(null);
    setReceipt([]);
    setStage('command');
  };

  const createPlan = () => {
    const next = buildVoicePlan(skillId, command);
    if (!next) return;
    setPlan(next);
    setReceipt([]);
    setStage('plan');
  };

  const execute = () => {
    if (!plan || killSwitch || stage !== 'approved') return;
    setReceipt(executeReadOnlyPlan(plan));
    setStage('receipt');
    setKillSwitch(true);
  };

  return (
    <section className="voice-room" aria-labelledby="voice-command-title">
      <header className="voice-room__header">
        <div>
          <p className="voice-room__eyebrow">Sentinel local operator · safe slice</p>
          <h1 id="voice-command-title">Voice Command Room</h1>
          <p>Сначала план и diff. Выполнение — только после approval и только для read-only навыка.</p>
        </div>
        <button className={`kill-switch ${killSwitch ? 'is-on' : ''}`} type="button" aria-pressed={killSwitch} onClick={() => setKillSwitch((value) => !value)}>
          <Ban size={16} />
          <span><strong>{killSwitch ? 'STOP включён' : 'Read-only разблокирован'}</strong><small>{killSwitch ? 'Выполнение запрещено' : 'До одного receipt'}</small></span>
        </button>
      </header>

      <div className="voice-hud" aria-label="Состояние voice-контура">
        <HudState icon={<MicOff size={15} />} label="Микрофон" value="Не запрошен" tone="safe" />
        <HudState icon={<Speaker size={15} />} label="Динамик" value="Без звука" tone="safe" />
        <HudState icon={<LockKeyhole size={15} />} label="STT / TTS" value="Не аттестованы" tone="warn" />
        <HudState icon={<ShieldCheck size={15} />} label="Режим" value="Read-only" tone="live" />
      </div>

      <div className="voice-room__grid">
        <aside className="skill-panel" aria-labelledby="skill-allowlist-title">
          <div className="panel-heading"><div><span>Allowlist</span><h2 id="skill-allowlist-title">Разрешённые навыки</h2></div><strong>{VOICE_SKILL_ALLOWLIST.length}</strong></div>
          {VOICE_SKILL_ALLOWLIST.map((skill) => (
            <button key={skill.id} type="button" className={skill.id === skillId ? 'is-selected' : ''} aria-pressed={skill.id === skillId} onClick={() => { setSkillId(skill.id); reset(); }}>
              <Check size={13} /><span><strong>{skill.label}</strong><small>{skill.description}</small></span>
            </button>
          ))}
          <div className="blocked-skills"><strong>Заблокировано</strong><span>shell · write files · install · deploy · secrets</span></div>
        </aside>

        <main className="command-flow">
          <div className="flow-steps" aria-label="Этапы команды">
            {['Команда', 'План', 'Approval', 'Receipt'].map((label, index) => {
              const current = ['command', 'plan', 'approved', 'receipt'].indexOf(stage);
              return <span key={label} data-state={index < current ? 'done' : index === current ? 'current' : 'waiting'}><i>{index < current ? '✓' : index + 1}</i>{label}</span>;
            })}
          </div>

          <label className="command-field"><span>Команда</span><textarea value={command} maxLength={500} onChange={(event) => { setCommand(event.target.value); reset(); }} /></label>
          <div className="command-meta"><span><TerminalSquare size={13} /> {selectedSkill.id}</span><span><LockKeyhole size={13} /> без side effects</span></div>

          {plan && (
            <div className="plan-diff">
              <section><p>План</p><ol>{plan.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
              <section><p><FileDiff size={13} /> Diff до запуска</p><ul>{plan.diff.map((line) => <li key={line}>{line}</li>)}</ul></section>
            </div>
          )}

          {receipt.length > 0 && <section className="receipt" aria-live="polite"><p>Receipt · выполнено локально</p><pre>{receipt.join('\n')}</pre><small>Команда не использовала microphone, network, shell или secrets.</small></section>}

          <footer className="command-actions">
            {stage === 'command' && <button type="button" className="primary-action" disabled={!command.trim()} onClick={createPlan}>Собрать план и diff</button>}
            {stage === 'plan' && <button type="button" className="primary-action" onClick={() => setStage('approved')}>Подтвердить read-only план</button>}
            {stage === 'approved' && <button type="button" className="primary-action" disabled={killSwitch} onClick={execute}>{killSwitch ? 'Сначала отключите STOP' : 'Выполнить read-only команду'}</button>}
            {stage === 'receipt' && <button type="button" className="primary-action" onClick={reset}>Новая команда</button>}
            <p>{killSwitch ? 'Kill switch блокирует execute.' : 'Разблокировка действует только до receipt.'}</p>
          </footer>
        </main>
      </div>
    </section>
  );
}

function HudState({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'safe' | 'warn' | 'live' }) {
  return <div className="hud-state" data-tone={tone}>{icon}<span><small>{label}</small><strong>{value}</strong></span></div>;
}
