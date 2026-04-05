# Sentinel Config Health

`Sentinel Config Health` — это детерминированный локальный аудит, вдохновлённый самыми сильными идеями из репозиториев вроде `caliber-ai-org/ai-setup`, но адаптированный под `Eclipse Hopson Sentinel`.

## Цель

Быстро отвечать на вопросы:

- достаточно ли целостен пользовательский слой Sentinel для повседневной работы
- присутствуют ли ожидаемые AI/operator config files
- существуют ли voice-related setup файлы
- движется ли репозиторий к профессиональному operator baseline

## Запуск

```powershell
node .\scripts\sentinel-config-health.mjs
```

## Что сейчас проверяется

- базовые файлы проекта: `README.md`, `LICENSE`, `SECURITY.md`
- документация по bridge и voice
- voice helper scripts
- наличие launcher-ов
- наличие roadmap и engineering log
- экспорт launcher-ов в `package.json`

## Почему это важно

Этот аудит даёт `Sentinel` собственный deterministic health check вместо чисто ручной проверки.

Это первый практический слой, перенесённый из лучших идей `ai-setup`:

- детерминированный scoring
- проверки полноты конфигурации
- без LLM
- полностью локальная оценка

## Что будет дальше

- freshness checks на основе git history
- проверки корректности путей и path grounding
- проверки bridge/voice/session persistence
- runtime health checks
- сравнение score между ветками и состояниями
