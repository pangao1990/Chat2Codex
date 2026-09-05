$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Manifest = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
$NodeVersion = [string]$Manifest.engines.node
$LocalNode = Join-Path $ProjectRoot ".tools\node\$NodeVersion\bin\node.exe"
if (-not (Test-Path $LocalNode)) {
  throw "Local Node.js is not installed. Double-click scripts\setup-local.cmd first."
}
$env:npm_config_cache = Join-Path $ProjectRoot ".cache\npm"
Push-Location $ProjectRoot
try {
  & $LocalNode @args
  if ($LASTEXITCODE -ne 0) { throw "Local Node.js command failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
