import { useState, useEffect } from 'react';
import { Activity, Cpu, Zap, Clock, RefreshCw } from 'lucide-react';
import { checkProviderStatus, getSelectedModel, MODELS } from '../lib/ai';
import { Tooltip } from './Tooltip';

interface StatusPanelProps {
  showGuide: boolean;
}

export function StatusPanel({ showGuide }: StatusPanelProps) {
  const [status, setStatus] = useState<{ provider: string; model: string; healthy: boolean; latency: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    const s = await checkProviderStatus();
    setStatus(s);
    setChecking(false);
  };

  useEffect(() => { check(); }, []);

  const modelName = MODELS.find(m => m.id === getSelectedModel())?.name || getSelectedModel().split('/').pop()?.split(':')[0] || '—';

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] uppercase tracking-[0.2em] text-text-3 font-medium">Система</h2>
        <Tooltip text="Проверить связь с AI-провайдером" show={showGuide}>
          <button onClick={check} disabled={checking}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-3 hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-30">
            <RefreshCw size={11} className={checking ? 'animate-spin' : ''} />
          </button>
        </Tooltip>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status?.healthy ? 'bg-live animate-pulse' : status === null ? 'bg-text-3' : 'bg-red-400'}`} />
          <span className="text-[11px] text-text-2">{status?.provider || 'Проверка...'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-bg rounded-lg p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Cpu size={9} className="text-text-3" />
              <span className="text-[9px] text-text-3 uppercase tracking-wider">Модель</span>
            </div>
            <p className="text-[11px] text-text-1 truncate">{modelName}</p>
          </div>
          <div className="bg-bg rounded-lg p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Clock size={9} className="text-text-3" />
              <span className="text-[9px] text-text-3 uppercase tracking-wider">Latency</span>
            </div>
            <p className="text-[11px] text-text-1">{status?.latency ? `${status.latency}ms` : '—'}</p>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {[
          { icon: <Activity size={11} />, label: 'Статус', value: status?.healthy ? 'Online' : status === null ? '...' : 'Offline', color: status?.healthy ? 'text-live' : 'text-red-400' },
          { icon: <Zap size={11} />, label: 'API', value: 'OpenRouter', color: 'text-accent' },
          { icon: <Cpu size={11} />, label: 'Цена', value: '$0 / free', color: 'text-text-2' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
            <div className="flex items-center gap-2 text-text-3">{item.icon}<span className="text-[11px]">{item.label}</span></div>
            <span className={`text-[11px] font-medium ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
