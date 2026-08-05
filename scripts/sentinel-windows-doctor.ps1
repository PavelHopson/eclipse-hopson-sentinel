[CmdletBinding()]
param(
  [switch]$Json,
  [string]$Out,
  [switch]$SelfTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:SchemaVersion = 'windows-doctor-v1'

function New-DoctorCheck {
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][ValidateSet('pass', 'warn', 'info', 'unknown')][string]$Status,
    [Parameter(Mandatory = $true)][string]$Summary,
    [string]$Evidence,
    [string]$NextAction
  )

  [pscustomobject][ordered]@{
    id = $Id
    title = $Title
    status = $Status
    summary = $Summary
    evidence = $Evidence
    nextAction = $NextAction
  }
}

function Get-PropertyValue {
  param(
    [Parameter(Mandatory = $true)]$InputObject,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $property = $InputObject.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }

  return $property.Value
}

function Get-WindowsVersionCheck {
  if ($env:OS -ne 'Windows_NT') {
    return New-DoctorCheck -Id 'windows_version' -Title 'Версия Windows' -Status 'unknown' `
      -Summary 'Эта проверка предназначена для Windows.' `
      -NextAction 'Запустите doctor в Windows PowerShell 5.1 или PowerShell 7.'
  }

  try {
    $version = [Environment]::OSVersion.Version
    $productName = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction Stop).ProductName
    return New-DoctorCheck -Id 'windows_version' -Title 'Версия Windows' -Status 'info' `
      -Summary 'Версия операционной системы определена.' `
      -Evidence ("{0}; build {1}" -f $productName, $version.Build)
  } catch {
    return New-DoctorCheck -Id 'windows_version' -Title 'Версия Windows' -Status 'unknown' `
      -Summary 'Не удалось безопасно определить версию Windows.' `
      -NextAction 'Проверьте версию вручную через winver.'
  }
}

function Get-SecureBootCheck {
  if (-not (Get-Command Confirm-SecureBootUEFI -ErrorAction SilentlyContinue)) {
    return New-DoctorCheck -Id 'secure_boot' -Title 'Secure Boot' -Status 'unknown' `
      -Summary 'Команда проверки Secure Boot недоступна.' `
      -NextAction 'Проверьте состояние Secure Boot в Windows Security или UEFI.'
  }

  try {
    if (Confirm-SecureBootUEFI -ErrorAction Stop) {
      return New-DoctorCheck -Id 'secure_boot' -Title 'Secure Boot' -Status 'pass' `
        -Summary 'Secure Boot включён.' -Evidence 'UEFI boot validation: enabled'
    }

    return New-DoctorCheck -Id 'secure_boot' -Title 'Secure Boot' -Status 'warn' `
      -Summary 'Secure Boot выключен.' `
      -NextAction 'Если устройство поддерживает UEFI, включите Secure Boot после проверки совместимости диска и загрузчика.'
  } catch {
    return New-DoctorCheck -Id 'secure_boot' -Title 'Secure Boot' -Status 'unknown' `
      -Summary 'Windows не разрешила определить состояние Secure Boot.' `
      -NextAction 'Проверьте Secure Boot вручную; не меняйте UEFI без резервной копии ключей восстановления.'
  }
}

function Get-TpmCheck {
  if (-not (Get-Command Get-Tpm -ErrorAction SilentlyContinue)) {
    return New-DoctorCheck -Id 'tpm' -Title 'TPM' -Status 'unknown' `
      -Summary 'Команда проверки TPM недоступна.' `
      -NextAction 'Откройте Windows Security → Device security и проверьте Security processor.'
  }

  try {
    $tpm = Get-Tpm -ErrorAction Stop
    $present = [bool](Get-PropertyValue -InputObject $tpm -Name 'TpmPresent')
    $ready = [bool](Get-PropertyValue -InputObject $tpm -Name 'TpmReady')

    if (-not $present) {
      return New-DoctorCheck -Id 'tpm' -Title 'TPM' -Status 'warn' `
        -Summary 'TPM не обнаружен.' `
        -NextAction 'Проверьте поддержку TPM 2.0 в UEFI и требования вашей версии Windows.'
    }

    if (-not $ready) {
      return New-DoctorCheck -Id 'tpm' -Title 'TPM' -Status 'warn' `
        -Summary 'TPM обнаружен, но не готов.' `
        -NextAction 'Откройте Windows Security → Security processor details; не очищайте TPM без сохранённых recovery keys.'
    }

    return New-DoctorCheck -Id 'tpm' -Title 'TPM' -Status 'pass' `
      -Summary 'TPM обнаружен и готов.' -Evidence 'TPM present: yes; ready: yes'
  } catch {
    return New-DoctorCheck -Id 'tpm' -Title 'TPM' -Status 'unknown' `
      -Summary 'Не удалось прочитать состояние TPM.' `
      -NextAction 'Проверьте Security processor в Windows Security.'
  }
}

function Get-DefenderCheck {
  if (-not (Get-Command Get-MpComputerStatus -ErrorAction SilentlyContinue)) {
    return New-DoctorCheck -Id 'defender' -Title 'Microsoft Defender' -Status 'unknown' `
      -Summary 'Microsoft Defender status API недоступен.' `
      -NextAction 'Проверьте активный антивирус в Windows Security → Virus & threat protection.'
  }

  try {
    $status = Get-MpComputerStatus -ErrorAction Stop
    $antivirusEnabled = [bool](Get-PropertyValue -InputObject $status -Name 'AntivirusEnabled')
    $realtimeEnabled = [bool](Get-PropertyValue -InputObject $status -Name 'RealTimeProtectionEnabled')
    $updatedAt = Get-PropertyValue -InputObject $status -Name 'AntivirusSignatureLastUpdated'
    $signatureAge = $null
    if ($null -ne $updatedAt) {
      $signatureAge = [math]::Max(0, [math]::Floor(((Get-Date) - [datetime]$updatedAt).TotalDays))
    }

    if (-not $antivirusEnabled -or -not $realtimeEnabled) {
      return New-DoctorCheck -Id 'defender' -Title 'Microsoft Defender' -Status 'warn' `
        -Summary 'Антивирус или защита в реальном времени выключены.' `
        -Evidence ("Antivirus: {0}; real-time: {1}" -f $antivirusEnabled, $realtimeEnabled) `
        -NextAction 'Откройте Windows Security и включите защиту либо убедитесь, что её заменяет доверенный антивирус.'
    }

    if ($null -ne $signatureAge -and $signatureAge -gt 7) {
      return New-DoctorCheck -Id 'defender' -Title 'Microsoft Defender' -Status 'warn' `
        -Summary 'Защита включена, но антивирусные сигнатуры старше семи дней.' `
        -Evidence ("Signature age: {0} day(s)" -f $signatureAge) `
        -NextAction 'Запустите Windows Update или обновление защиты в Windows Security.'
    }

    $signatureEvidence = if ($null -eq $signatureAge) { 'signature age unavailable' } else { "signature age: $signatureAge day(s)" }
    return New-DoctorCheck -Id 'defender' -Title 'Microsoft Defender' -Status 'pass' `
      -Summary 'Антивирус и защита в реальном времени включены.' `
      -Evidence ("Real-time: enabled; {0}" -f $signatureEvidence)
  } catch {
    return New-DoctorCheck -Id 'defender' -Title 'Microsoft Defender' -Status 'unknown' `
      -Summary 'Не удалось прочитать состояние антивируса.' `
      -NextAction 'Проверьте Virus & threat protection вручную.'
  }
}

function Get-FirewallCheck {
  if (-not (Get-Command Get-NetFirewallProfile -ErrorAction SilentlyContinue)) {
    return New-DoctorCheck -Id 'firewall' -Title 'Windows Firewall' -Status 'unknown' `
      -Summary 'Команда проверки Firewall недоступна.' `
      -NextAction 'Проверьте Domain, Private и Public profiles в Windows Security.'
  }

  try {
    $profiles = @(Get-NetFirewallProfile -ErrorAction Stop)
    $disabled = @($profiles | Where-Object { -not [bool]$_.Enabled } | ForEach-Object { $_.Name })
    if ($disabled.Count -gt 0) {
      return New-DoctorCheck -Id 'firewall' -Title 'Windows Firewall' -Status 'warn' `
        -Summary 'Один или несколько профилей Firewall выключены.' `
        -Evidence ("Disabled profiles: {0}" -f ($disabled -join ', ')) `
        -NextAction 'Откройте Windows Security → Firewall & network protection и проверьте выключенные профили.'
    }

    return New-DoctorCheck -Id 'firewall' -Title 'Windows Firewall' -Status 'pass' `
      -Summary 'Все доступные профили Firewall включены.' `
      -Evidence ("Enabled profiles: {0}" -f (($profiles | ForEach-Object { $_.Name }) -join ', '))
  } catch {
    return New-DoctorCheck -Id 'firewall' -Title 'Windows Firewall' -Status 'unknown' `
      -Summary 'Не удалось прочитать профили Firewall.' `
      -NextAction 'Проверьте Firewall & network protection вручную.'
  }
}

function Get-UacCheck {
  try {
    $policy = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction Stop
    $enabled = [int](Get-PropertyValue -InputObject $policy -Name 'EnableLUA')
    if ($enabled -eq 1) {
      return New-DoctorCheck -Id 'uac' -Title 'User Account Control' -Status 'pass' `
        -Summary 'UAC включён.' -Evidence 'EnableLUA: 1'
    }

    return New-DoctorCheck -Id 'uac' -Title 'User Account Control' -Status 'warn' `
      -Summary 'UAC выключен.' -Evidence 'EnableLUA: 0' `
      -NextAction 'Включите UAC через Control Panel после проверки совместимости старых приложений.'
  } catch {
    return New-DoctorCheck -Id 'uac' -Title 'User Account Control' -Status 'unknown' `
      -Summary 'Не удалось прочитать политику UAC.' `
      -NextAction 'Проверьте Change User Account Control settings вручную.'
  }
}

function Get-BitLockerCheck {
  if (-not (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue)) {
    return New-DoctorCheck -Id 'bitlocker' -Title 'Шифрование системного диска' -Status 'unknown' `
      -Summary 'BitLocker API недоступен в этой редакции Windows или с текущими правами.' `
      -NextAction 'Проверьте Device encryption или Manage BitLocker вручную.'
  }

  try {
    $volume = Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction Stop
    $protection = [string](Get-PropertyValue -InputObject $volume -Name 'ProtectionStatus')
    if ($protection -eq 'On' -or $protection -eq '1') {
      return New-DoctorCheck -Id 'bitlocker' -Title 'Шифрование системного диска' -Status 'pass' `
        -Summary 'Защита системного диска включена.' -Evidence 'Protection status: On'
    }

    return New-DoctorCheck -Id 'bitlocker' -Title 'Шифрование системного диска' -Status 'warn' `
      -Summary 'Защита системного диска не включена.' -Evidence ("Protection status: {0}" -f $protection) `
      -NextAction 'Оцените включение Device encryption или BitLocker и заранее сохраните recovery key.'
  } catch {
    return New-DoctorCheck -Id 'bitlocker' -Title 'Шифрование системного диска' -Status 'unknown' `
      -Summary 'Не удалось прочитать состояние шифрования системного диска.' `
      -NextAction 'Проверьте Device encryption или Manage BitLocker вручную.'
  }
}

function Get-SmbV1Check {
  if (-not (Get-Command Get-SmbServerConfiguration -ErrorAction SilentlyContinue)) {
    return New-DoctorCheck -Id 'smb_v1' -Title 'SMBv1' -Status 'unknown' `
      -Summary 'SMB configuration API недоступен.' `
      -NextAction 'Проверьте Windows Features → SMB 1.0/CIFS File Sharing Support.'
  }

  try {
    $configuration = Get-SmbServerConfiguration -ErrorAction Stop
    $enabled = [bool](Get-PropertyValue -InputObject $configuration -Name 'EnableSMB1Protocol')
    if ($enabled) {
      return New-DoctorCheck -Id 'smb_v1' -Title 'SMBv1' -Status 'warn' `
        -Summary 'Устаревший протокол SMBv1 включён.' -Evidence 'SMBv1 server protocol: enabled' `
        -NextAction 'Если нет legacy-зависимостей, отключите SMBv1 через Windows Features после отдельной проверки.'
    }

    return New-DoctorCheck -Id 'smb_v1' -Title 'SMBv1' -Status 'pass' `
      -Summary 'SMBv1 выключен.' -Evidence 'SMBv1 server protocol: disabled'
  } catch {
    return New-DoctorCheck -Id 'smb_v1' -Title 'SMBv1' -Status 'unknown' `
      -Summary 'Не удалось прочитать состояние SMBv1.' `
      -NextAction 'Проверьте SMB 1.0/CIFS File Sharing Support вручную.'
  }
}

function Get-RemoteDesktopCheck {
  try {
    $policy = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' -ErrorAction Stop
    $denyConnections = [int](Get-PropertyValue -InputObject $policy -Name 'fDenyTSConnections')
    if ($denyConnections -eq 1) {
      return New-DoctorCheck -Id 'remote_desktop' -Title 'Remote Desktop' -Status 'pass' `
        -Summary 'Входящие Remote Desktop подключения выключены.' -Evidence 'RDP inbound: disabled'
    }

    return New-DoctorCheck -Id 'remote_desktop' -Title 'Remote Desktop' -Status 'warn' `
      -Summary 'Входящие Remote Desktop подключения включены.' -Evidence 'RDP inbound: enabled' `
      -NextAction 'Если RDP не нужен, отключите его. Если нужен — ограничьте доступ Firewall/VPN и включите NLA.'
  } catch {
    return New-DoctorCheck -Id 'remote_desktop' -Title 'Remote Desktop' -Status 'unknown' `
      -Summary 'Не удалось прочитать состояние Remote Desktop.' `
      -NextAction 'Проверьте Settings → System → Remote Desktop.'
  }
}

function Get-WindowsUpdateCheck {
  try {
    $service = Get-CimInstance -ClassName Win32_Service -Filter "Name='wuauserv'" -ErrorAction Stop
    if ($null -eq $service) {
      throw 'Service unavailable'
    }

    $startMode = [string](Get-PropertyValue -InputObject $service -Name 'StartMode')
    if ($startMode -eq 'Disabled') {
      return New-DoctorCheck -Id 'windows_update' -Title 'Windows Update' -Status 'warn' `
        -Summary 'Служба Windows Update отключена.' -Evidence 'Startup mode: Disabled' `
        -NextAction 'Верните службе Windows Update режим Manual или Automatic и проверьте корпоративную policy.'
    }

    return New-DoctorCheck -Id 'windows_update' -Title 'Windows Update' -Status 'pass' `
      -Summary 'Служба Windows Update не отключена.' -Evidence ("Startup mode: {0}" -f $startMode)
  } catch {
    return New-DoctorCheck -Id 'windows_update' -Title 'Windows Update' -Status 'unknown' `
      -Summary 'Не удалось прочитать конфигурацию Windows Update.' `
      -NextAction 'Откройте Settings → Windows Update и проверьте доступность обновлений.'
  }
}

function Get-PendingRestartCheck {
  try {
    $pending = @()
    if (Test-Path -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') {
      $pending += 'Windows Update'
    }
    if (Test-Path -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') {
      $pending += 'Component servicing'
    }

    $sessionManager = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -ErrorAction Stop
    $renameOperations = Get-PropertyValue -InputObject $sessionManager -Name 'PendingFileRenameOperations'
    if ($null -ne $renameOperations) {
      $pending += 'File operations'
    }

    if ($pending.Count -gt 0) {
      return New-DoctorCheck -Id 'pending_restart' -Title 'Ожидаемая перезагрузка' -Status 'warn' `
        -Summary 'Windows ожидает перезагрузку для завершения изменений.' `
        -Evidence ("Pending sources: {0}" -f ($pending -join ', ')) `
        -NextAction 'Сохраните работу и выполните обычную перезагрузку в удобное время.'
    }

    return New-DoctorCheck -Id 'pending_restart' -Title 'Ожидаемая перезагрузка' -Status 'pass' `
      -Summary 'Признаки обязательной перезагрузки не найдены.'
  } catch {
    return New-DoctorCheck -Id 'pending_restart' -Title 'Ожидаемая перезагрузка' -Status 'unknown' `
      -Summary 'Не удалось полностью проверить признаки ожидаемой перезагрузки.' `
      -NextAction 'Проверьте Windows Update и перезагрузите компьютер, если обновления этого требуют.'
  }
}

function Get-TelemetryPolicyCheck {
  try {
    $path = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection'
    if (-not (Test-Path -LiteralPath $path)) {
      return New-DoctorCheck -Id 'telemetry_policy' -Title 'Диагностические данные' -Status 'info' `
        -Summary 'Явная telemetry policy не задана; применяются настройки Windows.' `
        -NextAction 'При необходимости проверьте Settings → Privacy & security → Diagnostics & feedback.'
    }

    $policy = Get-ItemProperty -LiteralPath $path -ErrorAction Stop
    $level = Get-PropertyValue -InputObject $policy -Name 'AllowTelemetry'
    if ($null -eq $level) {
      return New-DoctorCheck -Id 'telemetry_policy' -Title 'Диагностические данные' -Status 'info' `
        -Summary 'Telemetry policy key существует, но уровень не закреплён.' `
        -NextAction 'Проверьте Diagnostics & feedback или корпоративную policy.'
    }

    return New-DoctorCheck -Id 'telemetry_policy' -Title 'Диагностические данные' -Status 'info' `
      -Summary 'Уровень диагностических данных задан policy.' -Evidence ("AllowTelemetry: {0}" -f $level) `
      -NextAction 'Сверьте значение с требованиями вашей редакции Windows и организации.'
  } catch {
    return New-DoctorCheck -Id 'telemetry_policy' -Title 'Диагностические данные' -Status 'unknown' `
      -Summary 'Не удалось прочитать telemetry policy.' `
      -NextAction 'Проверьте Diagnostics & feedback вручную.'
  }
}

function Get-PowerShellPolicyCheck {
  try {
    $policies = @(Get-ExecutionPolicy -List -ErrorAction Stop | Where-Object {
      $_.Scope -in @('MachinePolicy', 'UserPolicy', 'LocalMachine', 'CurrentUser')
    })
    $unsafe = @($policies | Where-Object { $_.ExecutionPolicy -in @('Bypass', 'Unrestricted') })
    if ($unsafe.Count -gt 0) {
      $evidence = $unsafe | ForEach-Object { "{0}: {1}" -f $_.Scope, $_.ExecutionPolicy }
      return New-DoctorCheck -Id 'powershell_policy' -Title 'PowerShell execution policy' -Status 'warn' `
        -Summary 'В постоянной области задан Bypass или Unrestricted.' `
        -Evidence ($evidence -join '; ') `
        -NextAction 'Проверьте причину настройки и используйте RemoteSigned/AllSigned или корпоративную policy, если это совместимо.'
    }

    $visible = $policies | Where-Object { $_.ExecutionPolicy -ne 'Undefined' } | ForEach-Object {
      "{0}: {1}" -f $_.Scope, $_.ExecutionPolicy
    }
    $evidence = if (@($visible).Count -eq 0) { 'No persistent override' } else { $visible -join '; ' }
    return New-DoctorCheck -Id 'powershell_policy' -Title 'PowerShell execution policy' -Status 'pass' `
      -Summary 'Постоянный Bypass/Unrestricted не обнаружен.' -Evidence $evidence
  } catch {
    return New-DoctorCheck -Id 'powershell_policy' -Title 'PowerShell execution policy' -Status 'unknown' `
      -Summary 'Не удалось прочитать execution policy.' `
      -NextAction 'Выполните Get-ExecutionPolicy -List и проверьте постоянные области вручную.'
  }
}

function New-DoctorReport {
  param([Parameter(Mandatory = $true)][object[]]$Checks)

  $passCount = @($Checks | Where-Object { $_.status -eq 'pass' }).Count
  $warnCount = @($Checks | Where-Object { $_.status -eq 'warn' }).Count
  $unknownCount = @($Checks | Where-Object { $_.status -eq 'unknown' }).Count
  $infoCount = @($Checks | Where-Object { $_.status -eq 'info' }).Count
  $assessedCount = $passCount + $warnCount
  $score = if ($assessedCount -eq 0) { $null } else { [math]::Round(($passCount / $assessedCount) * 100) }
  $summaryStatus = if ($warnCount -gt 0) { 'attention' } elseif ($unknownCount -gt 0) { 'limited' } else { 'ok' }
  $firstAction = $Checks | Where-Object { $_.status -eq 'warn' -and $_.nextAction } | Select-Object -First 1
  if ($null -eq $firstAction) {
    $firstAction = $Checks | Where-Object { $_.status -eq 'unknown' -and $_.nextAction } | Select-Object -First 1
  }
  $recommendation = if ($null -eq $firstAction) { 'Критичных действий по результатам этой проверки не требуется.' } else { $firstAction.nextAction }

  [pscustomobject][ordered]@{
    schemaVersion = $script:SchemaVersion
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    mode = 'read_only'
    platform = [pscustomobject][ordered]@{
      name = if ($env:OS -eq 'Windows_NT') { 'Windows' } else { 'Unsupported' }
      powershell = $PSVersionTable.PSVersion.ToString()
    }
    summary = [pscustomobject][ordered]@{
      status = $summaryStatus
      total = $Checks.Count
      pass = $passCount
      warn = $warnCount
      unknown = $unknownCount
      info = $infoCount
      score = $score
      recommendation = $recommendation
    }
    privacy = [pscustomobject][ordered]@{
      includesSecrets = $false
      includesDeviceIdentity = $false
      changesSystem = $false
    }
    checks = $Checks
  }
}

function Get-WindowsDoctorReport {
  $checks = @(
    Get-WindowsVersionCheck
    Get-SecureBootCheck
    Get-TpmCheck
    Get-DefenderCheck
    Get-FirewallCheck
    Get-UacCheck
    Get-BitLockerCheck
    Get-SmbV1Check
    Get-RemoteDesktopCheck
    Get-WindowsUpdateCheck
    Get-PendingRestartCheck
    Get-TelemetryPolicyCheck
    Get-PowerShellPolicyCheck
  )

  return New-DoctorReport -Checks $checks
}

function Write-HumanReport {
  param([Parameter(Mandatory = $true)]$Report)

  Write-Output 'Eclipse Hopson Sentinel · Windows Doctor'
  Write-Output 'Режим: только чтение — настройки компьютера не изменяются.'
  Write-Output ''

  foreach ($check in $Report.checks) {
    $marker = switch ($check.status) {
      'pass' { '[OK]' }
      'warn' { '[!]' }
      'info' { '[i]' }
      default { '[?]' }
    }
    Write-Output ("{0} {1}: {2}" -f $marker, $check.title, $check.summary)
  }

  Write-Output ''
  Write-Output ("Итог: {0}; проверено {1}; предупреждений {2}; неизвестно {3}." -f `
    $Report.summary.status, $Report.summary.total, $Report.summary.warn, $Report.summary.unknown)
  Write-Output ("Следующий шаг: {0}" -f $Report.summary.recommendation)
}

function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $directory = [System.IO.Path]::GetDirectoryName($fullPath)
  if (-not [string]::IsNullOrWhiteSpace($directory)) {
    [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  }

  $tempPath = "{0}.{1}.tmp" -f $fullPath, ([guid]::NewGuid().ToString('N'))
  try {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempPath, $Content, $encoding)
    Move-Item -LiteralPath $tempPath -Destination $fullPath -Force
  } finally {
    if (Test-Path -LiteralPath $tempPath) {
      Remove-Item -LiteralPath $tempPath -Force
    }
  }

  return $fullPath
}

function Invoke-SelfTest {
  $checks = @(
    (New-DoctorCheck -Id 'ok' -Title 'OK' -Status 'pass' -Summary 'Pass'),
    (New-DoctorCheck -Id 'warn' -Title 'Warn' -Status 'warn' -Summary 'Warn' -NextAction 'Review warning'),
    (New-DoctorCheck -Id 'info' -Title 'Info' -Status 'info' -Summary 'Info'),
    (New-DoctorCheck -Id 'unknown' -Title 'Unknown' -Status 'unknown' -Summary 'Unknown')
  )
  $report = New-DoctorReport -Checks $checks

  $assertions = @(
    [pscustomobject]@{ Pass = $report.schemaVersion -eq $script:SchemaVersion; Label = 'schema version' }
    [pscustomobject]@{ Pass = $report.mode -eq 'read_only'; Label = 'read-only mode' }
    [pscustomobject]@{ Pass = $report.summary.status -eq 'attention'; Label = 'warning summary' }
    [pscustomobject]@{ Pass = $report.summary.pass -eq 1; Label = 'pass count' }
    [pscustomobject]@{ Pass = $report.summary.warn -eq 1; Label = 'warn count' }
    [pscustomobject]@{ Pass = $report.summary.unknown -eq 1; Label = 'unknown count' }
    [pscustomobject]@{ Pass = $report.summary.info -eq 1; Label = 'info count' }
    [pscustomobject]@{ Pass = $report.summary.score -eq 50; Label = 'assessed score' }
    [pscustomobject]@{ Pass = $report.summary.recommendation -eq 'Review warning'; Label = 'next action' }
    [pscustomobject]@{ Pass = -not $report.privacy.changesSystem; Label = 'privacy contract' }
  )

  foreach ($assertion in $assertions) {
    if (-not [bool]$assertion.Pass) {
      throw "Self-test failed: $($assertion.Label)"
    }
  }

  $serialized = $report | ConvertTo-Json -Depth 8
  $roundTrip = $serialized | ConvertFrom-Json
  if ($roundTrip.checks.Count -ne 4) {
    throw 'Self-test failed: JSON round trip'
  }

  Write-Output 'Windows Doctor self-test passed.'
}

if ($SelfTest) {
  Invoke-SelfTest
  exit 0
}

$report = Get-WindowsDoctorReport
$jsonPayload = $report | ConvertTo-Json -Depth 8

if ($Json) {
  Write-Output $jsonPayload
} else {
  Write-HumanReport -Report $report
}

if (-not [string]::IsNullOrWhiteSpace($Out)) {
  $writtenPath = Write-JsonFile -Path $Out -Content $jsonPayload
  if (-not $Json) {
    Write-Output ("JSON-отчёт сохранён: {0}" -f $writtenPath)
  }
}
