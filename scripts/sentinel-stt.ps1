param(
  [int]$TimeoutSeconds = 12,
  [string]$RuntimeRoot = ''
)

$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$errorCode = 'STT_FAILED'
$recognizer = $null
$whisperProcess = $null

function Write-SttPayload {
  param(
    [bool]$Ok,
    [string]$Code = '',
    [string]$Text = '',
    [Nullable[double]]$Confidence = $null,
    [string]$ErrorMessage = ''
  )

  $payload = if ($Ok) {
    @{
      ok = $true
      text = $Text
      confidence = $Confidence
      engine = 'whisper.cpp'
    }
  } else {
    @{
      ok = $false
      code = $Code
      error = $ErrorMessage
    }
  }

  $payload | ConvertTo-Json -Compress
}

function Stop-WhisperProcess {
  if ($null -eq $script:whisperProcess -or $script:whisperProcess.HasExited) {
    return
  }

  $script:whisperProcess.Kill()
  $script:whisperProcess.WaitForExit(2000) | Out-Null
}

function Invoke-WhisperRecognition {
  param(
    [string]$Root,
    [int]$ListenTimeoutSeconds
  )

  if ([string]::IsNullOrWhiteSpace($Root)) {
    return $null
  }

  if ($Root.Contains('"')) {
    $script:errorCode = 'WHISPER_RUNTIME_INVALID'
    throw 'The configured Whisper runtime path is invalid.'
  }

  $fullRoot = [System.IO.Path]::GetFullPath($Root)
  $whisperExe = Join-Path $fullRoot 'whisper\Release\whisper-stream.exe'
  $modelPath = Join-Path $fullRoot 'models\whisper\ggml-large-v3-turbo-q5_0.bin'
  if (-not (Test-Path -LiteralPath $whisperExe -PathType Leaf)) {
    return $null
  }
  if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) {
    $script:errorCode = 'WHISPER_MODEL_MISSING'
    throw 'The local Whisper model is missing.'
  }

  $arguments = '-m "{0}" -l ru -c 0 --step 2000 --length 6000 --keep 200 -fth 100' -f $modelPath
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $whisperExe
  $startInfo.Arguments = $arguments
  $startInfo.WorkingDirectory = Split-Path -Parent $whisperExe
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardOutputEncoding = $utf8
  $startInfo.StandardErrorEncoding = $utf8
  # SDL's default WASAPI backend rejects some USB microphones even though the
  # endpoint is visible. DirectSound negotiates the required 16 kHz mono format
  # reliably while keeping the same local, one-shot capture boundary.
  $startInfo.EnvironmentVariables['SDL_AUDIODRIVER'] = 'directsound'

  $script:whisperProcess = New-Object System.Diagnostics.Process
  $script:whisperProcess.StartInfo = $startInfo

  try {
    if (-not $script:whisperProcess.Start()) {
      throw 'Process start returned false.'
    }
  } catch {
    $script:errorCode = 'WHISPER_START_FAILED'
    throw 'The local Whisper runtime could not start.'
  }

  $stdoutTask = $script:whisperProcess.StandardOutput.ReadToEndAsync()
  $stderrTask = $script:whisperProcess.StandardError.ReadToEndAsync()
  $deadline = [DateTime]::UtcNow.AddSeconds([Math]::Max(6, $ListenTimeoutSeconds))
  while ([DateTime]::UtcNow -lt $deadline -and -not $script:whisperProcess.HasExited) {
    Start-Sleep -Milliseconds 200
  }

  Stop-WhisperProcess
  $stdoutText = $stdoutTask.GetAwaiter().GetResult()
  $stderrText = $stderrTask.GetAwaiter().GetResult()

  if ($stderrText -match 'audio\.init\(\) failed|failed to open[^\r\n]*capture') {
    $script:errorCode = 'MICROPHONE_UNAVAILABLE'
    throw 'Whisper could not open the default microphone.'
  }
  if ($stderrText -match 'failed to initialize whisper context|failed to load model') {
    $script:errorCode = 'WHISPER_MODEL_INVALID'
    throw 'Whisper could not load the local speech model.'
  }

  $cleanOutput = [regex]::Replace($stdoutText, '\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])', '')
  $seenCandidates = @{}
  $text = ''
  foreach ($line in [regex]::Split($cleanOutput, '[\r\n]+')) {
    $candidate = $line -replace '^\s*\[\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}\]\s*', ''
    $candidate = $candidate -replace '<\|[^|]+\|>', ''
    $candidate = ($candidate -replace '\s+', ' ').Trim()
    if ([string]::IsNullOrWhiteSpace($candidate) -or $candidate -match '^(?:\[?Start speaking\]?|### Transcription|ggml_|load_backend:|init:|whisper_|SDL_main:|main:)') {
      continue
    }
    if ($candidate.Length -gt 500) {
      continue
    }
    $candidateKey = $candidate.ToLowerInvariant().Trim().TrimEnd([char[]]'.!?…')
    if (@('продолжение следует', 'спасибо за просмотр', 'спасибо') -contains $candidateKey) {
      continue
    }
    $seenCandidates[$candidateKey] = 1 + [int]$seenCandidates[$candidateKey]
    if ($seenCandidates[$candidateKey] -ge 2) {
      $text = $candidate
    }
  }

  if ([string]::IsNullOrWhiteSpace($text)) {
    $script:errorCode = 'NO_SPEECH_RECOGNIZED'
    throw 'No stable speech was recognized before the local timeout.'
  }

  return (Write-SttPayload -Ok $true -Text $text)
}

try {
  $whisperPayload = Invoke-WhisperRecognition -Root $RuntimeRoot -ListenTimeoutSeconds $TimeoutSeconds
  if ($null -ne $whisperPayload) {
    $whisperPayload
    exit 0
  }

  # Compatibility fallback for machines that already have Windows Speech.
  # Eclipse Ultron never installs this system capability automatically.
  Add-Type -AssemblyName System.Speech

  $installedRecognizers = @([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers())
  if ($installedRecognizers.Count -eq 0) {
    $errorCode = 'WHISPER_RUNTIME_MISSING'
    throw 'Eclipse AI Runtime is missing and Windows Speech Recognition is not installed.'
  }

  $russianRecognizer = $installedRecognizers |
    Where-Object { $_.Culture.Name -eq 'ru-RU' -or $_.Culture.TwoLetterISOLanguageName -eq 'ru' } |
    Select-Object -First 1
  if ($null -eq $russianRecognizer) {
    $errorCode = 'RUSSIAN_SPEECH_PACK_MISSING'
    throw 'The local Whisper runtime is missing and no Russian Windows speech pack is available.'
  }

  $recognizer = [System.Speech.Recognition.SpeechRecognitionEngine]::new($russianRecognizer.Culture)
  $grammar = New-Object System.Speech.Recognition.DictationGrammar

  try {
    $recognizer.SetInputToDefaultAudioDevice()
  } catch {
    $errorCode = 'MICROPHONE_UNAVAILABLE'
    throw 'Microphone access is unavailable.'
  }

  $recognizer.LoadGrammar($grammar)
  $result = $recognizer.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))

  if ($null -eq $result -or [string]::IsNullOrWhiteSpace($result.Text)) {
    $errorCode = 'NO_SPEECH_RECOGNIZED'
    throw 'No speech was recognized before the local timeout.'
  }

  @{
    ok = $true
    text = $result.Text
    confidence = $result.Confidence
    engine = 'windows-speech'
  } | ConvertTo-Json -Compress
} catch {
  Write-SttPayload -Ok $false -Code $errorCode -ErrorMessage $_.Exception.Message
  exit 1
} finally {
  Stop-WhisperProcess
  if ($null -ne $recognizer) {
    $recognizer.Dispose()
  }
}
