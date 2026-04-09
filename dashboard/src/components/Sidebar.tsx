import {} from 'react';
import { Plus, MessageSquare, Settings, Trash2, HelpCircle } from 'lucide-react';
import { type ChatSession } from '../lib/ai';
import { Tooltip } from './Tooltip';

interface SidebarProps {
  sessions: ChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  showGuide: boolean;
  onToggleGuide: () => void;
}

export function Sidebar({ sessions, activeId, onSelect, onNew, onDelete, onOpenSettings, showGuide, onToggleGuide }: SidebarProps) {
  return (
    <aside className="w-64 border-r border-border flex flex-col shrink-0 hidden lg:flex" style={{ WebkitAppRegion: 'no-drag' } as any}>
      {/* Logo */}
      <div className="h-10 flex items-center gap-3 px-4 border-b border-border" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="w-2 h-2 rounded-full bg-accent/50 shadow-[0_0_8px_rgba(107,163,255,0.3)]" />
        <span className="text-[10px] uppercase tracking-[0.25em] text-text-2 font-medium">Eclipse Sentinel</span>
      </div>

      {/* New chat */}
      <div className="p-3">
        <Tooltip text="Начать новый диалог с AI" show={showGuide}>
          <button onClick={onNew}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border text-xs text-text-2 hover:bg-card hover:text-text-1 hover:border-accent/20 transition-all">
            <Plus size={14} />
            Новый чат
          </button>
        </Tooltip>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {sessions.length === 0 && (
          <p className="text-[11px] text-text-3 text-center py-6">Нет чатов</p>
        )}
        {sessions.map((s) => (
          <div key={s.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs ${
              s.id === activeId ? 'bg-accent/10 text-text-1 border border-accent/15' : 'text-text-3 hover:bg-card hover:text-text-2 border border-transparent'
            }`}
            onClick={() => onSelect(s.id)}>
            <MessageSquare size={12} className="shrink-0" />
            <span className="flex-1 truncate">{s.title}</span>
            <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
              className="opacity-0 group-hover:opacity-100 text-text-3 hover:text-red-400 transition-all p-0.5">
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="p-3 border-t border-border space-y-1">
        <Tooltip text="Настройки: API ключ, модель" show={showGuide}>
          <button onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-3 hover:bg-card hover:text-text-2 transition-all">
            <Settings size={13} />
            Настройки
          </button>
        </Tooltip>
        <button onClick={onToggleGuide}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
            showGuide ? 'bg-accent/10 text-accent' : 'text-text-3 hover:bg-card hover:text-text-2'
          }`}>
          <HelpCircle size={13} />
          {showGuide ? 'Скрыть подсказки' : 'Подсказки'}
        </button>
      </div>
    </aside>
  );
}
