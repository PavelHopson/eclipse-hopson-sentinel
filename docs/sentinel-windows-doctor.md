# Sentinel Windows Doctor

`Sentinel Windows Doctor` — локальная проверка базовой защиты Windows. Она объясняет состояние
компьютера простым языком и предлагает один безопасный следующий шаг. Скрипт ничего не
устанавливает, не включает и не выключает, не требует API-ключей и не отправляет данные в сеть.

## Быстрый запуск

Из корня репозитория:

```powershell
npm run doctor:windows
```

Для machine-readable результата:

```powershell
npm run doctor:windows:json
```

Для локального JSON-файла:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/sentinel-windows-doctor.ps1 -Out reports/windows-doctor.json
```

`-ExecutionPolicy Bypass` действует только для этого процесса. Скрипт не меняет постоянную
execution policy Windows.

## Что проверяется

- версия Windows и build;
- Secure Boot и TPM;
- Microsoft Defender и возраст сигнатур;
- Domain, Private и Public профили Windows Firewall;
- User Account Control;
- защита системного диска BitLocker/Device Encryption;
- устаревший SMBv1;
- входящий Remote Desktop;
- доступность Windows Update;
- необходимость перезагрузки после обновлений;
- заданная policy диагностических данных;
- постоянные PowerShell execution policies.

Статусы имеют буквальный смысл:

- `pass` — безопасная базовая настройка обнаружена;
- `warn` — настройка увеличивает риск или требует внимания;
- `info` — контекст, который нельзя честно считать уязвимостью;
- `unknown` — Windows не отдала данные, команда недоступна или нужны другие права.

`unknown` не превращается в ложный `fail`. Например, BitLocker API может отсутствовать в
редакции Windows Home, а Secure Boot — быть недоступным на legacy BIOS.

## Privacy и security boundary

Отчёт не содержит имя пользователя, hostname, серийные номера, recovery keys, токены, пути к
профилю или содержимое файлов. Он не запускает исправления и не использует сетевые запросы.
Запись на диск происходит только при явном `-Out` и выполняется через временный файл.

Рекомендации не нужно применять вслепую. Перед изменением UEFI, TPM, BitLocker, RDP или SMB
следует проверить совместимость, доступ к recovery keys и требования организации. Здесь нет
кнопки «исправить всё»: каждое изменение остаётся отдельным осознанным действием пользователя.

## Проверка контракта

```powershell
npm run doctor:windows:selftest
```

Self-test использует только синтетические результаты и не обращается к настройкам компьютера.
Windows CI запускает его при pull request и push в `main`.

## Что взято из внешних идей

От `privacy.sexy` и `NtWarden` взята только продуктовая идея понятного workstation audit.
Исходный код не импортировался. Sentinel не устанавливает kernel drivers, network filters,
твикеры или сторонние скрипты и не обещает автоматическое «ускорение» или «максимальную
приватность» без доказательств.
