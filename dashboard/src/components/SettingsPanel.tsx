import { useState } from 'react';
import { X, Cpu, Server } from 'lucide-react';
import { MODELS, getSelectedModel, setSelectedModel } from '../lib/ai';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onModelChange: (model: string) => void;
}

export function SettingsPanel({ open, onClose, onModelChange }: SettingsPanelProps) {
  const [model, setModel] = useState(getSelectedModel());
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  const handleSave = () => {
    setSelectedModel(model);
    onModelChange(model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-panel border border-border rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium text-text-1">Настройки</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-3 hover:bg-card hover:text-text-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Provider info */}
          <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl">
            <Server size={16} className="text-live" />
            <div>
              <p className="text-xs font-medium text-text-1">Ollama (локально)</p>
              <p className="text-[10px] text-text-3">http://localhost:11434 · Приватно · Бесплатно</p>
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="flex items-center gap-2 text-xs text-text-3 mb-3">
              <Cpu size={12} /> Модель
            </label>
            <div className="space-y-1.5">
              {MODELS.map((m) => (
                <label key={m.id}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border cursor-pointer transition-all ${
                    model === m.id
                      ? 'border-accent/25 bg-accent/5 text-text-1'
                      : 'border-border text-text-3 hover:bg-card hover:text-text-2'
                  }`}>
                  <input type="radio" name="model" value={m.id} checked={model === m.id} onChange={() => setModel(m.id)} className="hidden" />
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${model === m.id ? 'border-accent' : 'border-text-3'}`}>
                    {model === m.id && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-[11px] text-text-3">{m.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Install hint */}
          <div className="px-4 py-3 bg-card border border-border rounded-xl">
            <p className="text-[11px] text-text-3 leading-relaxed">
              Установка моделей:<br/>
              <code className="text-accent text-[10px]">ollama pull qwen3:32b</code><br/>
              <code className="text-accent text-[10px]">ollama pull qwen3:8b</code>
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between">
          <p className={`text-xs transition-opacity ${saved ? 'text-live opacity-100' : 'opacity-0'}`}>✓ Сохранено</p>
          <button onClick={handleSave}
            className="px-5 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/15 transition-colors">
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
