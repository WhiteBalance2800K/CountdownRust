$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir

$Manifest = Join-Path $RootDir "app\Cargo.toml"
$VersionLine = Select-String -Path $Manifest -Pattern '^version\s*=\s*"(.+)"' | Select-Object -First 1
$Version = $VersionLine.Matches.Groups[1].Value

cargo build --manifest-path $Manifest --release

$OutDir = Join-Path $RootDir "dist-packages\windows"
$StageDir = Join-Path $OutDir "Countdown"
$ExePath = Join-Path $RootDir "app\target\release\countdown.exe"
$ZipPath = Join-Path $OutDir "Countdown-v$Version-windows-portable.zip"

if (Test-Path $OutDir) {
  Remove-Item $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

Copy-Item $ExePath (Join-Path $StageDir "Countdown.exe")
Copy-Item (Join-Path $RootDir "README.md") (Join-Path $StageDir "README.md")
Compress-Archive -Path $StageDir -DestinationPath $ZipPath -Force

Write-Host "Created $ZipPath"
