import { useState, useEffect } from 'react';
import { Chat } from './components/Chat';
import { Sidebar } from './components/Sidebar';
import { StatusPanel } from './components/StatusPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { type ChatSession, type Message, loadSessions, saveSessions, createSession, getSelectedModel } from './lib/ai';

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string | null>(sessions[0]?.id || null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem('sentinel-guide-dismissed'));

  const activeSession = sessions.find(s => s.id === activeId) || null;

  // Persist sessions
  useEffect(() => { saveSessions(sessions); }, [sessions]);

  const handleNew = () => {
    const s = createSession(getSelectedModel());
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
  };

  const handleDelete = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeId === id) setActiveId(sessions.find(s => s.id !== id)?.id || null);
  };

  const handleMessagesChange = (msgs: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeId) return s;
      // Auto-title from first user message
      const title = s.title === 'Новый чат' && msgs.length > 0
        ? msgs.find(m => m.role === 'user')?.content.slice(0, 40) || 'Новый чат'
        : s.title;
      return { ...s, messages: msgs, title };
    }));
  };

  const handleModelChange = () => {
    // Re-render with new model
    setSessions(prev => [...prev]);
  };

  const toggleGuide = () => {
    const next = !showGuide;
    setShowGuide(next);
    if (!next) localStorage.setItem('sentinel-guide-dismissed', '1');
    else localStorage.removeItem('sentinel-guide-dismissed');
  };

  // Auto-create first session
  useEffect(() => {
    if (sessions.length === 0) handleNew();
  }, []);

  return (
    <div className="h-screen flex bg-bg overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNew}
        onDelete={handleDelete}
        onOpenSettings={() => setSettingsOpen(true)}
        showGuide={showGuide}
        onToggleGuide={toggleGuide}
      />

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Title bar area (draggable for frameless window) */}
        <header className="h-10 flex items-center justify-between px-4 border-b border-border shrink-0"
          style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent/50" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-text-2">Sentinel</span>
            </div>
            <span className="text-[11px] text-text-3">
              {activeSession?.title || 'AI Chat'}
            </span>
          </div>
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <div className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
            <span className="text-[10px] text-text-3 uppercase tracking-wider">Connected</span>
          </div>
        </header>

        {/* Chat area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Chat
              messages={activeSession?.messages || []}
              onMessagesChange={handleMessagesChange}
              showGuide={showGuide}
            />
          </div>

          {/* Right panel — status (desktop) */}
          <div className="w-56 border-l border-border hidden xl:block overflow-y-auto">
            <StatusPanel showGuide={showGuide} />
          </div>
        </div>
      </main>

      {/* Settings modal */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
