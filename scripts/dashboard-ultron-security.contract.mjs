import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const readText = (relativePath) => readFile(path.join(repoRoot, relativePath), 'utf8')

test('Ultron one-shot STT shares the bounded native manager behind trusted zero-argument IPC', async () => {
  const [main, preload, manager] = await Promise.all([
    readText('dashboard/electron/main.cjs'), readText('dashboard/electron/preload.cjs'),
    readText('dashboard/electron/ultron-live-voice.cjs'),
  ])
  assert.doesNotMatch(main, /spawn\(|runLocalVoiceRecognition[\s\S]*powershell\.exe/)
  assert.match(main, /VOICE_RATE_LIMIT_MS = 1_500/)
  assert.match(main, /voiceListenInFlight/)
  assert.match(main, /app\.requestSingleInstanceLock\(\)/)
  assert.match(main, /app\.on\('second-instance'/)
  assert.match(main, /return await manager\.listenOnce\(\)/)
  assert.match(main, /cancelVoiceListen = cancel/)
  assert.match(main, /Аварийно остановить Альтрона/)
  assert.match(main, /ipcMain\.handle\(VOICE_LISTEN_CHANNEL, async \(event, \.\.\.args\)/)
  assert.match(main, /args\.length !== 0/)
  assert.match(main, /isTrustedOperatorSender\(event\)/)
  assert.match(main, /setPermissionRequestHandler[\s\S]*callback\(false\)/)
  assert.match(preload, /listenOnce\(\)[\s\S]*ipcRenderer\.invoke\(VOICE_LISTEN_CHANNEL\)/)
  assert.match(preload, /cancelListen\(\)[\s\S]*ipcRenderer\.invoke\(VOICE_LISTEN_CANCEL_CHANNEL\)/)
  assert.doesNotMatch(preload, /listenOnce\([^)]*[A-Za-z]/)
  assert.match(manager, /spawnProcess\(executable/)
  assert.match(manager, /shell: false/)
  assert.match(manager, /windowsHide: true/)
  assert.match(manager, /MAX_STDOUT_BUFFER_BYTES = 128 \* 1024/)
  assert.match(manager, /this\.stopping/)
  assert.match(manager, /this\.whenStopped/)
  assert.doesNotMatch(manager, /--save-audio|-sa\b/)
})

test('Ultron Lab routes the abliterated model to a separate local endpoint without tools', async () => {
  const [ai, settings, models, main, html, services] = await Promise.all([
    readText('dashboard/src/lib/ai.ts'),
    readText('dashboard/src/components/SettingsPanel.tsx'),
    readText('dashboard/src/components/LocalModels.tsx'),
    readText('dashboard/electron/main.cjs'),
    readText('dashboard/index.html'),
    readText('dashboard/electron/primary-voice-runtime.cjs'),
  ])

  assert.match(ai, /huihui_ai\/qwen3\.8-abliterated:27b/)
  assert.match(ai, /hf\.co\/chimingw\/Qwen3\.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M/)
  assert.match(ai, /lab: 'http:\/\/127\.0\.0\.1:11435'/)
  assert.match(ai, /У тебя нет инструментов, shell, доступа к файлам, сети, секретам, установке или deployment/)
  assert.doesNotMatch(ai, /tools\s*:/)
  assert.match(settings, /Qwen 3 8B формирует ответы/)
  assert.match(settings, /Микрофон включается только по вашей команде/)
  assert.doesNotMatch(settings, /HuiHui|Lab-профиль/)
  assert.match(main, /createLabOllamaRuntime\(\{ executable: labOllamaExecutable, modelsPath: labOllamaModels, consoleHost: ollamaConsoleHost \}\)/)
  assert.match(services, /lab: \{ host: '127\.0\.0\.1:11435', keepAlive: '0', loadTimeout: '15m', model: null, startAttempts: 40, startDelayMs: 500/)
  assert.ok(services.includes("spawnProcess(process.platform === 'win32' ? consoleHost : executable"))
  assert.ok(services.includes("process.platform === 'win32' ? [executable] : ['serve']"))
  assert.match(services, /detached: true/)
  assert.doesNotMatch(services, /\.\.\.process\.env|process\.kill|taskkill|Stop-Process/i)
  const dispose = services.split('function dispose()')[1].split('function stopOwned()')[0]
  assert.doesNotMatch(dispose, /\.kill\(/)
  assert.match(services, /function stopOwned\(\)[\s\S]*owned\.kill\(\) !== false/)
  assert.match(main, /labOllamaRuntime\.stopOwned\(\)/)
  assert.match(html, /connect-src[^;]*http:\/\/127\.0\.0\.1:11435/)
  assert.match(models, /Qwen3\.8 27B RVN/)
  assert.match(models, /Отдельный Lab: модель не получает инструменты/)
  assert.doesNotMatch(`${ai}\n${main}`, /0\.0\.0\.0:11435/)
})

test('Qwen3.8 Cyber Lab import is explicit, verified and bounded', async () => {
  const [ai, installer] = await Promise.all([
    readText('dashboard/src/lib/ai.ts'),
    readText('scripts/install-qwen38-cyber.ps1'),
  ])

  assert.match(ai, /qwen3\.8-cyber-iq4xs:27b/)
  assert.match(ai, /qwen3\.8-cyber-iq4xs:27b[\s\S]*endpoint: 'lab'/)
  assert.match(ai, /Agentic coding GGUF · текстовый эксперимент/)
  assert.match(ai, /LAB_DEFAULT_MODEL_ID = 'qwen3\.8-cyber-iq4xs:27b'/)
  assert.match(installer, /127\.0\.0\.1:11435/)
  assert.match(installer, /d11d28b9b253fb7fc9de277a46af5bbd790c000d6bfdfe5648fd7b62ec2560b7/)
  assert.match(installer, /Get-FileHash -Algorithm SHA256/)
  assert.match(installer, /PARAMETER num_ctx 8192/)
  assert.match(installer, /PARAMETER num_predict 4096/)
  assert.doesNotMatch(installer, /plus-mtp/i)
})

test('Ultron live microphone remains explicit, local, bounded and cancellable', async () => {
  const [main, preload, manager, conversation] = await Promise.all([
    readText('dashboard/electron/main.cjs'),
    readText('dashboard/electron/preload.cjs'),
    readText('dashboard/electron/ultron-live-voice.cjs'),
    readText('dashboard/src/components/UltronVoiceConversation.tsx'),
  ])

  assert.match(main, /registerVoiceControl\(VOICE_LIVE_START_CHANNEL, 'start'\)/)
  assert.match(main, /registerVoiceControl\(VOICE_LIVE_STOP_CHANNEL, 'stop'\)/)
  assert.match(main, /args\.length !== 0/)
  assert.match(main, /isTrustedOperatorSender\(event\)/)
  assert.match(preload, /startLive\(\)[\s\S]*ipcRenderer\.invoke\(VOICE_LIVE_START_CHANNEL\)/)
  assert.match(preload, /stopLive\(\)[\s\S]*ipcRenderer\.invoke\(VOICE_LIVE_STOP_CHANNEL\)/)
  assert.match(preload, /getLiveStatus\(\)[\s\S]*ipcRenderer\.invoke\(VOICE_LIVE_STATUS_CHANNEL\)/)
  assert.match(preload, /onLiveControl\(callback\)[\s\S]*VOICE_LIVE_CONTROL_EVENT/)
  assert.match(manager, /whisper-stream\.exe/)
  assert.match(manager, /ggml-large-v3-turbo-q5_0\.bin/)
  assert.match(manager, /shell: false/)
  assert.match(manager, /MAX_STDOUT_BUFFER_BYTES = 128 \* 1024/)
  assert.match(manager, /terminateProcessTree/)
  assert.match(manager, /RESUME_ECHO_GUARD_MS = 1_800/)
  assert.match(manager, /CAPTURE_DEVICE_ID = '0'/)
  assert.match(manager, /'--step', '0'/)
  assert.match(manager, /'-c', CAPTURE_DEVICE_ID/)
  assert.match(manager, /SILENCE_HALLUCINATIONS/)
  assert.match(manager, /SLIDING_CONFIRMATION_COUNT = 2/)
  assert.match(manager, /MAX_TRANSCRIPTS_PER_WINDOW = 24/)
  assert.match(manager, /MAX_TRANSCRIPTS_PER_BURST = 4/)
  assert.doesNotMatch(manager, /\.\.\.process\.env/)
  assert.ok(manager.includes("marker === '[Start speaking]'"))
  assert.doesNotMatch(manager, /--save-audio|-sa\b/)
  assert.match(conversation, /Включить живой разговор/)
  assert.match(conversation, /stopLiveLocal/)
  assert.match(conversation, /pauseLiveLocal/)
  assert.match(conversation, /аудио не сохраняется/)
  assert.doesNotMatch(conversation, /setInterval|wake.?word/i)
})

test('Ultron voice uses AppContainer, fixed profile, bounded pipes and no silent fallback', async () => {
  const [main, preload, voice, runtime, supervisor, dsp, sandbox] = await Promise.all([
    readText('dashboard/electron/main.cjs'), readText('dashboard/electron/preload.cjs'),
    readText('dashboard/src/lib/voice.ts'), readText('scripts/voice-runtime/runtime.mjs'),
    readText('scripts/voice-runtime/supervisor.mjs'), readText('scripts/voice-runtime/dsp.mjs'),
    readText('scripts/voice-runtime/AppContainerHost.cs'),
  ])
  assert.match(main, /isTrustedOperatorSender\(event\)/)
  assert.match(main, /\[\.\.\.args\[0\]\]\.length > 240/)
  assert.match(main, /await ultronTtsRuntime\?\.stop\(\)/)
  assert.match(main, /generation !== ultronSpeechGeneration/)
  assert.match(runtime, /os-sandbox-required/)
  assert.match(runtime, /profile: 'ultron-angry'/)
  assert.match(runtime, /runtime-integrity/)
  assert.match(supervisor, /MAX_OUTPUT = 1_800_000/)
  assert.match(supervisor, /timeoutMs = 360_000/)
  assert.match(supervisor, /shell: false/)
  assert.match(supervisor, /signal\?\.addEventListener\('abort'/)
  assert.match(dsp, /protocol_whitelist', 'pipe'/)
  assert.match(dsp, /audio.length \+ data.length > 800000/)
  assert.match(sandbox, /Count = 0/)
  assert.match(sandbox, /AssignProcessToJobObject/)
  assert.match(sandbox, /DuplicateHandle/)
  assert.match(sandbox, /DeleteAppContainerProfile\(Name\)/)
  assert.match(sandbox, /IsMissingProfile\(error\)/)
  assert.match(sandbox, /CreateAppContainerProfile\(Name,[\s\S]*IntPtr\.Zero, 0, out sid\)/)
  assert.deepEqual(
    [...sandbox.matchAll(/DeleteAppContainerProfile\(([^)]*)\)/g)].map((match) => match[1]),
    ['string name', 'Name', 'Name'],
  )
  assert.match(preload, /synthesize\(text\)[\s\S]*ipcRenderer\.invoke\(VOICE_TTS_SYNTHESIZE_CHANNEL, text\)/)
  assert.match(preload, /previewSpeech\(\)/)
  assert.match(voice, /result.engine !== 'ultron-angry'/)
  assert.match(voice, /await pendingStop/)
  assert.match(voice, /decodeAudioData\(audioBytes\.slice\(0\)\)/)
  assert.match(voice, /createBufferSource\(\)/)
  assert.doesNotMatch(voice, /new SpeechSynthesisUtterance|playFastLocalSpeech/)
  assert.doesNotMatch(main, /runPiperSynthesis/)
})

test('Ultron command center exposes explicit safety, voice and accessible motion controls', async () => {
  const [app, room, conversation, core, avatar, voice, css] = await Promise.all([
    readText('dashboard/src/App.tsx'),
    readText('dashboard/src/components/VoiceCommandRoomV2.tsx'),
    readText('dashboard/src/components/UltronVoiceConversation.tsx'),
    readText('dashboard/src/components/UltronCore.tsx'),
    readText('dashboard/src/components/UltronAvatar.tsx'),
    readText('dashboard/src/lib/voice.ts'),
    readText('dashboard/src/ultron.css'),
  ])

  assert.match(room, /isLocalSTTSupported/)
  assert.match(room, /listenOnceLocal/)
  assert.match(room, /Спросить Альтрона/)
  assert.match(room, /Продиктовать команду/)
  assert.match(room, /onVoiceQuestion\(result\.text\)/)
  assert.match(app, /onVoiceQuestion=\{queueConversationTurn\}/)
  assert.match(app, /VOICE_MODEL_ID/)
  assert.match(app, /components\/Chat/)
  assert.match(app, /type Surface = 'conversation' \| 'operator' \| 'lab'/)
  assert.match(app, /surface === 'lab'/)
  assert.match(app, /labMode/)
  assert.match(app, /model=\{selectedModel\}/)
  assert.match(app, /getLabModelId\(getSelectedModel\(\)\)/)
  assert.match(app, /getModelDefinition\(session\.model\)\.endpoint === 'lab'/)
  assert.doesNotMatch(app, /components\/Sidebar|UltronContactDock/)
  assert.match(conversation, /listenOnceLocal/)
  assert.match(conversation, /cancelListenOnceLocal/)
  assert.match(conversation, /sendVoiceMessage/)
  assert.match(conversation, /messagesRef\.current\.slice\(-8\)/)
  assert.match(conversation, /void prepareModel\(\)/)
  assert.match(conversation, /const prepared = await prepareModel\(\)/)
  assert.ok(conversation.indexOf('const prepared = await prepareModel()') < conversation.indexOf('await sendVoiceMessage('))
  assert.match(conversation, /cancelVoiceModel\(\)/)
  const voiceModel = await readText('dashboard/src/lib/voiceModel.ts')
  assert.ok(voiceModel.includes("http://127.0.0.1:11434/api/chat"))
  assert.ok(voiceModel.includes("model: 'qwen3:8b'"))
  assert.match(voiceModel, /think: false/)
  assert.match(voiceModel, /num_predict: 120/)
  assert.doesNotMatch(voiceModel, /tools\s*:/)
  assert.match(conversation, /speak\(clean\)/)
  assert.match(conversation, /Включить живой разговор/)
  assert.doesNotMatch(conversation, /<input|<textarea|createRecognition|webkitSpeechRecognition/)
  assert.match(room, /STOP активен/)
  assert.match(room, /aria-pressed=\{motionEnabled\}/)
  assert.match(app, /ultron-motion-enabled-v1/)
  assert.match(app, /prefers-reduced-motion: reduce/)
  assert.match(app, /media\.addEventListener\('change'/)
  assert.match(core, /aria-live="polite"/)
  assert.match(core, /role="status"/)
  assert.match(core, /ultron-core__voice/)
  assert.match(avatar, /data-presence=\{presence\}/)
  assert.match(avatar, /ultron-avatar-presence__voice/)
  assert.doesNotMatch(conversation, /setInterval|wake.?word/i)
  assert.match(voice, /decoded.duration > 26/)
  assert.match(voice, /MAX_LOCAL_AUDIO_BYTES = 800000/)
  assert.match(voice, /subscribeSpeechStatus/)
  assert.match(voice, /speechSequence !== speechId/)
  assert.doesNotMatch(voice, /Microsoft Pavel|new SpeechSynthesisUtterance/)
  assert.match(voice, /speechSynthesis\.cancel\(\)/)
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(css, /\.ultron-voice__primary/)
  assert.match(css, /\.ultron-avatar-presence--stage/)
  assert.match(css, /@keyframes ultron-avatar-voice/)
  assert.match(css, /@keyframes ultron-core-voice/)
  assert.match(css, /\.ultron-avatar-presence\[data-motion="on"\]/)
  assert.doesNotMatch(`${app}\n${room}\n${conversation}\n${core}\n${avatar}\n${css}`, /Marvel|Avengers|Iron Man|Tony Stark/i)
})
