[CmdletBinding()]
param(
  [string]$DevProjectId = "iraq-compass-dev",
  [string]$ProdProjectId = "iraq-compass-prod",
  [switch]$CreateProjects
)

$ErrorActionPreference = "Stop"

function Assert-FirebaseCli {
  if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
    throw "Firebase CLI is not installed. Install it with: npm i -g firebase-tools"
  }
}

function Ensure-LoggedIn {
  firebase login:list | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Firebase CLI is not authenticated. Run: firebase login"
  }
}

function Ensure-Project([string]$ProjectId, [string]$DisplayName) {
  firebase projects:list --json | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Firebase projects. Ensure your account has permissions."
  }

  $exists = firebase projects:list --json | ConvertFrom-Json | Select-Object -ExpandProperty results | Where-Object { $_.projectId -eq $ProjectId }

  if (-not $exists) {
    if (-not $CreateProjects) {
      throw "Project '$ProjectId' not found. Re-run with -CreateProjects to create it."
    }

    Write-Host "Creating project $ProjectId ..."
    firebase projects:create $ProjectId --display-name $DisplayName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to create Firebase project '$ProjectId'."
    }
  }
}

Assert-FirebaseCli
Ensure-LoggedIn
Ensure-Project -ProjectId $DevProjectId -DisplayName "Iraq Compass Dev"
Ensure-Project -ProjectId $ProdProjectId -DisplayName "Iraq Compass Prod"

$firebaserc = @{
  projects = @{
    default = $DevProjectId
    dev = $DevProjectId
    prod = $ProdProjectId
  }
} | ConvertTo-Json -Depth 4

Set-Content -Path ".firebaserc" -Value $firebaserc -Encoding utf8

Write-Host "Configured .firebaserc with aliases:"
Write-Host "  dev  -> $DevProjectId"
Write-Host "  prod -> $ProdProjectId"
Write-Host "Done. Use 'firebase use dev' for testing and 'firebase use prod' before production deploy."
