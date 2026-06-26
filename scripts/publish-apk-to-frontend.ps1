param(
  [string]$ApkPath = "APK\build\app\outputs\flutter-apk\app-release.apk",
  [string]$Version = "1.0.20-21",
  [switch]$KeepOld
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root $ApkPath
$targetDir = Join-Path $root "frontend\src\assets\downloads"
$versionedTarget = Join-Path $targetDir "vipe-abastecimento-$Version.apk"
$versionedTargetFullPath = [System.IO.Path]::GetFullPath($versionedTarget)

if (!(Test-Path -LiteralPath $source)) {
  throw "APK nao encontrado em $source. Gere primeiro com flutter build apk --release."
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

$sourceHash = Get-FileHash -LiteralPath $source -Algorithm SHA256
$targetHash = if (Test-Path -LiteralPath $versionedTarget) {
  Get-FileHash -LiteralPath $versionedTarget -Algorithm SHA256
} else {
  $null
}

if ($null -eq $targetHash -or $targetHash.Hash -ne $sourceHash.Hash) {
  Copy-Item -LiteralPath $source -Destination $versionedTarget -Force
}

if (!$KeepOld) {
  Get-ChildItem -LiteralPath $targetDir -Filter "*.apk" |
    Where-Object { $_.FullName -ne $versionedTargetFullPath } |
    Remove-Item -Force
}

[pscustomobject]@{
  apk = $versionedTarget
  bytes = (Get-Item -LiteralPath $versionedTarget).Length
  sha256 = $sourceHash.Hash
}
