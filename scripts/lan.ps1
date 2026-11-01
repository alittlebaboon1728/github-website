param(
  [ValidateSet('Start', 'Stop', 'Status')]
  [string]$Action = 'Status',
  [ValidateRange(1024, 65535)]
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serverPath = Join-Path $projectRoot 'server\index.mjs'
$runtimePath = Join-Path $projectRoot '.build\lan'
$statePath = Join-Path $runtimePath 'process.json'
$dataPath = Join-Path $projectRoot '.data-lan'

function Get-LanProcess {
  if (-not (Test-Path -LiteralPath $statePath)) { return $null }
  try {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $recordedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$state.processId)"
    if ($recordedProcess.Name -eq 'node.exe' -and $recordedProcess.CommandLine.Contains($serverPath)) {
      return [PSCustomObject]@{ ProcessId = $recordedProcess.ProcessId; Port = [int]$state.port }
    }
  } catch { }
  return $null
}

function Show-Addresses([int]$servicePort) {
  Write-Output "Local: http://localhost:$servicePort"
  $networkAddresses = Get-NetIPConfiguration | Where-Object {
    $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up'
  } | ForEach-Object { $_.IPv4Address.IPAddress } | Where-Object {
    $_ -ne '127.0.0.1' -and $_ -notlike '169.254.*'
  } | Select-Object -Unique
  foreach ($networkAddress in $networkAddresses) {
    Write-Output "LAN: http://${networkAddress}:$servicePort"
  }
}

$existing = Get-LanProcess
if ($Action -eq 'Status') {
  if ($existing) {
    Write-Output "Running (PID $($existing.ProcessId))."
    Show-Addresses $existing.Port
  } else { Write-Output 'LAN server is stopped.' }
  exit 0
}

if ($Action -eq 'Stop') {
  if ($existing) {
    Stop-Process -Id $existing.ProcessId
    Remove-Item -LiteralPath $statePath
    Write-Output 'LAN server stopped. Development server and saved data are preserved.'
  } else { Write-Output 'LAN server is already stopped.' }
  exit 0
}

if ($existing) {
  Write-Output "Already running (PID $($existing.ProcessId))."
  Show-Addresses $existing.Port
  exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) {
  throw 'Run npm run build before starting the LAN server.'
}
if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
  throw "Port $Port is already in use. No existing process was stopped."
}

New-Item -ItemType Directory -Path $runtimePath, $dataPath -Force | Out-Null
# Seed once from existing JSON snapshots; never overwrite data written by the LAN server.
$sourceData = Join-Path $projectRoot '.data'
if (Test-Path -LiteralPath $sourceData) {
  Get-ChildItem -LiteralPath $sourceData -Filter '*.json' -File | ForEach-Object {
    $destination = Join-Path $dataPath $_.Name
    if (-not (Test-Path -LiteralPath $destination)) {
      Copy-Item -LiteralPath $_.FullName -Destination $destination
    }
  }
}

$overrides = @{
  PORT = [string]$Port
  HOST = '0.0.0.0'
  OBSERVATORY_DATA_DIR = $dataPath
}
$previousValues = @{}
try {
  foreach ($key in $overrides.Keys) {
    $previousValues[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $overrides[$key], 'Process')
  }
  $nodePath = (Get-Command node -CommandType Application | Select-Object -First 1).Source
  $startedProcess = Start-Process -FilePath $nodePath -ArgumentList @(
    '--env-file-if-exists=.env.local', ('"{0}"' -f $serverPath)
  ) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $runtimePath 'stdout.log') `
    -RedirectStandardError (Join-Path $runtimePath 'stderr.log')
} finally {
  foreach ($key in $previousValues.Keys) {
    [Environment]::SetEnvironmentVariable($key, $previousValues[$key], 'Process')
  }
}
@{ processId = $startedProcess.Id; port = $Port } | ConvertTo-Json |
  Set-Content -LiteralPath $statePath -Encoding UTF8

for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if ($startedProcess.HasExited) {
    throw "LAN server exited. Check .build/lan/stderr.log."
  }
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/observatory/status" -TimeoutSec 2
    if ($null -ne $health.data.aiConfigured) {
      Write-Output "LAN server started (PID $($startedProcess.Id))."
      Show-Addresses $Port
      Write-Output 'Logs: .build/lan/ | Data: .data-lan/'
      exit 0
    }
  } catch { }
  Start-Sleep -Milliseconds 250
}
throw 'LAN server did not become ready. Check .build/lan/stderr.log.'
