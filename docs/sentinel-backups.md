# Sentinel Backups

`Sentinel Backups` — это первый локальный слой backup discipline для `Eclipse Hopson Sentinel`.

Он вдохновлён самыми полезными operational safety идеями из `ai-setup`, но реализован как простой локальный snapshot-механизм для поверхностей самого Sentinel.

## Цель

Создавать быстрые и детерминированные локальные snapshot-ы перед более крупными изменениями в конфигурации, voice-слое и operator-сценариях.

## Запуск

Создать backup:

```powershell
node .\scripts\sentinel-backup.mjs create
```

Или:

```powershell
npm run backup:create
```

## Что сейчас попадает в backup

- `README.md`
- `SECURITY.md`
- `package.json`
- `docs/`
- `bin/sentinel`
- `bin/sentinel-voice`
- voice-скрипты
- скрипт `config health`
- состояние `.sentinel/bridge`, если оно уже существует

## Где хранятся backup-ы

Backup-ы пишутся в:

```text
.sentinel/backups/
```

Каждый backup получает собственную timestamp-папку и `manifest.json`.

## Почему это важно

Этот слой даёт Sentinel начало нормальной safety discipline:

- snapshot перед рискованными изменениями
- только локальное хранение
- прозрачные файлы
- простая ручная проверка и восстановление

## Что будет дальше

- backup index и дополнительные метаданные
- отдельная restore-команда с более безопасным UX
- pre-change backup flow перед high-impact изменениями конфигов
- проверки на регрессию score перед принятием сгенерированных изменений
