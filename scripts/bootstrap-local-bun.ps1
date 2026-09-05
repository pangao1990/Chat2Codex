$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Manifest = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
$PackageManager = [string]$Manifest.packageManager
if ($PackageManager -notmatch '^bun@(\d+\.\d+\.\d+)$') {
  throw "package.json must pin Bun as bun@x.y.z"
}
$BunVersion = $Matches[1]

if (-not [Environment]::Is64BitOperatingSystem) {
  throw "Local development requires 64-bit Windows"
}

$BunDirectory = Join-Path $ProjectRoot ".tools\bun\$BunVersion\bin"
$LocalBun = Join-Path $BunDirectory "bun.exe"
if ((Test-Path $LocalBun) -and ((& $LocalBun --version) -eq $BunVersion)) {
  Copy-Item $LocalBun (Join-Path $BunDirectory "bunx.exe") -Force
  Write-Host "Local Bun $BunVersion is already installed"
  return
}

$Asset = "bun-windows-x64-baseline.zip"
$ReleaseUrl = "https://github.com/oven-sh/bun/releases/download/bun-v$BunVersion"
$ChinaReleaseUrl = "https://registry.npmmirror.com/-/binary/bun/bun-v$BunVersion"
$Source = & (Join-Path $PSScriptRoot "select-download-source.ps1") "$ReleaseUrl/SHASUMS256.txt" "$ChinaReleaseUrl/SHASUMS256.txt"
$DownloadUrl = if ($Source -eq "china") { $ChinaReleaseUrl } else { $ReleaseUrl }
$DownloadDirectory = Join-Path $ProjectRoot ".cache\bun\downloads\$BunVersion"
$Archive = Join-Path $DownloadDirectory $Asset
$Checksums = Join-Path $DownloadDirectory "SHASUMS256.txt"
New-Item -ItemType Directory -Force -Path $DownloadDirectory, $BunDirectory | Out-Null

function Invoke-Download {
  param([string]$Uri, [string]$Output)
  for ($Attempt = 1; $Attempt -le 3; $Attempt++) {
    try {
      Remove-Item $Output -Force -ErrorAction SilentlyContinue
      Invoke-WebRequest -Uri $Uri -OutFile $Output -UseBasicParsing -TimeoutSec 900
      return
    } catch {
      if ($Attempt -eq 3) { throw }
      Start-Sleep -Seconds (2 * $Attempt)
    }
  }
}

Write-Host "Downloading Bun $BunVersion from the $Source source"
Invoke-Download "$DownloadUrl/$Asset" $Archive
Invoke-Download "$ReleaseUrl/SHASUMS256.txt" $Checksums
$ExpectedLine = Get-Content $Checksums | Where-Object { $_ -match "\s$([regex]::Escape($Asset))$" } | Select-Object -First 1
if (-not $ExpectedLine) { throw "Official checksum list has no entry for $Asset" }
$Expected = ($ExpectedLine -split '\s+')[0].ToLowerInvariant()
$Actual = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw "SHA-256 verification failed for $Asset" }

$StageDirectory = Join-Path $ProjectRoot ".tools\.bun-stage-$([guid]::NewGuid().ToString('N'))"
try {
  Expand-Archive -LiteralPath $Archive -DestinationPath $StageDirectory -Force
  $ExtractedBun = Join-Path $StageDirectory "bun-windows-x64-baseline\bun.exe"
  if (-not (Test-Path $ExtractedBun)) { throw "Downloaded Bun archive is incomplete" }
  Copy-Item $ExtractedBun $LocalBun -Force
  Copy-Item $ExtractedBun (Join-Path $BunDirectory "bunx.exe") -Force
} finally {
  Remove-Item $StageDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
if ((& $LocalBun --version) -ne $BunVersion) {
  throw "Installed Bun version does not match $BunVersion"
}
Write-Host "Installed local Bun $BunVersion at $LocalBun"
