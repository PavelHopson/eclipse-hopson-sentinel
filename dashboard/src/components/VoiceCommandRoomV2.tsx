import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Ban,
  Check,
  CircleAlert,
  FileDiff,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Mic,
  MicOff,
  Radio,
  ShieldCheck,
  Speaker,
  Square,
  TerminalSquare,
  Volume2,
  Waves,
} from 'lucide-react';
import { executeOperatorPlan, getOperatorTransport, type OperatorReceipt } from '../lib/operatorClient';
import { isLocalSTTSupported, isTTSSupported, listenOnceLocal, speak, stopSpeaking } from '../lib/voice';
import { buildVoicePlan, VOICE_SKILL_ALLOWLIST, type VoicePlan, type VoiceSkillId } from '../lib/voiceCommandPolicy';
import { UltronCore, type UltronCoreState } from './UltronCore';
import { type UltronPresenceState } from '../lib/ultronPresence';
import { OperatorMascot } from './OperatorMascot';

type Stage = 'command' | 'plan' | 'approved' | 'executing' | 'receipt' | 'error';

const FLOW_STAGES = ['Команда', 'План', 'Подтверждение', 'Receipt'];

interface VoiceCommandRoomProps {
  motionEnabled: boolean;
  motionLocked: boolean;
  onMotionChange: () => void;
  onPresenceChange: (state: UltronPresenceState) => void;
  onVoiceQuestion: (text: string) => void;
}

type ListeningMode = 'question' | 'command';

export function VoiceCommandRoom({ motionEnabled, motionLocked, onMotionChange, onPresenceChange, onVoiceQuestion }: VoiceCommandRoomProps) {
  const [skillId, setSkillId] = useState<VoiceSkillId>('workspace.status');
  const [command, setCommand] = useState('Покажи безопасный статус рабочего места');
  const [plan, setPlan] = useState<VoicePlan | null>(null);
  const [stage, setStage] = useState<Stage>('command');
  const [killSwitch, setKillSwitch] = useState(true);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<OperatorReceipt | null>(null);
  const [error, setError] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [voiceConfidence, setVoiceConfidence] = useState<number | null>(null);
  const [listeningMode, setListeningMode] = useState<ListeningMode | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const transport = getOperatorTransport();
  const localVoiceAvailable = isLocalSTTSupported();
  const selectedSkill = useMemo(() => VOICE_SKILL_ALLOWLIST.find((skill) => skill.id === skillId)!, [skillId]);
  const listening = listeningMode !== null;

  useEffect(() => () => {
    stopSpeaking();
    onPresenceChange('idle');
  }, [onPresenceChange]);

  const clearRun = () => {
    stopSpeaking();
    setPlan(null);
    setReceipt(null);
    setError('');
    setVoiceError('');
    setApprovedAt(null);
    setSpeaking(false);
    setKillSwitch(true);
    setStage('command');
  };

  const createPlan = () => {
    const next = buildVoicePlan(skillId, command);
    if (!next) return;
    setPlan(next);
    setReceipt(null);
    setError('');
    setApprovedAt(null);
    setKillSwitch(true);
    setStage('plan');
  };

  const approve = () => {
    setApprovedAt(new Date().toISOString());
    setKillSwitch(true);
    setStage('approved');
  };

  const execute = async () => {
    if (!plan || !approvedAt || killSwitch || stage !== 'approved') return;
    setError('');
    setStage('executing');
    try {
      const nextReceipt = await executeOperatorPlan(plan, approvedAt);
      setReceipt(nextReceipt);
      setKillSwitch(true);
      setStage('receipt');
    } catch (executionError) {
      setError(executionError instanceof Error ? executionError.message : 'Safe operator failed');
      setKillSwitch(true);
      setStage('error');
    }
  };

  const listenOnce = async (mode: ListeningMode) => {
    if (!localVoiceAvailable || listening || stage === 'executing') return;
    stopSpeaking();
    setSpeaking(false);
    setVoiceError('');
    setVoiceConfidence(null);
    setListeningMode(mode);
    const result = await listenOnceLocal();
    setListeningMode(null);
    if (!result.ok) {
      setVoiceError(result.error.message);
      return;
    }

    if (mode === 'question') {
      onPresenceChange('thinking');
      onVoiceQuestion(result.text);
      return;
    }

    clearRun();
    setCommand(result.text);
    setVoiceConfidence(result.confidence);
  };

  const speakSummary = async () => {
    if (!receipt || speaking || !isTTSSupported()) return;
    setSpeaking(true);
    try {
      await speak(receipt.speech);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Не удалось озвучить ответ.');
    } finally {
      setSpeaking(false);
    }
  };

  const coreState: UltronCoreState = listening
    ? 'listening'
    : speaking
      ? 'speaking'
      : voiceError
        ? 'blocked'
      : stage === 'executing'
        ? 'executing'
        : stage === 'error'
          ? 'blocked'
          : stage === 'receipt'
            ? 'success'
            : stage === 'plan'
              ? 'planning'
              : stage === 'approved'
                ? 'approval'
              : 'idle';

  useEffect(() => {
    const presenceState: UltronPresenceState = coreState === 'listening'
      ? 'listening'
      : coreState === 'speaking'
        ? 'speaking'
        : coreState === 'planning' || coreState === 'approval' || coreState === 'executing'
          ? 'thinking'
          : coreState === 'success'
            ? 'success'
            : coreState === 'blocked'
              ? 'error'
              : 'idle';
    onPresenceChange(presenceState);
  }, [coreState, onPresenceChange]);

  const currentStep = stage === 'command' ? 0
    : stage === 'plan' ? 1
      : stage === 'approved' || stage === 'executing' || stage === 'error' ? 2
        : 3;

  return (
    <section className="ultron-room" data-motion={motionEnabled ? 'on' : 'off'} data-stage={coreState} aria-labelledby="ultron-command-title">
      <header className="ultron-room__header">
        <div>
          <p className="ultron-room__eyebrow"><Radio size={13} /> Eclipse Forge · Ultron Core</p>
          <h1 id="ultron-command-title">Командный центр</h1>
          <p>Одна команда. Видимый план. Ручное разрешение. Проверяемый результат.</p>
        </div>
        <div className="ultron-room__controls">
          <button className="motion-switch" type="button" aria-pressed={motionEnabled} disabled={motionLocked} onClick={onMotionChange}>
            <Waves size={15} />
            <span><strong>Motion {motionEnabled ? 'ON' : 'OFF'}</strong><small>{motionLocked ? 'Отключено в Windows' : 'Анимация ядра'}</small></span>
          </button>
          <button
            className={`kill-switch ${killSwitch ? 'is-on' : ''}`}
            type="button"
            aria-pressed={killSwitch}
            disabled={stage !== 'approved'}
            onClick={() => setKillSwitch((value) => !value)}
          >
            <Ban size={16} />
            <span>
              <strong>{killSwitch ? 'STOP активен' : 'Разрешён один запуск'}</strong>
              <small>{stage === 'approved' ? 'Переключите вручную' : 'Выполнение заблокировано'}</small>
            </span>
          </button>
        </div>
      </header>

      <div className="ultron-hud" aria-label="Состояние безопасного контура">
        <HudState icon={localVoiceAvailable ? <Mic size={15} /> : <MicOff size={15} />} label="Голос" value={localVoiceAvailable ? 'Whisper · offline' : 'Только Desktop'} tone={localVoiceAvailable ? 'live' : 'safe'} />
        <HudState icon={<Speaker size={15} />} label="Ответ" value={isTTSSupported() ? 'Ручной TTS' : 'Недоступен'} tone="safe" />
        <HudState icon={<LockKeyhole size={15} />} label="Транспорт" value={transport === 'electron-ipc' ? 'Trusted IPC' : 'Browser preview'} tone={transport === 'electron-ipc' ? 'live' : 'warn'} />
        <HudState icon={<ShieldCheck size={15} />} label="Полномочия" value="Read-only" tone="live" />
      </div>

      <div className="ultron-cockpit">
        <aside className="ultron-skills" aria-labelledby="ultron-skills-title">
          <div className="ultron-panel-heading">
            <div><span>Контур доступа</span><h2 id="ultron-skills-title">Навыки</h2></div>
            <strong>{VOICE_SKILL_ALLOWLIST.length}</strong>
          </div>
          {VOICE_SKILL_ALLOWLIST.map((skill) => (
            <button
              key={skill.id}
              type="button"
              className={skill.id === skillId ? 'is-selected' : ''}
              aria-pressed={skill.id === skillId}
              onClick={() => { setSkillId(skill.id); clearRun(); }}
            >
              <Check size={13} />
              <span><strong>{skill.label}</strong><small>{skill.description}</small></span>
            </button>
          ))}
          <div className="ultron-boundary">
            <strong><LockKeyhole size={12} /> Жёсткая граница</strong>
            <span>shell · write · network · install · deploy · secrets</span>
          </div>
        </aside>

        <main className="ultron-console" aria-busy={stage === 'executing' || listening}>
          <UltronCore state={coreState} motionEnabled={motionEnabled} />

          <div className="ultron-flow" aria-label="Этапы команды">
            {FLOW_STAGES.map((label, index) => (
              <span key={label} data-state={index < currentStep ? 'done' : index === currentStep ? 'current' : 'waiting'}>
                <i>{index < currentStep ? '✓' : index + 1}</i>{label}
              </span>
            ))}
          </div>

          <label className="ultron-command-field">
            <span>Операторская команда</span>
            <textarea
              value={command}
              maxLength={500}
              disabled={stage === 'executing' || listening}
              onChange={(event) => { setCommand(event.target.value); clearRun(); setVoiceError(''); }}
              placeholder="Например: покажи статус рабочего места"
            />
            <small>{command.length}/500 · текст остаётся на устройстве</small>
          </label>

          <div className="ultron-command-tools">
            <div className="ultron-command-tools__voice-actions">
              <button type="button" className="voice-trigger voice-trigger--conversation" disabled={!localVoiceAvailable || listening || stage === 'executing'} onClick={() => listenOnce('question')}>
                {listeningMode === 'question' ? <LoaderCircle size={15} /> : <MessageSquareText size={15} />}
                {listeningMode === 'question' ? 'Слушаю вопрос…' : 'Спросить Альтрона'}
              </button>
              <button type="button" className="voice-trigger voice-trigger--operator" disabled={!localVoiceAvailable || listening || stage === 'executing'} onClick={() => listenOnce('command')}>
                {listeningMode === 'command' ? <LoaderCircle size={15} /> : <Mic size={15} />}
                {listeningMode === 'command' ? 'Слушаю команду…' : 'Продиктовать команду'}
              </button>
            </div>
            <span><TerminalSquare size={13} /> {selectedSkill.id}</span>
          </div>

          {voiceConfidence !== null && <p className="voice-feedback is-success" role="status">Речь распознана · уверенность {Math.round(voiceConfidence * 100)}%</p>}
          {voiceError && <p className="voice-feedback is-error" role="alert">{voiceError}</p>}

          <footer className="ultron-actions">
            {stage === 'command' && <button type="button" className="primary-action" disabled={!command.trim() || listening} onClick={createPlan}>Собрать план и diff</button>}
            {stage === 'plan' && <button type="button" className="primary-action" onClick={approve}>Подтвердить read-only план</button>}
            {stage === 'approved' && <button type="button" className="primary-action" disabled={killSwitch} onClick={execute}>{killSwitch ? 'Снимите STOP для запуска' : transport === 'electron-ipc' ? 'Выполнить локально' : 'Запустить preview'}</button>}
            {stage === 'executing' && <button type="button" className="primary-action" disabled>Выполняется…</button>}
            {stage === 'error' && <button type="button" className="primary-action" onClick={() => setStage('plan')}>Вернуться к плану</button>}
            {stage === 'receipt' && <button type="button" className="primary-action" onClick={clearRun}>Новая команда</button>}
            <p>{killSwitch ? 'STOP блокирует execute.' : 'Разрешение сгорит после одного receipt.'}</p>
          </footer>
        </main>

        <aside className="ultron-inspector" aria-label="План, изменения и результат">
          <div className="ultron-panel-heading">
            <div><span>Decision trace</span><h2>Контроль</h2></div>
            <strong>{plan ? 'LIVE' : 'IDLE'}</strong>
          </div>

          <OperatorMascot stage={stage} plan={plan} receipt={receipt} approvedAt={approvedAt}
            killSwitch={killSwitch} transport={transport} motionEnabled={motionEnabled} />

          {!plan && !receipt && !error && (
            <div className="ultron-empty-state">
              <FileDiff size={22} />
              <strong>Diff появится до запуска</strong>
              <span>Альтрон не выполняет скрытых действий.</span>
            </div>
          )}

          {plan && (
            <div className="ultron-plan">
              <section>
                <p>План</p>
                <ol>{plan.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              </section>
              <section>
                <p><FileDiff size={13} /> Diff до запуска</p>
                <ul>{plan.diff.map((line) => <li key={line}>{line}</li>)}</ul>
              </section>
            </div>
          )}

          {stage === 'executing' && (
            <section className="ultron-execution" role="status" aria-live="polite">
              <LoaderCircle size={17} />
              <div><strong>Один handler выполняется</strong><span>STOP включится после receipt.</span></div>
            </section>
          )}

          {stage === 'error' && (
            <section className="ultron-execution is-error" role="alert">
              <CircleAlert size={17} />
              <div><strong>Выполнение заблокировано</strong><span>{error}</span></div>
            </section>
          )}

          {receipt && (
            <section className="ultron-receipt" aria-live="polite">
              <div className="ultron-receipt__heading">
                <div><p>Receipt · {receipt.transport}</p><strong>{receipt.summary}</strong></div>
                <span>{receipt.receiptId.slice(0, 8)}</span>
              </div>
              <pre>{receipt.lines.join('\n')}</pre>
              <small>{receipt.boundaries.join(' · ')}</small>
              <div className="ultron-receipt__actions">
                <button type="button" disabled={!isTTSSupported() || speaking} onClick={speakSummary}><Volume2 size={14} />{speaking ? 'Озвучиваю…' : 'Озвучить итог'}</button>
                <button type="button" disabled={!speaking} onClick={() => { stopSpeaking(); setSpeaking(false); }}><Square size={12} />Стоп</button>
              </div>
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}

function HudState({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'safe' | 'warn' | 'live' }) {
  return <div className="ultron-hud-state" data-tone={tone}>{icon}<span><small>{label}</small><strong>{value}</strong></span></div>;
}
