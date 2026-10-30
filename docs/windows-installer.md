# Установщик Eclipse Ultron для Windows

Для Windows поддерживаются два разных сценария: полноценное desktop-приложение и
developer-установка CLI launcher-ов из локальной копии репозитория.

## Desktop installer

Electron desktop собирается в assisted NSIS installer. Пользователь видит область
установки, при необходимости меняет каталог и затем получает ярлыки Eclipse Ultron.
В персональной Windows-сборке при наличии диска `E:` путь по умолчанию —
`E:\ADMIN_HOPSON_PC\Программы\Eclipse Ultron`. Если диска нет, NSIS сохраняет
стандартный путь, поэтому installer остаётся восстанавливаемым на другой машине.

Визуальная поверхность использует собственный Eclipse Forge contract:

- black graphite background `#050507` / `#0B0D10`
- signal crimson `#FF304A`
- silver text and controls `#F3F5F7` / `#C7CDD6`
- оригинальный eclipse mark без внешних изображений и шрифтов
- русская и английская локализация NSIS

Сборка:

```powershell
cd .\dashboard
npm ci
npm run electron:build
```

Команда сначала воспроизводимо генерирует BMP/ICO, затем выполняет production build и
упаковывает уже установленный lockfile-pinned Electron runtime. Готовый файл:

```text
dashboard\release\Eclipse-Ultron-<version>-Setup.exe
```

### Первый запуск desktop-приложения

При первом запуске Eclipse Ultron автоматически показывает встроенный «Быстрый старт». Он описывает
только доступные в текущей версии сценарии и содержит прямые переходы:

1. открыть read-only диагностику и убедиться, что E-storage, Whisper, Piper и `qwen3:8b` готовы;
2. перейти на экран «Альтрон», явно включить живой разговор и проверить одну короткую реплику;
3. для действий открыть Operator: продиктовать команду, проверить план/diff, дать одноразовый
   approval и изучить receipt; для кода использовать отдельный Developer Mode с теми же gates.

После закрытия руководство не мешает следующим запускам. Повторно открыть его можно через
`Как пользоваться` в боковом меню или через кнопку с книгой на узком экране. Закрытие по `Escape`,
возврат фокуса и удержание `Tab` внутри диалога входят в desktop accessibility contract.

Переименование desktop-продукта не создаёт новый пустой Chromium profile: Ultron продолжает
использовать стабильный каталог данных `Eclipse Sentinel` и прежние storage-ключи для локальных
диалогов и выбранной модели. Это намеренная migration boundary; менять её можно только отдельной
проверенной миграцией с backup и rollback.

Ultron Core в текущей версии не получает доступ к записи файлов, shell, сети, установке,
deploy или секретам. Руководство не должно обещать эти возможности до появления отдельного
проверенного capability contract.

### Голосовой ввод

Кнопки one-shot и `Включить живой разговор` доступны только в Windows desktop-приложении. Live
режим удерживает один локальный Whisper process до явной остановки; one-shot ограничен 12 секундами. Runtime и
модель находятся в `E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime`; системный Windows
Speech Capability не требуется. Фоновая запись, сохранение аудио, запись транскрипта в logs,
wake word и передача аудио в облако отсутствуют. Browser preview намеренно не запрашивает
разрешение на микрофон. При отсутствии runtime, модели или микрофона интерфейс возвращает
отдельную безопасную ошибку. На voice-first экране нет text composer; Operator сохраняет отдельный
review-first путь для диктовки, плана и ручного подтверждения.

Portable runtime и веса не включаются в installer: это сохраняет обозримый размер `.exe` и
позволяет обновлять приложение без повторного копирования 17+ ГБ моделей. Проверенные версии,
SHA-256 и rollback описаны в [`ultron-local-ai-runtime.md`](ultron-local-ai-runtime.md).

Проверить только бренд-ассеты:

```powershell
cd .\dashboard
npm run assets:brand
```

NSIS ожидает `installerSidebar.bmp` размером `164×314`, `installerHeader.bmp`
размером `150×57` и валидный `256×256` ICO. Эти инварианты покрыты тестом
`scripts/dashboard-branding.test.mjs`.

## Developer CLI install

Старый PowerShell flow остаётся только для локальной CLI-разработки. Предварительная
проверка:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1 -DryRun
```

Локальная установка launcher-ов:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-sentinel-windows.ps1
```

Они создаются в:

```text
%LOCALAPPDATA%\EclipseHopsonSentinel\bin
```

## Release safety

- локальный installer остаётся неподписанным, пока не настроен Windows code-signing certificate
- неподписанный `.exe` нельзя объявлять публичным production release
- перед публикацией также требуется завершить repository provenance/redistribution review
- секреты Office producer не включаются в installer и provision-ятся отдельно через Windows Credential Manager
