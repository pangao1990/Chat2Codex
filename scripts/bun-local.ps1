$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Manifest = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
$PackageManager = [string]$Manifest.packageManager
if ($PackageManager -notmatch '^bun@(\d+\.\d+\.\d+)$') {
  throw "package.json must pin Bun as bun@x.y.z"
}
$BunVersion = $Matches[1]
$NodeVersion = [string]$Manifest.engines.node
if ($NodeVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "package.json must pin Node.js as x.y.z"
}
$BunDirectory = Join-Path $ProjectRoot ".tools\bun\$BunVersion\bin"
$NodeDirectory = Join-Path $ProjectRoot ".tools\node\$NodeVersion\bin"
$LocalBun = Join-Path $BunDirectory "bun.exe"
if (-not (Test-Path $LocalBun)) {
  throw "Local Bun is not installed. Double-click scripts\setup-local.cmd first."
}

$InstallHome = Join-Path $ProjectRoot ".tools\bun-home"
$InstallCache = Join-Path $ProjectRoot ".cache\bun\install"
$TranspilerCache = Join-Path $ProjectRoot ".cache\bun\transpiler"
$NpmCache = Join-Path $ProjectRoot ".cache\npm"
$ElectronCache = Join-Path $ProjectRoot ".cache\electron"
$ElectronBuilderCache = Join-Path $ProjectRoot ".cache\electron-builder"
New-Item -ItemType Directory -Force -Path $InstallHome, $InstallCache, $TranspilerCache, $NpmCache, $ElectronCache, $ElectronBuilderCache | Out-Null
Set-Content -LiteralPath (Join-Path $ProjectRoot ".cache\package.json") -Value '{"type":"commonjs","private":true}' -Encoding Ascii
$env:BUN_INSTALL = $InstallHome
$env:BUN_INSTALL_CACHE_DIR = $InstallCache
$env:BUN_RUNTIME_TRANSPILER_CACHE_PATH = $TranspilerCache
$Source = if ($env:CHAT2CODEX_SOURCE) { $env:CHAT2CODEX_SOURCE.ToLowerInvariant() } else { "auto" }
$SourceFile = Join-Path $ProjectRoot ".tools\download-source"
if (($Source -eq "auto") -and (Test-Path $SourceFile)) { $Source = ([string](Get-Content $SourceFile -First 1)).Trim() }
$Registry = if ($Source -eq "china") { "https://registry.npmmirror.com" } else { "https://registry.npmjs.org" }
$env:BUN_CONFIG_REGISTRY = $Registry
$env:npm_config_registry = $Registry
$env:npm_config_cache = $NpmCache
$env:ELECTRON_CACHE = $ElectronCache
$env:ELECTRON_BUILDER_CACHE = $ElectronBuilderCache
$env:PATH = "$BunDirectory$([IO.Path]::PathSeparator)$NodeDirectory$([IO.Path]::PathSeparator)$env:PATH"

Push-Location $ProjectRoot
try {
  & $LocalBun @args
  if ($LASTEXITCODE -ne 0) {
    throw "Local Bun command failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}
