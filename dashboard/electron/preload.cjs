const { contextBridge, ipcRenderer } = require('electron');

const EXECUTE_CHANNEL = 'sentinel:operator:execute';
const VOICE_LISTEN_CHANNEL = 'sentinel:voice:listen-once';
const VOICE_LIVE_START_CHANNEL = 'sentinel:voice:live-start';
const VOICE_LIVE_STOP_CHANNEL = 'sentinel:voice:live-stop';
const VOICE_LIVE_PAUSE_CHANNEL = 'sentinel:voice:live-pause';
const VOICE_LIVE_RESUME_CHANNEL = 'sentinel:voice:live-resume';
const VOICE_LIVE_STATE_EVENT = 'sentinel:voice:live-state';
const VOICE_LIVE_TRANSCRIPT_EVENT = 'sentinel:voice:live-transcript';
const VOICE_TTS_SYNTHESIZE_CHANNEL = 'sentinel:voice:tts-synthesize';
const VOICE_TTS_STOP_CHANNEL = 'sentinel:voice:tts-stop';
const VOICE_ACTION_PREVIEW_CHANNEL = 'sentinel:voice:action-preview';
const VOICE_ACTION_EXECUTE_CHANNEL = 'sentinel:voice:action-execute';
const VOICE_ACTION_CANCEL_CHANNEL = 'sentinel:voice:action-cancel';
const liveListeners = new Map();
let nextLiveListenerId = 1;

function subscribeToLiveVoice(channel, callback) {
  if (typeof callback !== 'function') return 0;
  const id = nextLiveListenerId++;
  const listener = (_event, payload) => callback(payload);
  liveListeners.set(id, { channel, listener });
  ipcRenderer.on(channel, listener);
  return id;
}

contextBridge.exposeInMainWorld('sentinelOperator', Object.freeze({
  execute(request) {
    return ipcRenderer.invoke(EXECUTE_CHANNEL, request);
  },
}));

contextBridge.exposeInMainWorld('ultronVoice', Object.freeze({
  listenOnce() {
    return ipcRenderer.invoke(VOICE_LISTEN_CHANNEL);
  },
  synthesize(text) {
    return ipcRenderer.invoke(VOICE_TTS_SYNTHESIZE_CHANNEL, text);
  },
  stopSpeech() {
    return ipcRenderer.invoke(VOICE_TTS_STOP_CHANNEL);
  },
  previewAction(actionId) {
    return ipcRenderer.invoke(VOICE_ACTION_PREVIEW_CHANNEL, actionId);
  },
  executeAction(approval) {
    return ipcRenderer.invoke(VOICE_ACTION_EXECUTE_CHANNEL, approval);
  },
  cancelAction(requestId) {
    return ipcRenderer.invoke(VOICE_ACTION_CANCEL_CHANNEL, requestId);
  },
  startLive() {
    return ipcRenderer.invoke(VOICE_LIVE_START_CHANNEL);
  },
  stopLive() {
    return ipcRenderer.invoke(VOICE_LIVE_STOP_CHANNEL);
  },
  pauseLive() {
    return ipcRenderer.invoke(VOICE_LIVE_PAUSE_CHANNEL);
  },
  resumeLive() {
    return ipcRenderer.invoke(VOICE_LIVE_RESUME_CHANNEL);
  },
  onLiveState(callback) {
    return subscribeToLiveVoice(VOICE_LIVE_STATE_EVENT, callback);
  },
  onLiveTranscript(callback) {
    return subscribeToLiveVoice(VOICE_LIVE_TRANSCRIPT_EVENT, callback);
  },
  removeLiveListener(id) {
    if (!Number.isSafeInteger(id)) return false;
    const entry = liveListeners.get(id);
    if (!entry) return false;
    ipcRenderer.removeListener(entry.channel, entry.listener);
    liveListeners.delete(id);
    return true;
  },
}));
