param(
  [Parameter(Mandatory = $true)]
  [string]$Text,

  [string]$Voice,

  [int]$Rate = 0
)

$speaker = New-Object -ComObject SAPI.SpVoice

if ($Voice) {
  $available = @($speaker.GetVoices()) | Where-Object {
    $_.GetDescription() -like "*$Voice*"
  } | Select-Object -First 1

  if (-not $available) {
    throw "Voice '$Voice' not found"
  }

  $speaker.Voice = $available
}

$speaker.Rate = $Rate
[void]$speaker.Speak($Text)
