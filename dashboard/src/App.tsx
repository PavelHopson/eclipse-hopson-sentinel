import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { BookOpen, Plus, Settings2 } from 'lucide-react';
import { SettingsPanel } from './components/SettingsPanel';
import { BrandLockup } from './components/BrandMark';
import { UsageGuide } from './components/UsageGuide';
import { UltronAvatar } from './components/UltronAvatar';
import { type ChatSession, type Message, createSession, getLabModelId, getModelDefinition, getSelectedModel, loadSessions, saveSessions, VOICE_MODEL_ID } from './lib/ai';
import { type ContactTurn, type UltronPresenceState } from './lib/ultronPresence';

const VoiceConversation = lazy(() => import('./components/UltronVoiceConversation').then((module) => ({ default: module.UltronVoiceConversation })));
const VoiceCommandRoom = lazy(() => import('./components/VoiceCommandRoomV2').then((module) => ({ default: module.VoiceCommandRoom })));
const LabChat = lazy(() => import('./components/Chat').then((module) => ({ default: module.Chat })));

type ElectronWindowStyle = CSSProperties & { WebkitAppRegion: 'drag' | 'no-drag' };
type Surface = 'conversation' | 'operator' | 'lab';

const DRAG_STYLE: ElectronWindowStyle = { WebkitAppRegion: 'drag' };
const NO_DRAG_STYLE: ElectronWindowStyle = { WebkitAppRegion: 'no-drag' };
const USAGE_GUIDE_STORAGE_KEY = 'ultron-usage-guide-seen-v1';
const MOTION_STORAGE_KEY = 'ultron-motion-enabled-v1';

function loadMotionPreference() {
  return localStorage.getItem(MOTION_STORAGE_KEY) !== '0';
}

function loadInitialSessions(): ChatSession[] {
  const stored = loadSessions();
  return stored.length > 0 ? stored : [createSession(VOICE_MODEL_ID)];
}

function SurfaceLoading({ presence, motionEnabled, surface }: { presence: UltronPresenceState; motionEnabled: boolean; surface: Surface }) {
  const loadingPresence = presence === 'idle' ? 'thinking' : presence;
  const isLab = surface === 'lab';
  return (
    <div className="surface-loading" role="status" aria-live="polite">
      <UltronAvatar presence={loadingPresence} size="chat" motionEnabled={motionEnabled} />
      <span><strong>{isLab ? 'Lab выходит на связь' : 'Альтрон выходит на связь'}</strong><small>{isLab ? 'Изолированный текстовый контур запускается' : 'Локальный голосовой контур запускается'}</small></span>
    </div>
  );
}
export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(loadInitialSessions);
  const [activeId, setActiveId] = useState<string>(sessions[0].id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageGuideOpen, setUsageGuideOpen] = useState(() => localStorage.getItem(USAGE_GUIDE_STORAGE_KEY) !== '1');
  const [surface, setSurface] = useState<Surface>('conversation');
  const [selectedModel, setSelectedModel] = useState(() => getLabModelId(getSelectedModel()));
  const [contactTurn, setContactTurn] = useState<ContactTurn | null>(null);
  const [presence, setPresence] = useState<UltronPresenceState>('idle');
  const [motionPreference, setMotionPreference] = useState(loadMotionPreference);
  const [systemReducedMotion, setSystemReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const activeSession = sessions.find((session) => session.id === activeId) || sessions[0];

  useEffect(() => { saveSessions(sessions); }, [sessions]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (presence !== 'success' && presence !== 'error') return;
    const timeoutId = window.setTimeout(() => setPresence('idle'), presence === 'success' ? 1_400 : 2_400);
    return () => window.clearTimeout(timeoutId);
  }, [presence]);

  const handleNew = () => {
    const session = createSession(surface === 'lab' ? selectedModel : VOICE_MODEL_ID);
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
    setContactTurn(null);
    setPresence('idle');
  };

  const handleMessagesChange = (messages: Message[]) => {
    setSessions((current) => current.map((session) => {
      if (session.id !== activeId) return session;
      const firstQuestion = messages.find((message) => message.role === 'user')?.content.trim();
      return {
        ...session,
        model: surface === 'lab' ? selectedModel : VOICE_MODEL_ID,
        messages,
        title: firstQuestion ? firstQuestion.slice(0, 48) : 'Новый разговор',
      };
    }));
  };

  const openSurface = (nextSurface: Surface) => {
    const desiredModel = nextSurface === 'lab' ? getLabModelId(selectedModel) : VOICE_MODEL_ID;
    const existing = sessions.find((session) => nextSurface === 'lab'
      ? getModelDefinition(session.model).endpoint === 'lab' && session.model === desiredModel
      : session.model === desiredModel);

    if (existing) {
      setActiveId(existing.id);
    } else {
      const session = createSession(desiredModel);
      setSessions((current) => [session, ...current]);
      setActiveId(session.id);
    }
    setContactTurn(null);
    setPresence('idle');
    setSurface(nextSurface);
  };

  const handleModelChange = (nextModel: string) => {
    const labModel = getLabModelId(nextModel);
    setSelectedModel(labModel);
    if (surface !== 'lab' || activeSession.model === labModel) return;
    const session = createSession(labModel);
    setSessions((current) => [session, ...current]);
    setActiveId(session.id);
    setPresence('idle');
  };

  const closeUsageGuide = () => {
    localStorage.setItem(USAGE_GUIDE_STORAGE_KEY, '1');
    setUsageGuideOpen(false);
  };

  const openSettingsFromGuide = () => {
    closeUsageGuide();
    setSettingsOpen(true);
  };

  const openSurfaceFromGuide = (nextSurface: Surface) => {
    closeUsageGuide();
    openSurface(nextSurface);
  };

  const queueConversationTurn = (text: string) => {
    setContactTurn({ id: Date.now(), text, mode: 'voice' });
    setSurface('conversation');
  };

  const toggleMotion = () => {
    const next = !motionPreference;
    setMotionPreference(next);
    localStorage.setItem(MOTION_STORAGE_KEY, next ? '1' : '0');
  };

  const motionEnabled = motionPreference && !systemReducedMotion;

  return (
    <div className="h-screen flex bg-bg overflow-hidden sentinel-shell" data-brand="ultron" data-visual-profile="operational">
      <main className="sentinel-main ultron-voice-shell flex-1 flex flex-col min-w-0">
        <header className="sentinel-header ultron-voice-header" style={DRAG_STYLE}>
          <div className="ultron-voice-header__brand" style={NO_DRAG_STYLE}>
            <BrandLockup />
          </div>
          <nav className="surface-switcher" aria-label="Режим Альтрона" style={NO_DRAG_STYLE}>
            <button type="button" aria-pressed={surface === 'conversation'} onClick={() => openSurface('conversation')}>Альтрон</button>
            <button type="button" aria-pressed={surface === 'lab'} onClick={() => openSurface('lab')}>Lab</button>
            <button type="button" aria-pressed={surface === 'operator'} onClick={() => openSurface('operator')}>Оператор</button>
          </nav>
          <div className="ultron-voice-header__tools" style={NO_DRAG_STYLE}>
            <div className="ultron-header-presence" data-state={presence}>
              <span aria-hidden="true" />
              <strong>{presence === 'idle' ? 'На связи' : 'Активен'}</strong>
            </div>
            <button type="button" aria-label="Начать новый разговор" onClick={handleNew}>
              <Plus size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Открыть настройки" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Открыть руководство" onClick={() => setUsageGuideOpen(true)}>
              <BookOpen size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="sentinel-workspace flex-1 overflow-hidden">
          <Suspense fallback={<SurfaceLoading presence={presence} motionEnabled={motionEnabled} surface={surface} />}>
            {surface === 'conversation' ? (
              <VoiceConversation
                messages={activeSession.messages}
                onMessagesChange={handleMessagesChange}
                externalTurn={contactTurn}
                onExternalTurnApplied={() => setContactTurn(null)}
                presence={presence}
                onPresenceChange={setPresence}
                motionEnabled={motionEnabled}
              />
            ) : surface === 'lab' ? (
              <LabChat
                messages={activeSession.messages}
                onMessagesChange={handleMessagesChange}
                showGuide={false}
                autoSpeak={false}
                onPresenceChange={setPresence}
                motionEnabled={motionEnabled}
                model={selectedModel}
                labMode
              />
            ) : (
              <VoiceCommandRoom
                motionEnabled={motionEnabled}
                motionLocked={systemReducedMotion}
                onMotionChange={toggleMotion}
                onPresenceChange={setPresence}
                onVoiceQuestion={queueConversationTurn}
              />
            )}
          </Suspense>
        </div>
      </main>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onModelChange={handleModelChange}
      />
      <UsageGuide
        open={usageGuideOpen}
        onClose={closeUsageGuide}
        onOpenSettings={openSettingsFromGuide}
        onOpenVoice={() => openSurfaceFromGuide('conversation')}
        onOpenOperator={() => openSurfaceFromGuide('operator')}
      />
    </div>
  );
}
