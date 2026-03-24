$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "check-deps.mjs"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "node: missing (please install Node.js 22+)"
  exit 1
}

& node $nodeScript
exit $LASTEXITCODE
