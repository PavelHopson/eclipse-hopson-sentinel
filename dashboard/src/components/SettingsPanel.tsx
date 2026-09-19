import { useEffect, useState } from 'react';
import { Cpu, Gauge, Mic, Play, Server, ShieldCheck, Volume2, X } from 'lucide-react';
import {
  getAvailableVoices,
  loadVoicePreferences,
  saveVoicePreferences,
  speak,
  stopSpeaking,
  type VoicePreferences,
} from '../lib/voice';
import { getLabModelId, getSelectedModel, LAB_MODELS, setSelectedModel as persistSelectedModel } from '../lib/ai';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (modelId: string) => void;
}

export function SettingsPanel({ open, onClose, onModelChange }: SettingsPanelProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voicePreferences, setVoicePreferences] = useState<VoicePreferences>(() => loadVoicePreferences());
  const [selectedModel, setSelectedModel] = useState(() => getLabModelId(getSelectedModel()));
  const [previewing, setPreviewing] = useState(false);

  const closePanel = () => {
    stopSpeaking();
    setPreviewing(false);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stopSpeaking();
        setPreviewing(false);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void getAvailableVoices().then((available) => {
      if (!active) return;
      const russian = available.filter((voice) => voice.lang.toLocaleLowerCase().startsWith('ru'));
      setVoices((russian.length ? russian : available).sort((a, b) => a.name.localeCompare(b.name, 'ru')));
    });
    return () => { active = false; };
  }, [open]);

  const updateVoicePreferences = (next: VoicePreferences) => {
    const saved = saveVoicePreferences(next);
    setVoicePreferences(saved);
  };

  const updateModel = (modelId: string) => {
    persistSelectedModel(modelId);
    setSelectedModel(modelId);
    onModelChange?.(modelId);
  };

  const selectedModelDefinition = LAB_MODELS.find((model) => model.id === selectedModel) || LAB_MODELS[0]!;

  const previewVoice = async () => {
    if (previewing) {
      stopSpeaking();
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    try {
      await speak('Я на связи. Голосовой контур Альтрона готов к работе.');
    } finally {
      setPreviewing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="settings-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closePanel}>
      <div
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-dialog bg-panel border border-border rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="settings-title">
            <h2 id="settings-title" className="text-sm font-medium text-text-1">Настройки Eclipse Ultron</h2>
            <p>Локальный голосовой контур</p>
          </div>
          <button type="button" aria-label="Закрыть настройки" onClick={closePanel} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-3 hover:bg-card hover:text-text-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl">
            <Server size={16} className="text-live" />
            <div>
              <p className="text-xs font-medium text-text-1">Ollama · основной локальный контур</p>
              <p className="text-[10px] text-text-3">127.0.0.1:11434 · данные не покидают устройство</p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl">
            <Cpu size={16} className="text-accent" />
            <div>
              <p className="text-xs font-medium text-text-1">Qwen 3 8B · голосовой профиль</p>
              <p className="text-[10px] text-text-3">Закреплён для быстрой живой беседы без долгого старта 27B</p>
            </div>
          </div>
          <section className="space-y-2 px-4 py-4 bg-card border border-border rounded-xl" aria-labelledby="chat-model-title">
            <div>
              <p id="chat-model-title" className="text-xs font-medium text-text-1">Модель диалога</p>
              <p className="mt-1 text-[10px] text-text-3">Выбор действует только для локального текстового чата. Живой голос остаётся на Qwen 3 8B.</p>
            </div>
            <select
              id="ultron-chat-model"
              aria-label="Модель локального диалога"
              value={selectedModel}
              onChange={(event) => updateModel(event.target.value)}
              className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-xs text-text-1 outline-none focus:border-accent"
            >
              {LAB_MODELS.map((model) => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
            <p className="text-[10px] leading-relaxed text-text-3">{selectedModelDefinition.desc}</p>
            {selectedModelDefinition.risk === 'experimental' && (
              <p className="text-[10px] leading-relaxed text-amber-300">Экспериментальный Lab-профиль: проверьте модель и не передавайте ей секреты или команды.</p>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3">
            <div className="px-4 py-3 bg-card border border-border rounded-xl">
              <p className="flex items-center gap-2 text-xs font-medium text-text-1"><Mic size={14} /> Whisper offline</p>
              <p className="mt-1 text-[10px] text-text-3">Одна фраза или явный живой режим</p>
            </div>
            <div className="px-4 py-3 bg-card border border-border rounded-xl">
              <p className="flex items-center gap-2 text-xs font-medium text-text-1"><Volume2 size={14} /> Piper Denis</p>
              <p className="mt-1 text-[10px] text-text-3">Быстрый русский нейроголос · offline</p>
            </div>
          </div>
          <section className="space-y-3 px-4 py-4 bg-card border border-border rounded-xl" aria-labelledby="voice-profile-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p id="voice-profile-title" className="text-xs font-medium text-text-1">Голос Альтрона</p>
                <p className="mt-1 text-[10px] text-text-3">Piper — основной. Windows Voice — резервный fallback</p>
              </div>
              <button
                type="button"
                onClick={previewVoice}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/10 px-3 py-2 text-[10px] font-medium text-accent hover:bg-accent/15 disabled:opacity-50"
              >
                <Play size={12} aria-hidden="true" /> {previewing ? 'Остановить' : 'Прослушать'}
              </button>
            </div>

            <label className="block text-[10px] font-medium text-text-2" htmlFor="ultron-voice-select">
              Резервный Windows-голос
            </label>
            <select
              id="ultron-voice-select"
              value={voicePreferences.voiceName}
              onChange={(event) => updateVoicePreferences({ ...voicePreferences, voiceName: event.target.value })}
              className="w-full rounded-lg border border-border bg-panel px-3 py-2.5 text-xs text-text-1 outline-none focus:border-accent"
            >
              {!voices.some((voice) => voice.name === voicePreferences.voiceName) && (
                <option value={voicePreferences.voiceName}>{voicePreferences.voiceName}</option>
              )}
              {voices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>{voice.name} · {voice.lang}</option>
              ))}
            </select>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[10px] font-medium text-text-2" htmlFor="ultron-voice-rate">
                <Gauge size={13} aria-hidden="true" /> Скорость речи
              </label>
              <output className="text-[10px] font-medium text-accent" htmlFor="ultron-voice-rate">{voicePreferences.rate.toFixed(2)}×</output>
            </div>
            <input
              id="ultron-voice-rate"
              type="range"
              min="0.95"
              max="1.12"
              step="0.01"
              value={voicePreferences.rate}
              onChange={(event) => updateVoicePreferences({ ...voicePreferences, rate: Number(event.target.value) })}
              className="w-full accent-red-500"
            />
          </section>
          <div className="px-4 py-3 bg-accent/5 border border-accent/20 rounded-xl" role="status">
            <p className="flex items-center gap-2 text-xs font-medium text-accent">
              <ShieldCheck size={14} /> Приватность по умолчанию
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-text-3">
              Живой режим включается только вручную и заметен на экране и в tray. Аудио не сохраняется; остановка доступна одним нажатием.
            </p>
          </div>
          <div className="px-4 py-3 bg-card border border-border rounded-xl">
            <p className="text-[11px] text-text-3 leading-relaxed">
              Локальный runtime и модели:<br/>
              <code className="text-accent text-[10px]">E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime</code>
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end">
          <button type="button" onClick={closePanel}
            className="px-5 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-medium hover:bg-accent/15 transition-colors">
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
