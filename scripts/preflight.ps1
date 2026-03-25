[CmdletBinding()]
param(
  [ValidateSet("dev", "prod")]
  [string]$TargetEnv = "dev"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  throw "Firebase CLI not found. Install with: npm i -g firebase-tools"
}

Write-Host "Running lint..."
npm run lint
if ($LASTEXITCODE -ne 0) {
  throw "Lint failed"
}

Write-Host "Running build..."
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "Build failed"
}

$firebaseRc = Get-Content ".firebaserc" -Raw | ConvertFrom-Json
$expectedProject = $firebaseRc.projects.$TargetEnv
if (-not $expectedProject) {
  throw "No alias '$TargetEnv' in .firebaserc"
}

$activeLine = firebase use | Select-String "active project"
$activeProject = ""
if ($activeLine) {
  $activeProject = ($activeLine -replace ".*active project: ", "" -replace "\).*", "").Trim()
}

if ($activeProject -ne $expectedProject) {
  throw "Active Firebase project mismatch. Expected '$expectedProject' but found '$activeProject'. Run: firebase use $TargetEnv"
}

Write-Host "Preflight checks passed for '$TargetEnv' ($expectedProject)."
