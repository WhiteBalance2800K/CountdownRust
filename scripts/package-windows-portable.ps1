$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

npm run tauri -- build --no-bundle

$OutDir = Join-Path $RootDir "dist-packages\windows"
$StageDir = Join-Path $OutDir "Countdown"
$ExePath = Join-Path $RootDir "src-tauri\target\release\countdown.exe"
$ZipPath = Join-Path $OutDir "Countdown-v0.9-windows-portable.zip"

if (Test-Path $OutDir) {
  Remove-Item $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

Copy-Item $ExePath (Join-Path $StageDir "Countdown.exe")
Copy-Item (Join-Path $RootDir "README.md") (Join-Path $StageDir "README.md")
Compress-Archive -Path $StageDir -DestinationPath $ZipPath -Force

Write-Host "Created $ZipPath"
