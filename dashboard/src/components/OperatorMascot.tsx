import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Pause, Play } from 'lucide-react';
import { operatorMascotExpiresAt, projectOperatorMascot, type MascotView, type OperatorMascotInput } from '../lib/operatorMascot';
import './operator-mascot.css';

// Versioned local A-40 assets only; no runtime request to Landing or a provider.
const images = import.meta.glob<string>('../assets/mascot-ultron/*.svg', { eager: true, query: '?url', import: 'default' });
const assetFor = (state: string) => images[`../assets/mascot-ultron/${state}.svg`];

export function MascotFigure({ view, motionEnabled = true }: { view: MascotView; motionEnabled?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  const primary = assetFor(view.state);
  const fallback = assetFor('unknown');
  const image = primary && !failed.includes(primary) ? primary : fallback && !failed.includes(fallback) ? fallback : null;
  return <section className="operator-mascot" data-state={view.state} data-source={view.source}
    data-motion={motionEnabled && !paused && visible && !hidden ? 'on' : 'off'} aria-label="Маскот оператора">
    <div className="operator-mascot__body">
      <div className="operator-mascot__slot" aria-hidden="true">
        {!hidden && <div key={view.state} className="operator-mascot__figure">
          {image ? <img src={image} width="96" height="96" alt="" draggable="false"
            onError={() => setFailed(previous => previous.includes(image) ? previous : [...previous, image])} />
            : null}
        </div>}
        {hidden && <span>Скрыт</span>}
      </div>
      <div className="operator-mascot__copy">
        <small>{view.source === 'demo' ? 'Симуляция · не runtime' : 'Оператор · только отображение'}</small>
        <strong>{view.text}</strong><p>{view.detail}</p>
        {!image && !hidden && <small>Графика недоступна · текст сохранён</small>}
      </div>
    </div>
    <div className="operator-mascot__controls">
      <button type="button" onClick={() => setHidden(value => !value)} aria-pressed={hidden}>
        {hidden ? <Eye size={14} /> : <EyeOff size={14} />}{hidden ? 'Показать маскота' : 'Скрыть маскота'}
      </button>
      <button type="button" onClick={() => setPaused(value => !value)} aria-pressed={paused}>
        {paused ? <Play size={14} /> : <Pause size={14} />}{paused ? 'Включить реакции' : 'Пауза реакций'}
      </button>
    </div>
  </section>;
}

export function OperatorMascot(props: OperatorMascotInput & { motionEnabled: boolean }) {
  const { stage, plan, receipt, approvedAt, killSwitch, transport, motionEnabled } = props;
  const input = useMemo(() => ({ stage, plan, receipt, approvedAt, killSwitch, transport }),
    [stage, plan, receipt, approvedAt, killSwitch, transport]);
  const [sample, setSample] = useState<{ input: OperatorMascotInput; observedAt: number; now: number } | null>(null);
  useEffect(() => {
    // Snapshot acquisition and expiry only: no polling, heartbeat or frame loop.
    const observedAt = Date.now();
    const acquire = window.setTimeout(() => setSample({ input, observedAt, now: observedAt }), 0);
    const refreshTime = () => setSample({ input, observedAt, now: Date.now() });
    const expire = window.setTimeout(refreshTime, Math.max(0, operatorMascotExpiresAt(input, observedAt) - observedAt));
    document.addEventListener('visibilitychange', refreshTime);
    return () => { clearTimeout(acquire); clearTimeout(expire); document.removeEventListener('visibilitychange', refreshTime); };
  }, [input]);
  const view = sample?.input === input
    ? projectOperatorMascot(input, sample.observedAt, sample.now)
    : projectOperatorMascot(null, 0, 0);
  return <MascotFigure view={view} motionEnabled={motionEnabled} />;
}
