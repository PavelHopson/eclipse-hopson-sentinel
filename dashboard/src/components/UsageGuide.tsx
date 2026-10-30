import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  BookOpen,
  CircleCheck,
  Mic,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { EclipseMark } from './BrandMark';

interface UsageGuideProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenVoice: () => void;
  onOpenOperator: () => void;
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function UsageGuide({
  open,
  onClose,
  onOpenSettings,
  onOpenVoice,
  onOpenOperator,
}: UsageGuideProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="usage-guide-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        aria-describedby="usage-guide-description"
        aria-labelledby="usage-guide-title"
        aria-modal="true"
        className="usage-guide-dialog"
        role="dialog"
      >
        <header className="usage-guide-header">
          <div>
            <p className="usage-guide-eyebrow"><BookOpen size={13} /> Eclipse Forge · быстрый старт</p>
            <h2 id="usage-guide-title">Как пользоваться Eclipse Ultron</h2>
            <p id="usage-guide-description">
              Живой локальный ассистент, безопасные browser actions и отдельный Operator для read-only диагностики.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Закрыть руководство"
            className="usage-guide-close"
            onClick={onClose}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="usage-guide-body">
          <aside className="usage-guide-summary" aria-label="Что уже работает">
            <div className="usage-guide-mark"><EclipseMark size={50} /></div>
            <p className="usage-guide-summary__label">Готово к работе</p>
            <h3>Первый результат — за три шага</h3>
            <ul>
              <li><CircleCheck size={14} /> Qwen 3 8B для быстрого голосового ответа</li>
              <li><CircleCheck size={14} /> Whisper и история разговоров на устройстве</li>
              <li><CircleCheck size={14} /> Ручное подтверждение действий</li>
            </ul>
            <div className="usage-guide-boundary">
              <ShieldCheck size={16} aria-hidden="true" />
              <p><strong>Без скрытых действий</strong><span>Operator не пишет файлы, не запускает shell и не использует сеть.</span></p>
            </div>
          </aside>

          <ol className="usage-guide-steps">
            <li>
              <span className="usage-guide-step-number">01</span>
              <div>
                <p className="usage-guide-step-title"><Settings2 size={15} /> Проверьте локальный контур</p>
                <p>Основной голос — закреплённый локальный Piper Denis с профилем Ultron DSP. Кнопка «Послушать голос» воспроизводит настоящий production-контур, без облака и скрытой замены.</p>
                <button type="button" className="usage-guide-action" onClick={onOpenSettings}>
                  Открыть настройки <ArrowRight size={13} />
                </button>
              </div>
            </li>
            <li>
              <span className="usage-guide-step-number">02</span>
              <div>
                <p className="usage-guide-step-title"><Mic size={15} /> Поговорите с Альтроном</p>
                <p>Нажмите «Включить живой разговор» один раз и говорите свободно; остановка всегда доступна кнопкой и через tray. Команда «Открой YouTube» сначала покажет точный адрес, данные и откат — браузер откроется только после нажатия подтверждения.</p>
                <button type="button" className="usage-guide-action" onClick={onOpenVoice}>
                  Открыть голос Альтрона <ArrowRight size={13} />
                </button>
              </div>
            </li>
            <li>
              <span className="usage-guide-step-number">03</span>
              <div>
                <p className="usage-guide-step-title"><ShieldCheck size={15} /> Используйте Operator для действий</p>
                <p>Продиктуйте операторскую команду. Затем проверьте план и diff, подтвердите их, снимите STOP для одного запуска и изучите receipt.</p>
                <button type="button" className="usage-guide-action" onClick={onOpenOperator}>
                  Открыть Operator <ArrowRight size={13} />
                </button>
              </div>
            </li>
          </ol>
        </div>

        <footer className="usage-guide-footer">
          <p>Руководство всегда доступно по кнопке с книгой в верхней панели.</p>
          <button type="button" className="usage-guide-primary" onClick={onClose}>Понятно, начать работу</button>
        </footer>
      </div>
    </div>
  );
}
