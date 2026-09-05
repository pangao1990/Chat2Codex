$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Manifest = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
$BunVersion = ([string]$Manifest.packageManager) -replace '^bun@', ''
$OfficialProbe = "https://github.com/oven-sh/bun/releases/download/bun-v$BunVersion/SHASUMS256.txt"
$ChinaProbe = "https://registry.npmmirror.com/-/binary/bun/bun-v$BunVersion/SHASUMS256.txt"
$Source = & (Join-Path $PSScriptRoot "select-download-source.ps1") $OfficialProbe $ChinaProbe
Write-Host "Selected download source: $Source"
& (Join-Path $PSScriptRoot "bootstrap-local-bun.ps1")
& (Join-Path $PSScriptRoot "bootstrap-local-node.ps1")

& (Join-Path $PSScriptRoot "bun-local.ps1") install --frozen-lockfile
& (Join-Path $PSScriptRoot "bun-local.ps1") install --frozen-lockfile --cwd (Join-Path $ProjectRoot "launcher")

Write-Host ""
Write-Host "Local Bun, Node.js, and all project dependencies are ready."
Write-Host "Use scripts\bun-local.cmd instead of a global bun command."
