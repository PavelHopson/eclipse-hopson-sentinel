# Sentinel и Ollama: локальные модели

В репозитории есть два разных контура:

- **Sentinel Core** — coding-agent, который может получить tools и полномочия из текущей сессии;
- **Eclipse Ultron Lab** — изолированный текстовый чат на loopback, без tools, shell, filesystem, network, secrets, install, deploy и Operator execute.

Модели с пометками *uncensored*, *abliterated* или *cyber/offensive-security* считаются недоверенными генераторами текста. Новую Qwen3.8 Cyber подключаем только к Lab. Не указывайте её как обычный OPENAI_MODEL в Sentinel Core, пока не появится отдельный проверенный capability profile и набор ограничений для tools.

## Qwen3.8 Cyber IQ4_XS · Lab

Источник — [cyjin-yl/Qwen3.8-27B-Uncensored-Cyber-agentic-imatrix-GGUF](https://huggingface.co/cyjin-yl/Qwen3.8-27B-Uncensored-Cyber-agentic-imatrix-GGUF).

Для обычного GGUF/Ollama-импорта используется non-MTP-файл:

```
Qwen3.8-27B-Uncensored-Cyber-IQ4_XS-imatrix-fromq8.gguf
Размер: около 14.96 GiB
SHA-256: d11d28b9b253fb7fc9de277a46af5bbd790c000d6bfdfe5648fd7b62ec2560b7
```

Файл plus-mtp предназначен для runtime с поддержкой grafted MTP-тензоров и в этот импорт не входит. Vision projector также является отдельным артефактом; текущий Ultron Chat принимает только текст.

### Импорт в изолированный Lab

Убедитесь, что portable Lab Ollama запущен на 127.0.0.1:11435, затем из корня репозитория выполните:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-qwen38-cyber.ps1
```

Скрипт:

1. скачивает фиксированный non-MTP-файл с Hugging Face;
2. проверяет SHA-256 до импорта;
3. создаёт Ollama Modelfile с num_ctx 8192 и num_predict 4096;
4. создаёт alias qwen3.8-cyber-iq4xs:27b через Lab endpoint (каталог store принадлежит уже запущенному серверу);
5. не запускается автоматически из Electron и не кладёт модельные веса в Git или installer.

Если модель не импортируется, проверьте версию Ollama и выполните ollama show qwen3.8-cyber-iq4xs:27b. IQ4_XS не следует считать совместимой с любой старой сборкой только по расширению .gguf.

### Проверка

```powershell
$env:OLLAMA_HOST = "127.0.0.1:11435"
curl.exe http://127.0.0.1:11435/api/tags

curl.exe http://127.0.0.1:11435/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer ollama" `
  -d '{"model":"qwen3.8-cyber-iq4xs:27b","messages":[{"role":"user","content":"Ответь OK."}],"stream":false,"max_tokens":16}'
```

Начинайте с num_ctx=8192. Заявленные 262K — архитектурный/production-результат из карточки модели для FastLLM на V100, а не безопасный default для RTX 4060 Ti. Перед повышением контекста зафиксируйте cold start, warm latency, tokens/sec, RAM/VRAM и отсутствие OOM.

## Sentinel Core: обычный локальный профиль

Для Core используйте модель, которую вы отдельно признали доверенной для текущего набора tools, например:

```powershell
$env:CLAUDE_CODE_USE_OPENAI = "1"
$env:OPENAI_BASE_URL = "http://127.0.0.1:11434/v1"
$env:OPENAI_API_KEY = "ollama"
$env:OPENAI_MODEL = "qwen2.5-coder:7b"

sentinel
```

Обычный OpenAI-compatible shim пересылает schemas tools в локальный endpoint. Поэтому перевод недоверенной Qwen3.8 Cyber в Core — это отдельная задача с явным capability profile, fail-closed ограничением tools и аудитом; эта интеграция этого не включает.

## Откат

Модель можно удалить из Lab store через Ollama после остановки активного запроса. Голосовой профиль не меняется: live voice по-прежнему закреплён за qwen3:8b на 127.0.0.1:11434.

Подробные ограничения и статус сравнения находятся в [реестре моделей](ultron-model-registry.md).
