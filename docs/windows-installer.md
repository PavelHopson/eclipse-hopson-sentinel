# Установщик Sentinel для Windows

В `Eclipse Hopson Sentinel` уже включён первый установочный flow для Windows.

## Цель

Дать пользователю повторяемый путь установки с минимальным количеством ручных шагов.

## Что делает установщик

- проверяет наличие `node`
- проверяет наличие `bun`
- запускает `bun install`
- запускает `bun run build`
- создаёт `sentinel.cmd`
- создаёт `sentinel-voice.cmd`
- добавляет каталог с launcher-ами в пользовательский `PATH`

## Запуск

Только предварительная проверка:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1 -DryRun
```

Реальная установка:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1
```

## Куда устанавливаются launcher-ы

Launcher-ы создаются в:

```text
%LOCALAPPDATA%\EclipseHopsonSentinel\bin
```

## Примечания

- после установки откройте новый терминал, чтобы обновлённый `PATH` начал работать
- текущий установщик рассчитан на локальную копию репозитория
- в следующих версиях этот flow можно превратить в полноценный packaged installer
