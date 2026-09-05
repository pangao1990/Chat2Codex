param(
  [Parameter(Mandatory = $true)][string]$OfficialProbe,
  [Parameter(Mandatory = $true)][string]$ChinaProbe
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$SourceFile = Join-Path $ProjectRoot ".tools\download-source"
$Requested = if ($env:CHAT2CODEX_SOURCE) { $env:CHAT2CODEX_SOURCE.ToLowerInvariant() } else { "auto" }
if ($Requested -notin @("auto", "china", "official")) {
  throw "CHAT2CODEX_SOURCE must be auto, china, or official"
}

if ($Requested -ne "auto") {
  $Selected = $Requested
} elseif ((-not $env:CHAT2CODEX_SOURCE) -and (Test-Path $SourceFile)) {
  $Selected = ([string](Get-Content $SourceFile -First 1)).Trim()
} else {
  function Measure-Probe([string]$Uri) {
    $Timer = [Diagnostics.Stopwatch]::StartNew()
    try {
      Invoke-WebRequest $Uri -Method Head -UseBasicParsing -TimeoutSec 12 | Out-Null
      return $Timer.Elapsed.TotalMilliseconds
    } catch {
      return [double]::PositiveInfinity
    }
  }
  $OfficialTime = Measure-Probe $OfficialProbe
  $ChinaTime = Measure-Probe $ChinaProbe
  $Selected = if ($ChinaTime -lt $OfficialTime) { "china" } else { "official" }
}
if ($Selected -notin @("china", "official")) { $Selected = "official" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SourceFile) | Out-Null
Set-Content -LiteralPath $SourceFile -Value $Selected -Encoding Ascii
Write-Output $Selected
