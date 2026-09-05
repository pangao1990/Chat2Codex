$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Manifest = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
$NodeVersion = [string]$Manifest.engines.node
if ($NodeVersion -notmatch '^\d+\.\d+\.\d+$') { throw "package.json must pin Node.js as x.y.z" }
if (-not [Environment]::Is64BitOperatingSystem) { throw "Local development requires 64-bit Windows" }

$NodeDirectory = Join-Path $ProjectRoot ".tools\node\$NodeVersion"
$NodeBinDirectory = Join-Path $NodeDirectory "bin"
$LocalNode = Join-Path $NodeBinDirectory "node.exe"
if ((Test-Path $LocalNode) -and ((& $LocalNode --version) -eq "v$NodeVersion")) {
  Write-Host "Local Node.js $NodeVersion is already installed"
  return
}

$Asset = "node-v$NodeVersion-win-x64.zip"
$ReleaseUrl = "https://nodejs.org/download/release/v$NodeVersion"
$ChinaReleaseUrl = "https://registry.npmmirror.com/-/binary/node/v$NodeVersion"
$Source = & (Join-Path $PSScriptRoot "select-download-source.ps1") "$ReleaseUrl/SHASUMS256.txt" "$ChinaReleaseUrl/SHASUMS256.txt"
$DownloadUrl = if ($Source -eq "china") { $ChinaReleaseUrl } else { $ReleaseUrl }
$DownloadDirectory = Join-Path $ProjectRoot ".cache\node\downloads\$NodeVersion"
$Archive = Join-Path $DownloadDirectory $Asset
$Checksums = Join-Path $DownloadDirectory "SHASUMS256.txt"
New-Item -ItemType Directory -Force -Path $DownloadDirectory, $NodeBinDirectory | Out-Null
Write-Host "Downloading Node.js $NodeVersion from the $Source source"
Invoke-WebRequest "$DownloadUrl/$Asset" -OutFile $Archive -UseBasicParsing -TimeoutSec 900
Invoke-WebRequest "$ReleaseUrl/SHASUMS256.txt" -OutFile $Checksums -UseBasicParsing -TimeoutSec 900
$ExpectedLine = Get-Content $Checksums | Where-Object { $_ -match "\s$([regex]::Escape($Asset))$" } | Select-Object -First 1
if (-not $ExpectedLine) { throw "Official checksum list has no entry for $Asset" }
$Expected = ($ExpectedLine -split '\s+')[0].ToLowerInvariant()
$Actual = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw "SHA-256 verification failed for $Asset" }

$StageDirectory = Join-Path $ProjectRoot ".tools\.node-stage-$([guid]::NewGuid().ToString('N'))"
try {
  Expand-Archive -LiteralPath $Archive -DestinationPath $StageDirectory -Force
  $Extracted = Join-Path $StageDirectory "node-v$NodeVersion-win-x64"
  $ExtractedNode = Join-Path $Extracted "node.exe"
  if (-not (Test-Path $ExtractedNode)) { throw "Downloaded Node.js archive is incomplete" }
  Remove-Item $NodeDirectory -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $NodeBinDirectory | Out-Null
  Copy-Item (Join-Path $Extracted "*") $NodeBinDirectory -Recurse -Force
} finally {
  Remove-Item $StageDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
if ((& $LocalNode --version) -ne "v$NodeVersion") {
  throw "Installed Node.js version does not match $NodeVersion"
}
Write-Host "Installed local Node.js $NodeVersion at $LocalNode"
