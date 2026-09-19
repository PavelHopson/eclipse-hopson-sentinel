import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))
const readText = (relativePath) => readFile(path.join(repoRoot, relativePath), 'utf8')

test('Ultron one-shot STT uses a fixed, bounded and trusted Electron IPC contract', async () => {
  const [main, preload, packageText, stt] = await Promise.all([
    readText('dashboard/electron/main.cjs'),
    readText('dashboard/electron/preload.cjs'),
    readText('dashboard/package.json'),
    readText('scripts/sentinel-stt.ps1'),
  ])
  const packageJson = JSON.parse(packageText)

  assert.match(main, /const \{ spawn \} = require\('child_process'\)/)
  assert.doesNotMatch(main, /\bexec(?:File|Sync)?\s*\(/)
  assert.match(main, /shell: false/)
  assert.match(main, /VOICE_OUTPUT_LIMIT_BYTES = 8 \* 1024/)
  assert.match(main, /VOICE_PROCESS_TIMEOUT_MS = 25_000/)
  assert.match(main, /VOICE_RATE_LIMIT_MS = 1_500/)
  assert.match(main, /VOICE_MODEL_WARMUP_URL = 'http:\/\/127\.0\.0\.1:11434\/api\/generate'/)
  assert.match(main, /VOICE_MODEL_WARMUP_TIMEOUT_MS = 120_000/)
  assert.match(main, /model: 'qwen3:8b'/)
  assert.match(main, /keep_alive: '2h'/)
  assert.match(main, /void warmPrimaryVoiceModel\(\)/)
  assert.doesNotMatch(main, /warmPrimaryVoiceModel[\s\S]*console\./)
  assert.match(main, /voiceListenInFlight/)
  assert.match(main, /ipcMain\.handle\(VOICE_LISTEN_CHANNEL, async \(event, \.\.\.args\)/)
  assert.match(main, /args\.length !== 0/)
  assert.match(main, /isTrustedOperatorSender\(event\)/)
  assert.match(main, /setPermissionRequestHandler[\s\S]*callback\(false\)/)
  assert.match(main, /path\.join\(process\.resourcesPath, 'voice', 'sentinel-stt\.ps1'\)/)
  assert.match(main, /path\.join\(eclipseProgramsRoot, 'Eclipse AI Runtime'\)/)
  assert.match(main, /'-RuntimeRoot',[\s\S]*eclipseAiRuntimeRoot/)
  assert.match(main, /app\.setPath\('userData', path\.join\(app\.getPath\('appData'\), 'Eclipse Sentinel'\)\)/)
  assert.match(preload, /listenOnce\(\)[\s\S]*ipcRenderer\.invoke\(VOICE_LISTEN_CHANNEL\)/)
  assert.doesNotMatch(preload, /listenOnce\([^)]*[A-Za-z]/)
  assert.ok(packageJson.build.extraResources.some((resource) => resource.to === 'voice/sentinel-stt.ps1'))
  assert.match(stt, /Console\]::OutputEncoding = \$utf8/)
  assert.match(stt, /whisper\\Release\\whisper-stream\.exe/)
  assert.match(stt, /EnvironmentVariables\['SDL_AUDIODRIVER'\] = 'directsound'/)
  assert.match(stt, /-vth 0\.45/)
  assert.match(stt, /ggml-large-v3-turbo-q5_0\.bin/)
  assert.match(stt, /System\.Diagnostics\.ProcessStartInfo/)
  assert.match(stt, /CreateNoWindow = \$true/)
  assert.match(stt, /UseShellExecute = \$false/)
  assert.match(stt, /ReadToEndAsync\(\)/)
  assert.doesNotMatch(stt, /--save-audio|-sa\b|stt-\$token\.txt|RedirectStandardOutput = \$stdoutPath/)
  assert.match(stt, /WHISPER_RUNTIME_MISSING/)
  assert.match(stt, /WHISPER_MODEL_MISSING/)
  assert.match(stt, /RUSSIAN_SPEECH_PACK_MISSING/)
  assert.match(stt, /SpeechRecognitionEngine\]::new\(\$russianRecognizer\.Culture\)/)
  assert.match(stt, /\$recognizer\.Dispose\(\)/)
  assert.match(stt, /\$script:whisperProcess\.Kill\(\)/)
  assert.match(main, /WHISPER_RUNTIME_MISSING: 'Локальный голосовой runtime не найден/)
})

test('Ultron Lab routes the abliterated model to a separate local endpoint without tools', async () => {
  const [ai, settings, main, html] = await Promise.all([
    readText('dashboard/src/lib/ai.ts'),
    readText('dashboard/src/components/SettingsPanel.tsx'),
    readText('dashboard/electron/main.cjs'),
    readText('dashboard/index.html'),
  ])

  assert.match(ai, /huihui_ai\/qwen3\.8-abliterated:27b/)
  assert.match(ai, /hf\.co\/chimingw\/Qwen3\.8-27B-Uncensored-OrcaRouter-GGUF:Q4_K_M/)
  assert.match(ai, /lab: 'http:\/\/127\.0\.0\.1:11435'/)
  assert.match(ai, /У тебя нет инструментов, shell, доступа к файлам, сети, секретам, установке или deployment/)
  assert.doesNotMatch(ai, /tools\s*:/)
  assert.match(settings, /Qwen 3 8B · голосовой профиль/)
  assert.match(settings, /Живой режим включается только вручную/)
  assert.match(main, /OLLAMA_HOST: '127\.0\.0\.1:11435'/)
  assert.match(main, /OLLAMA_MODELS: labOllamaModels/)
  assert.match(main, /OLLAMA_LOAD_TIMEOUT: '15m'/)
  assert.match(main, /spawn\(labOllamaExecutable, \['serve'\]/)
  assert.match(html, /connect-src[^;]*http:\/\/127\.0\.0\.1:11435/)
  assert.match(settings, /Модель диалога/)
  assert.match(settings, /LAB_MODELS\.map/)
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
  assert.match(manager, /whisper-stream\.exe/)
  assert.match(manager, /ggml-large-v3-turbo-q5_0\.bin/)
  assert.match(manager, /shell: false/)
  assert.match(manager, /MAX_STDOUT_BUFFER_BYTES = 128 \* 1024/)
  assert.match(manager, /RESUME_ECHO_GUARD_MS = 1_800/)
  assert.doesNotMatch(manager, /--save-audio|-sa\b/)
  assert.match(conversation, /Включить живой разговор/)
  assert.match(conversation, /stopLiveLocal/)
  assert.match(conversation, /pauseLiveLocal/)
  assert.match(conversation, /аудио не сохраняется/)
  assert.doesNotMatch(conversation, /setInterval|wake.?word/i)
})

test('Ultron fast TTS uses fixed Piper runtime with bounded trusted IPC and SAPI fallback', async () => {
  const [main, preload, voice] = await Promise.all([
    readText('dashboard/electron/main.cjs'),
    readText('dashboard/electron/preload.cjs'),
    readText('dashboard/src/lib/voice.ts'),
  ])

  assert.match(main, /PIPER_TTS_TEXT_LIMIT = 400/)
  assert.match(main, /PIPER_TTS_OUTPUT_LIMIT_BYTES = 12 \* 1024 \* 1024/)
  assert.match(main, /PIPER_TTS_TIMEOUT_MS = 8_000/)
  assert.match(main, /piperTtsModelRelative = path\.join\('\.\.', '\.\.', 'voices'/)
  assert.match(main, /'--espeak_data', path\.join\('\.', 'espeak-ng-data'\)/)
  assert.match(main, /'--output_file', '-'/)
  assert.match(main, /shell: false/)
  assert.match(main, /isTrustedOperatorSender\(event\)/)
  assert.match(main, /wav\.subarray\(0, 4\)\.toString\('ascii'\) === 'RIFF'/)
  assert.doesNotMatch(main, /exec(?:File|Sync)?\s*\(/)
  assert.match(preload, /synthesize\(text\)[\s\S]*ipcRenderer\.invoke\(VOICE_TTS_SYNTHESIZE_CHANNEL, text\)/)
  assert.match(preload, /stopSpeech\(\)/)
  assert.match(voice, /playFastLocalSpeech/)
  assert.match(voice, /header\.startsWith\('RIFF'\)/)
  assert.match(voice, /new SpeechSynthesisUtterance/)
  assert.match(voice, /stopSpeech/)
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
  assert.match(conversation, /sendMessage/)
  assert.match(conversation, /VOICE_MODEL_ID/)
  assert.match(conversation, /messagesRef\.current\.slice\(-8\)/)
  assert.match(conversation, /warmVoiceModel\(\)/)
  assert.match(conversation, /maxTokens: 120, reasoningEffort: 'none'/)
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
  assert.match(voice, /45_000/)
  assert.match(voice, /Microsoft Pavel/)
  assert.match(voice, /ultron-voice-preferences-v1/)
  assert.match(voice, /clamp\(preferences\.rate, 0\.95, 1\.12\)/)
  assert.match(voice, /voiceschanged/)
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
