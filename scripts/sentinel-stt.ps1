param(
  [int]$TimeoutSeconds = 8
)

try {
  Add-Type -AssemblyName System.Speech

  $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $grammar = New-Object System.Speech.Recognition.DictationGrammar

  try {
    $recognizer.SetInputToDefaultAudioDevice()
  } catch {
    throw "Microphone access is unavailable. Check Windows microphone privacy settings and default recording device."
  }

  $recognizer.LoadGrammar($grammar)

  $result = $recognizer.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))

  if ($null -eq $result -or [string]::IsNullOrWhiteSpace($result.Text)) {
    throw "No speech recognized within the timeout window."
  }

  $payload = @{
    ok = $true
    text = $result.Text
    confidence = $result.Confidence
  }

  $payload | ConvertTo-Json -Compress
} catch {
  $payload = @{
    ok = $false
    error = $_.Exception.Message
  }

  $payload | ConvertTo-Json -Compress
  exit 1
}
