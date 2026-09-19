[CmdletBinding()]
param(
  [string]$RuntimeRoot = $(if ($env:ECLIPSE_AI_RUNTIME_DIR) {
    $env:ECLIPSE_AI_RUNTIME_DIR
  } else {
    'E:\ADMIN_HOPSON_PC\Программы\Eclipse AI Runtime'
  }),
  [switch]$ForceDownload,
  [string]$OllamaHost = '127.0.0.1:11435'
)

$ErrorActionPreference = 'Stop'

# This is an explicit, opt-in installer for the isolated Lab endpoint. It does
# not run from Electron startup and it never adds model weights to Git or the
# application installer.
$ModelName = 'qwen3.8-cyber-iq4xs:27b'
$ModelFileName = 'Qwen3.8-27B-Uncensored-Cyber-IQ4_XS-imatrix-fromq8.gguf'
$ModelRevision = 'd82fb040934e0a491600a49477114d005accf59f'
$ModelUrl = "https://huggingface.co/cyjin-yl/Qwen3.8-27B-Uncensored-Cyber-agentic-imatrix-GGUF/resolve/$ModelRevision/$ModelFileName?download=true"
$ExpectedSha256 = 'd11d28b9b253fb7fc9de277a46af5bbd790c000d6bfdfe5648fd7b62ec2560b7'
$ModelDirectory = Join-Path $RuntimeRoot 'models\gguf\qwen3.8-cyber-iq4xs'
$ModelPath = Join-Path $ModelDirectory $ModelFileName
$ModelfilePath = Join-Path $ModelDirectory 'Modelfile'
$LabModels = Join-Path $RuntimeRoot 'models\ollama'

if ($OllamaHost -ne '127.0.0.1:11435') {
  throw 'This installer only targets the loopback Ultron Lab endpoint 127.0.0.1:11435.'
}

function Resolve-OllamaExecutable {
  $portableOllama = Join-Path $RuntimeRoot 'ollama\ollama.exe'
  if (Test-Path -LiteralPath $portableOllama -PathType Leaf) {
    return (Get-Item -LiteralPath $portableOllama).FullName
  }

  $resolved = Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue
  if ($resolved) {
    if ($resolved.Path) { return $resolved.Path }
    return $resolved.Source
  }

  throw "Ollama was not found. Install the portable runtime under '$RuntimeRoot\ollama' or add ollama.exe to PATH."
}

function Assert-LabEndpoint {
  try {
    $tags = Invoke-WebRequest -UseBasicParsing -Uri "http://$OllamaHost/api/tags" -TimeoutSec 5
    if ($tags.StatusCode -lt 200 -or $tags.StatusCode -ge 300) {
      throw 'The Lab Ollama endpoint did not respond successfully.'
    }
  } catch {
    throw "Lab Ollama is not reachable at http://$OllamaHost. Start the isolated Lab server first, then run this installer again."
  }
}

# Resolve and probe the endpoint before touching the 15 GiB download. The
# server owns OLLAMA_MODELS, so changing that variable only for `ollama create`
# would give a false impression that an already-running server changed stores.
$ollamaCommand = Resolve-OllamaExecutable
Assert-LabEndpoint
Write-Host "Using Lab Ollama at http://$OllamaHost (expected server model store: $LabModels)."

New-Item -ItemType Directory -Force -Path $ModelDirectory | Out-Null

function Assert-Sha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
  if ($actual -ne $Expected) {
    throw "SHA-256 mismatch for $Label. Expected $Expected, got $actual. The file was not imported."
  }
}

function Assert-ModelRegistered {
  $body = @{ name = $ModelName } | ConvertTo-Json -Compress
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Post `
      -Uri "http://$OllamaHost/api/show" `
      -ContentType 'application/json' `
      -Body $body `
      -TimeoutSec 10
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
      throw "The Lab Ollama endpoint returned HTTP $($response.StatusCode) for /api/show."
    }
  } catch {
    throw "ollama create completed, but model '$ModelName' was not found at http://$OllamaHost/api/show. Check that the Lab server uses OLLAMA_MODELS=$LabModels."
  }
}

if (Test-Path -LiteralPath $ModelPath -PathType Container) {
  throw "The expected model file path is a directory: $ModelPath. Remove or rename it, then run the installer again."
}

if ((Test-Path -LiteralPath $ModelPath -PathType Leaf) -and (-not $ForceDownload)) {
  Assert-Sha256 -Path $ModelPath -Expected $ExpectedSha256 -Label $ModelFileName
} else {
  Write-Host "Downloading $ModelFileName (about 15 GiB) ..."
  $downloadPath = "$ModelPath.$([guid]::NewGuid().ToString('N')).download"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $ModelUrl -OutFile $downloadPath
    Assert-Sha256 -Path $downloadPath -Expected $ExpectedSha256 -Label $ModelFileName
    Move-Item -LiteralPath $downloadPath -Destination $ModelPath -Force
  } finally {
    if (Test-Path -LiteralPath $downloadPath) {
      Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
    }
  }
}

# Use a relative FROM path so the Modelfile remains valid when the approved
# runtime root contains spaces or non-ASCII characters.
$modelfile = @"
FROM ./$ModelFileName
PARAMETER num_ctx 8192
PARAMETER num_predict 4096
PARAMETER temperature 0.2
"@
[System.IO.File]::WriteAllText(
  $ModelfilePath,
  $modelfile,
  [System.Text.UTF8Encoding]::new($false)
)

$previousHost = $env:OLLAMA_HOST
try {
  $env:OLLAMA_HOST = $OllamaHost
  Push-Location $ModelDirectory
  try {
    & $ollamaCommand create $ModelName -f $ModelfilePath
    if ($LASTEXITCODE -ne 0) {
      throw "ollama create failed with exit code $LASTEXITCODE."
    }
    Assert-ModelRegistered
  } finally {
    Pop-Location
  }
} finally {
  if ($null -eq $previousHost) { Remove-Item Env:OLLAMA_HOST -ErrorAction SilentlyContinue } else { $env:OLLAMA_HOST = $previousHost }
}

Write-Host "Created $ModelName through the isolated Lab endpoint."
Write-Host "Keep the Lab server's OLLAMA_MODELS set to $LabModels; an already-running server owns that store."
Write-Host 'The model is text-only in Ultron: its vision projector is a separate artifact and is not imported by this script.'
Write-Host 'The 8K context limit is intentional for the first hardware pilot; benchmark before raising it.'
