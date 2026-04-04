try {
  $voices = @()
  $ttsAvailable = $false
  $ttsError = $null
  $sttEngineAvailable = $false
  $sttGrammarAvailable = $false
  $microphoneAvailable = $false
  $sttError = $null

  try {
    $speaker = New-Object -ComObject SAPI.SpVoice
    $voices = @($speaker.GetVoices()) | ForEach-Object { $_.GetDescription() }
    $ttsAvailable = $true
  } catch {
    $ttsError = $_.Exception.Message
  }

  try {
    Add-Type -AssemblyName System.Speech
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
    $sttEngineAvailable = $true

    try {
      $grammar = New-Object System.Speech.Recognition.DictationGrammar
      $recognizer.LoadGrammar($grammar)
      $sttGrammarAvailable = $true
    } catch {
      if (-not $sttError) {
        $sttError = $_.Exception.Message
      }
    }

    try {
      $recognizer.SetInputToDefaultAudioDevice()
      $microphoneAvailable = $true
    } catch {
      $microphoneAvailable = $false
      if (-not $sttError) {
        $sttError = $_.Exception.Message
      }
    }
  } catch {
    $sttError = $_.Exception.Message
  }

  $payload = @{
    ok = $true
    platform = 'windows'
    tts = @{
      available = $ttsAvailable
      voices = $voices
      error = $ttsError
    }
    stt = @{
      engineAvailable = $sttEngineAvailable
      grammarAvailable = $sttGrammarAvailable
      microphoneAvailable = $microphoneAvailable
      error = $sttError
    }
  }

  $payload | ConvertTo-Json -Depth 6
} catch {
  @{
    ok = $false
    error = $_.Exception.Message
  } | ConvertTo-Json -Compress
  exit 1
}
