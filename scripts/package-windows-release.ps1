$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $root "package.json"
$packageJson = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json

$releaseDir = Join-Path $root "release-build"
$productName = $packageJson.build.productName
$version = $packageJson.version
$portableExe = Join-Path $releaseDir "$productName $version.exe"
$assetPath = Join-Path $releaseDir "GPT-Mathematical-Windows.exe"
$webDownloadDir = Join-Path $root "web\public\downloads"
$webAssetPath = Join-Path $webDownloadDir "GPT-Mathematical-Windows.exe"

if (-not (Test-Path -LiteralPath $portableExe)) {
  throw "Expected packaged executable was not found: $portableExe"
}

Copy-Item -LiteralPath $portableExe -Destination $assetPath -Force
New-Item -ItemType Directory -Force -Path $webDownloadDir | Out-Null
Copy-Item -LiteralPath $assetPath -Destination $webAssetPath -Force

$asset = Get-Item -LiteralPath $assetPath
Write-Host "Prepared GitHub release asset: $($asset.FullName) ($($asset.Length) bytes)"
Write-Host "Updated website download asset: $webAssetPath"
