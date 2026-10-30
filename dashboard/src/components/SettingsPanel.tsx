import { useCallback, useEffect, useRef, useState } from 'react';
import { Cpu, Mic, Play, Server, ShieldCheck, Square, Volume2, X } from 'lucide-react';
import { isTTSSupported, previewUltronVoice, stopSpeaking } from '../lib/voice';

interface SettingsPanelProps { open: boolean; onClose: () => void; onModelChange?: (modelId: string) => void; voiceBusy?: boolean; }

export function SettingsPanel({ open, onClose, voiceBusy = false }: SettingsPanelProps) {
  const [previewing, setPreviewing] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const previewId = useRef(0);
  const ownsPreview = useRef(false);
  const invalidatePreview = useCallback(() => {
    previewId.current++;
    if (ownsPreview.current) { ownsPreview.current = false; stopSpeaking(); }
  }, []);

  const closePanel = () => {
    invalidatePreview(); setPreviewing(false); onClose();
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { invalidatePreview(); setPreviewing(false); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex="0"]') || []);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); invalidatePreview(); previous?.focus(); };
  }, [open, onClose, invalidatePreview]);

  const previewVoice = async () => {
    if (previewing) { invalidatePreview(); setPreviewing(false); return; }
    if (voiceBusy) return;
    const id = ++previewId.current;
    ownsPreview.current = true;
    setVoiceError(''); setPreviewing(true);
    try { await previewUltronVoice(); }
    catch { if (previewId.current === id) setVoiceError('Не удалось воспроизвести голос. Попробуйте ещё раз.'); }
    finally { if (previewId.current === id) { ownsPreview.current = false; setPreviewing(false); } }
  };
  if (!open) return null;
  return (
    <div className="settings-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closePanel}>
      <div ref={dialogRef} aria-labelledby="settings-title" aria-modal="true" role="dialog"
        className="settings-dialog bg-panel border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="settings-title"><h2 id="settings-title" className="text-sm font-medium text-text-1">Настройки Eclipse Ultron</h2><p>Голос и приватность</p></div>
          <button type="button" aria-label="Закрыть настройки" onClick={closePanel} className="w-10 h-10 flex items-center justify-center rounded-lg text-text-2 hover:bg-card focus-visible:outline-2 focus-visible:outline-accent"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <section className="space-y-3" aria-labelledby="voice-profile-title">
            <h3 id="voice-profile-title" className="flex items-center gap-2 text-sm font-medium text-text-1"><Volume2 size={17} /> Голос Альтрона</h3>
            <p className="text-xs leading-relaxed text-text-2">Выбранный низкий голос с грубой металлической обработкой. Один профиль, без автоматической замены другим голосом.</p>
            <button type="button" onClick={() => void previewVoice()} disabled={!isTTSSupported() || (voiceBusy && !previewing)} aria-pressed={previewing}
              className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-xs font-medium text-text-1 hover:bg-accent/20 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent">
              {previewing ? <Square size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
              {previewing ? 'Остановить' : 'Послушать голос'}
            </button>
            {!isTTSSupported() && <p className="text-xs text-text-2">Прослушивание доступно в установленном приложении.</p>}
            {voiceBusy && !previewing && <p className="text-xs text-text-2">Остановите текущий разговор, чтобы прослушать образец.</p>}
            {voiceError && <p role="alert" className="text-xs text-accent">{voiceError}</p>}
            <p className="text-xs leading-relaxed text-text-2">Кнопка воспроизводит настоящий текущий голос. Текст появляется раньше, локальная озвучка обычно готовится за несколько секунд и её всегда можно остановить.</p>
          </section>
          <div className="space-y-3 border-t border-border pt-4">
            <p className="flex items-center gap-2 text-xs text-text-2"><Cpu size={16} /> Qwen 3 8B формирует ответы</p>
            <p className="flex items-center gap-2 text-xs text-text-2"><Mic size={16} /> Whisper распознаёт русскую речь локально</p>
            <p className="flex items-center gap-2 text-xs text-text-2"><Server size={16} /> Pinned Piper + Ultron DSP озвучивают без облака</p>
          </div>
          <section className="border-t border-border pt-4" aria-labelledby="voice-privacy-title">
            <h3 id="voice-privacy-title" className="flex items-center gap-2 text-xs font-medium text-text-1"><ShieldCheck size={16} /> Приватность</h3>
            <p className="mt-2 text-xs leading-relaxed text-text-2">Микрофон включается только по вашей команде. Голосовой процесс изолирован средствами Windows: без сетевых разрешений, ключей и инструментов управления компьютером. Аудиозаписи разговора не сохраняются.</p>
          </section>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <button type="button" onClick={closePanel} className="px-5 py-3 rounded-lg bg-card border border-border text-text-1 text-xs font-medium hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent">Готово</button>
        </div>
      </div>
    </div>
  );
}
