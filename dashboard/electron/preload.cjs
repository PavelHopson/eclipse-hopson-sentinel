const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ultronTasks', Object.freeze({
  activate(projectId) { return ipcRenderer.invoke('sentinel:tasks:activate', projectId); },
  request(request) { return ipcRenderer.invoke('sentinel:tasks:request', request); },
  close(session) { return ipcRenderer.invoke('sentinel:tasks:close', session); },
}));

const EXECUTE_CHANNEL = 'sentinel:operator:execute';
const VOICE_LISTEN_CHANNEL = 'sentinel:voice:listen-once';
const VOICE_LISTEN_CANCEL_CHANNEL = 'sentinel:voice:listen-cancel';
const VOICE_MODEL_ENSURE_CHANNEL = 'sentinel:voice:ensure-model';
const VOICE_MODEL_CANCEL_CHANNEL = 'sentinel:voice:cancel-model';
const VOICE_LIVE_START_CHANNEL = 'sentinel:voice:live-start';
const VOICE_LIVE_STOP_CHANNEL = 'sentinel:voice:live-stop';
const VOICE_LIVE_PAUSE_CHANNEL = 'sentinel:voice:live-pause';
const VOICE_LIVE_RESUME_CHANNEL = 'sentinel:voice:live-resume';
const VOICE_LIVE_STATUS_CHANNEL = 'sentinel:voice:live-status';
const VOICE_LIVE_STATE_EVENT = 'sentinel:voice:live-state';
const VOICE_LIVE_TRANSCRIPT_EVENT = 'sentinel:voice:live-transcript';
const VOICE_LIVE_CONTROL_EVENT = 'sentinel:voice:live-control';
const VOICE_TTS_SYNTHESIZE_CHANNEL = 'sentinel:voice:tts-synthesize';
const VOICE_TTS_STOP_CHANNEL = 'sentinel:voice:tts-stop';
const VOICE_TTS_PREVIEW_CHANNEL = 'sentinel:voice:tts-preview';
const VOICE_ACTION_PREVIEW_CHANNEL = 'sentinel:voice:action-preview';
const VOICE_ACTION_EXECUTE_CHANNEL = 'sentinel:voice:action-execute';
const VOICE_ACTION_CANCEL_CHANNEL = 'sentinel:voice:action-cancel';
const DEVELOPER_SELECT_CHANNEL = 'sentinel:developer:select-workspace';
const DEVELOPER_PROPOSE_CHANNEL = 'sentinel:developer:propose';
const DEVELOPER_CANCEL_CHANNEL = 'sentinel:developer:cancel';
const DEVELOPER_APPLY_CHANNEL = 'sentinel:developer:apply';
const DEVELOPER_ROLLBACK_PREVIEW_CHANNEL = 'sentinel:developer:rollback-preview';
const DEVELOPER_ROLLBACK_CHANNEL = 'sentinel:developer:rollback';
const DIAGNOSTICS_COLLECT_CHANNEL = 'sentinel:diagnostics:collect';
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
  onModelProgress(callback) { return subscribeToLiveVoice('sentinel:voice:model-progress', callback); },
  cancelModel() { return ipcRenderer.invoke(VOICE_MODEL_CANCEL_CHANNEL); },
  ensureModel() {
    return ipcRenderer.invoke(VOICE_MODEL_ENSURE_CHANNEL);
  },
  listenOnce() {
    return ipcRenderer.invoke(VOICE_LISTEN_CHANNEL);
  },
  cancelListen() {
    return ipcRenderer.invoke(VOICE_LISTEN_CANCEL_CHANNEL);
  },
  synthesize(text) {
    return ipcRenderer.invoke(VOICE_TTS_SYNTHESIZE_CHANNEL, text);
  },
  stopSpeech() {
    return ipcRenderer.invoke(VOICE_TTS_STOP_CHANNEL);
  },
  previewSpeech() {
    return ipcRenderer.invoke(VOICE_TTS_PREVIEW_CHANNEL);
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
  getLiveStatus() {
    return ipcRenderer.invoke(VOICE_LIVE_STATUS_CHANNEL);
  },
  onLiveState(callback) {
    return subscribeToLiveVoice(VOICE_LIVE_STATE_EVENT, callback);
  },
  onLiveTranscript(callback) {
    return subscribeToLiveVoice(VOICE_LIVE_TRANSCRIPT_EVENT, callback);
  },
  onLiveControl(callback) {
    return subscribeToLiveVoice(VOICE_LIVE_CONTROL_EVENT, callback);
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

contextBridge.exposeInMainWorld('ultronDeveloper', Object.freeze({
  selectWorkspace() {
    return ipcRenderer.invoke(DEVELOPER_SELECT_CHANNEL);
  },
  propose(task) {
    return ipcRenderer.invoke(DEVELOPER_PROPOSE_CHANNEL, { task });
  },
  cancel() {
    return ipcRenderer.invoke(DEVELOPER_CANCEL_CHANNEL);
  },
  apply(approval) {
    return ipcRenderer.invoke(DEVELOPER_APPLY_CHANNEL, approval);
  },
  previewRollback() {
    return ipcRenderer.invoke(DEVELOPER_ROLLBACK_PREVIEW_CHANNEL);
  },
  rollback(approval) {
    return ipcRenderer.invoke(DEVELOPER_ROLLBACK_CHANNEL, approval);
  },
}));

contextBridge.exposeInMainWorld('ultronDiagnostics', Object.freeze({
  collect() {
    return ipcRenderer.invoke(DIAGNOSTICS_COLLECT_CHANNEL);
  },
}));

contextBridge.exposeInMainWorld('ultronLocalModels', Object.freeze({
  status() { return ipcRenderer.invoke('sentinel:local-models:status'); },
  run(request) { return ipcRenderer.invoke('sentinel:local-models:run', request); },
  cancel() { return ipcRenderer.invoke('sentinel:local-models:cancel'); },
}));
