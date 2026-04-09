import { useState, useEffect } from 'react';
import { Activity, Cpu, Zap, Clock, RefreshCw } from 'lucide-react';
import { checkProviderStatus } from '../lib/ai';

export function StatusPanel() {
  const [status, setStatus] = useState<{ provider: string; model: string; healthy: boolean; latency: number } | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    const s = await checkProviderStatus();
    setStatus(s);
    setChecking(false);
  };

  useEffect(() => { check(); }, []);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-[0.2em] text-text-3 font-medium">Система</h2>
        <button onClick={check} disabled={checking} className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-text-3 hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-30">
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Provider Status */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status?.healthy ? 'bg-live animate-pulse' : 'bg-red-400'}`} />
          <span className="text-xs text-text-2">{status?.provider || '—'}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-bg rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu size={10} className="text-text-3" />
              <span className="text-[10px] text-text-3 uppercase tracking-wider">Модель</span>
            </div>
            <p className="text-xs text-text-1 truncate">{status?.model?.split('/').pop()?.split(':')[0] || '—'}</p>
          </div>
          <div className="bg-bg rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={10} className="text-text-3" />
              <span className="text-[10px] text-text-3 uppercase tracking-wider">Latency</span>
            </div>
            <p className="text-xs text-text-1">{status?.latency ? `${status.latency}ms` : '—'}</p>
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="space-y-2">
        {[
          { icon: <Activity size={12} />, label: 'Статус', value: status?.healthy ? 'Online' : 'Offline', color: status?.healthy ? 'text-live' : 'text-red-400' },
          { icon: <Zap size={12} />, label: 'API', value: 'OpenRouter', color: 'text-accent' },
          { icon: <Cpu size={12} />, label: 'Стоимость', value: '$0.00 / free', color: 'text-text-2' },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2 text-text-3">
              {item.icon}
              <span className="text-xs">{item.label}</span>
            </div>
            <span className={`text-xs font-medium ${item.color}`}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
