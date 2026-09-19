# Eclipse Ultron Local AI Runtime

## Назначение

`Eclipse AI Runtime` — локальный и переносимый контур для голоса и экспериментальных
моделей Eclipse Ultron. Он не устанавливает Windows Speech Capability и не размещает
исполняемые файлы или веса моделей на системном диске.

Утверждённый каталог этой рабочей станции:

```text
E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime
```

## Состав

| Компонент | Версия / модель | Назначение | Источник |
| --- | --- | --- | --- |
| whisper.cpp | release `b4938`, CUDA 12.4 | offline STT | `ggml-org/whisper.cpp` |
| Whisper | `large-v3-turbo-q5_0` | русское распознавание речи | `ggerganov/whisper.cpp` |
| Piper | `2023.11.14-2`, Windows amd64 | быстрый offline TTS runtime | `rhasspy/piper` |
| Piper voice | `ru_RU-denis-medium`, CC0 dataset | основной русский мужской голос | `rhasspy/piper-voices` |
| Qwen3-TTS | `0.6B CustomVoice`, CUDA | установленный Studio/Lab benchmark, не real-time default | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` |
| Python | `3.12.14`, portable via uv `0.12.5` | изолированный Qwen3-TTS runtime | `astral-sh/uv` |
| Ollama | `0.32.15`, portable Windows amd64 | локальный model server | `ollama/ollama` |
| HuiHui Qwen3.8 | `27b`, Q4_K_M | изолированный Lab-чат | `huihui_ai/qwen3.8-abliterated:27b` |
| OrcaRouter Qwen3.8 | `27b`, Q4_K_M | установлен в изолированный Lab, benchmark ожидается | `chimingw/Qwen3.8-27B-Uncensored-OrcaRouter-GGUF` |
| Qwen3.8 Cyber | `27b`, IQ4_XS imatrix | ручной non-MTP импорт в изолированный Lab; benchmark pending | `cyjin-yl/Qwen3.8-27B-Uncensored-Cyber-agentic-imatrix-GGUF` |

Проверенные SHA-256:

```text
whisper-cublas-12.4.0-bin-x64.zip
c1b17166e1e31a91cc8e9c1f910d3785e3ce757bb2958bf9dce13fdb4880005f

ggml-large-v3-turbo-q5_0.bin
394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2

ollama-windows-amd64.zip
a1d11d46a944f9c7521f5e9a3a5db51cd3365401da627d96c204698fc6914ff9

piper_windows_amd64-2023.11.14-2.zip
f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea

ru_RU-denis-medium.onnx (MD5 из official voices.json)
76c2f14e521fef3ed574f97ad492728e
```

Digest архивов получен из официальных GitHub Releases. Digest Whisper-модели получен
из LFS metadata официального Hugging Face repository. Piper archive получен из официального
MIT release и дополнительно проверен Microsoft Defender; threats не обнаружены. Voice model
совпадает с digest официального `voices.json`, а его dataset имеет CC0. Ollama дополнительно
выполнила собственную SHA-256 verification каждого model blob перед записью manifest.

## Каталоги

```text
Eclipse AI Runtime\
├── downloads\             # проверенные portable archives
├── models\
│   ├── ollama\            # 27B model store, около 16.52 GiB
│   ├── qwen3-tts\         # установленный Studio/Lab TTS benchmark
│   └── whisper\           # STT model, около 548 MiB
├── ollama\                # portable Ollama runtime
├── python\                # portable CPython; системный PATH не изменяется
├── temp\                  # только технические runtime logs
├── tools\uv\              # portable Python/package manager
├── tts\
│   ├── piper\             # основной быстрый TTS + CC0 Russian voices
│   └── qwen3-tts\.venv\   # изолированный экспериментальный runtime
└── whisper\Release\       # CUDA whisper.cpp binaries
```

Речь, транскрипт и production TTS обрабатываются в памяти. Ultron не включает `--save-audio`,
не создаёт WAV-файлы и не пишет распознанный текст в runtime logs. Piper отдаёт bounded WAV
через trusted IPC; renderer не управляет executable, model path или arguments. Пути и параметры
задаёт доверенный Electron main process.

## Как пользоваться голосом

1. Открыть основной режим `Альтрон`.
2. Нажать `Включить живой разговор` один раз.
3. Говорить обычным голосом после состояния `Слушаю`. Во время ответа микрофон остаётся
   запущенным локально, но новые транскрипты игнорируются; после TTS действует echo guard.
4. Новая человеческая реплика запускает следующий ответ без повторного клика. Первая законченная
   фраза ответа начинает звучать до завершения всей генерации.
5. Остановить живой режим основной кнопкой или пунктом tray. Для разовой реплики доступна
   отдельная кнопка `Сказать одну фразу`.
6. Для проверяемого действия открыть `Operator`, продиктовать команду и отдельно проверить
   план, diff, approval и receipt.

One-shot capture ограничен 12 секундами. Живой режим использует один persistent Whisper process
с фиксированными 6-секундными окнами, bounded stdout, duplicate suppression и явными
start/pause/resume/stop IPC. Он не включается при запуске приложения: standing authorization и
wake word отсутствуют. Активный микрофон виден на экране и в tray.

На Windows capture-процесс фиксирует SDL backend `directsound`. Это обходит подтверждённую
несовместимость стандартного WASAPI backend с USB-микрофоном FIFINE и согласует требуемый
Whisper-формат `16 kHz / mono`, не меняя системные настройки устройства.

## Local model profiles

| Профиль | Endpoint | Полномочия |
| --- | --- | --- |
| Primary voice | `127.0.0.1:11434` | закреплённый `qwen3:8b`, только текстовый ответ без tools |
| Ultron Lab | `127.0.0.1:11435` | research-инвентарь, только completion без tools |

Portable Lab server запускается только на loopback. Он использует model store на `E:` и
не слушает LAN. Ни одна 27B-модель не выбирается голосовым интерфейсом: живой ассистент
всегда использует primary `qwen3:8b`.

## TTS latency evidence

На этой рабочей станции проверены два локальных контура:

| Контур | Тест | Wall time | Audio | Решение |
| --- | --- | ---: | ---: | --- |
| Piper Denis medium | русская реплика | 0.67 сек | 5.39 сек | production default |
| Qwen3-TTS 0.6B | warm короткая реплика | 13.21 сек | 2.96 сек | Studio/Lab only |
| Qwen3-TTS 0.6B | первая реплика | около 62 сек | 9.04 сек | исключён из real-time path |

Qwen3-TTS технически работает на RTX 4060 Ti через CUDA, но текущий Windows SDPA runtime не
соответствует требованию живого диалога. Модель и venv остаются на `E:` для дальнейшего
профилирования; приложение их не запускает автоматически и не разрешает loopback-порт в CSP.
Piper загружает фиксированный CC0 voice model на каждую реплику и возвращает аудио через IPC;
при его отсутствии используется системный Windows TTS fallback.

HuiHui Qwen3.8 abliterated не является доверенным planner или policy engine. Ей не
передаются shell, filesystem, network tools, secrets, MCP, install, deploy или operator
execute. Результаты требуют ручной проверки. Снятие model-level отказов не ослабляет
детерминированный Policy Gate Eclipse Ultron.

Qwen3.8 Cyber подключается тем же безопасным Lab-контуром через
`scripts/install-qwen38-cyber.ps1`. Скрипт использует non-MTP GGUF, проверяет опубликованный
SHA-256 и импортирует его под alias `qwen3.8-cyber-iq4xs:27b`. Vision projector в HF-репозитории
не входит, поэтому текущая интеграция поддерживает только текст. Модель не выбирается для live
voice и не получает tools, shell, filesystem, network, secrets, MCP, install, deploy или execute.

## Hardware contract этой рабочей станции

- GPU: RTX 4060 Ti 16 GiB;
- RAM: 64 GiB;
- фактический model file: 15.65 GiB Q4_K_M;
- план размещения Ollama: примерно 11.3 GiB GPU + 4.7 GiB host memory;
- рабочий context для pilot: 8K, а не рекламные 262K;
- `OLLAMA_LOAD_TIMEOUT=15m` для первого чтения модели с диска E:;
- `OLLAMA_KEEP_ALIVE=5m`, чтобы не удерживать 27B-модель постоянно.

Измеренный pilot с `num_ctx=8192`, `think=false`, `num_predict<=64`:

| Режим | Load | Generation | Total |
| --- | ---: | ---: | ---: |
| cold start | 233.3 сек | 8.2 ток/с | 254.56 сек |
| warm request | 0 сек | 6.98 ток/с | 5.07 сек |

Вывод: модель технически работает на текущем железе, но почти четырёхминутный cold start
исключает её из default-профиля. Она остаётся Lab-моделью для отдельного сравнительного
benchmark. Для живой голосовой беседы основной `qwen3:8b` существенно практичнее.

Отдельный evidence review OrcaRouter/AEON, ограничения FP8/BF16 и правила promotion:
[Ultron model registry](ultron-model-registry.md).

## Security и ограничения

- никаких OAuth, облачной передачи аудио или standing authorisations;
- continuous capture включается только явным действием и останавливается одной кнопкой/tray/exit;
- никакого автоматического выбора abliterated модели по умолчанию;
- endpoint фиксирован на loopback и отдельно разрешён в CSP;
- model output считается недоверенным текстом;
- runtime archives и модельные веса не включаются в Git или installer;
- публикация installer остаётся заблокированной до signing и provenance review.

## Rollback

Удаление только Lab-модели выполняется portable Ollama с теми же `OLLAMA_HOST` и
`OLLAMA_MODELS`, после чего UI возвращается на `Qwen 3 8B`.

Rollback TTS выполняется без удаления runtime: отсутствие Piper автоматически возвращает Windows
TTS fallback. Полный rollback требует закрыть Eclipse Ultron, остановить только process, который
слушает `127.0.0.1:11435`, и удалить точный каталог `Eclipse AI Runtime`. Каталоги Eclipse Ultron,
репозитории, primary Ollama и данные пользователя при этом не затрагиваются.
