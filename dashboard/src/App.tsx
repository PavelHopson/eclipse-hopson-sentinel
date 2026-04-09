import { Chat } from './components/Chat';
import { StatusPanel } from './components/StatusPanel';

export default function App() {
  return (
    <div className="h-screen flex bg-bg">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border flex flex-col shrink-0 hidden lg:flex">
        {/* Logo */}
        <div className="h-14 flex items-center gap-3 px-5 border-b border-border">
          <div className="w-2.5 h-2.5 rounded-full bg-accent/50 shadow-[0_0_10px_rgba(107,163,255,0.3)]" />
          <span className="text-xs uppercase tracking-[0.25em] text-text-2 font-medium">Eclipse Sentinel</span>
        </div>

        {/* Status */}
        <div className="flex-1 overflow-y-auto">
          <StatusPanel />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
          <p className="text-[10px] text-text-3 tracking-wide">Qwen 3.6 · OpenRouter · localhost:3939</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent/50" />
              <span className="text-xs uppercase tracking-[0.2em] text-text-2">Sentinel</span>
            </div>
            <span className="text-xs text-text-3 hidden sm:block">AI Chat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-live animate-pulse" />
            <span className="text-[10px] text-text-3 uppercase tracking-wider">Connected</span>
          </div>
        </header>

        {/* Chat */}
        <div className="flex-1 overflow-hidden">
          <Chat />
        </div>
      </main>
    </div>
  );
}
