[CmdletBinding()]
param(
  [switch]$SkipHttpChecks
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

function Assert-NodeRuntime {
  $nodeRaw = (& node --version).Trim()
  $npmRaw = (& npm --version).Trim()
  Write-Host "Node: $nodeRaw"
  Write-Host "npm:  $npmRaw"
  if ($nodeRaw -notmatch '^v(\d+)\.(\d+)\.(\d+)$') {
    throw "Unable to parse Node.js version '$nodeRaw'. Install Node.js 22.23.4 from https://nodejs.org/dist/v22.23.4/node-v22.23.4-x64.msi"
  }
  $nodeVersion = [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
  if ($nodeVersion -lt [version]'22.23.4' -or $nodeVersion.Major -ge 23) {
    throw "Node.js $nodeRaw is incompatible. VendorProof requires >=22.23.4 and <23. Install the official MSI; nvm is not required."
  }
}

function Invoke-NpmGate {
  param(
    [string]$Name,
    [string[]]$Arguments
  )
  & npm @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "$Name failed with exit code $exitCode."
  }
}

function Invoke-NpmGateWithEnvironment {
  param(
    [string]$Name,
    [string[]]$Arguments,
    [hashtable]$Environment
  )
  $saved = @{}
  foreach ($key in $Environment.Keys) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $Environment[$key], 'Process')
  }
  try {
    Invoke-NpmGate $Name $Arguments
  } finally {
    foreach ($key in $Environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
    }
  }
}

function Get-HttpErrorBody {
  param([object]$Response)
  try {
    $stream = $Response.GetResponseStream()
    if ($null -ne $stream) {
      $reader = [IO.StreamReader]::new($stream)
      try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
  } catch { }
  return '<no response body>'
}

function Assert-HttpStatus {
  param(
    [string]$Url,
    [int]$ExpectedStatus,
    [string]$StartupHint
  )
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
    $status = [int]$response.StatusCode
    if ($status -ne $ExpectedStatus) {
      throw "HTTP $status; response=$($response.Content)"
    }
  } catch {
    $httpResponse = $_.Exception.Response
    if ($null -eq $httpResponse) {
      throw "$StartupHint URL=$Url; connection error: $($_.Exception.Message)"
    }
    $status = [int]$httpResponse.StatusCode
    $body = Get-HttpErrorBody $httpResponse
    if ($status -eq $ExpectedStatus) { return }
    if ($Url -like '*/health/ready' -and $status -eq 503) {
      throw "API is running but its database readiness check failed. HTTP 503; sanitized readiness response=$body"
    }
    throw "API/frontend is running but returned HTTP $status from $Url; response=$body"
  }
}

Assert-NodeRuntime
if (-not (Test-Path '.env')) { throw '.env is missing. Run .\scripts\dev\setup.ps1 first.' }
if (-not (Test-Path 'apps/web/.env.local')) { throw 'apps/web/.env.local is missing. Run .\scripts\dev\setup.ps1 first.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is not on PATH. Start Docker Desktop and reopen PowerShell.' }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop engine is not running.' }
docker compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose configuration is invalid.' }
Write-Host 'Compose configuration: valid'

docker compose ps postgres
if ($LASTEXITCODE -ne 0) { throw 'VendorProof PostgreSQL service is not present.' }
docker compose exec -T postgres pg_isready -U vendorproof -d vendorproof *> $null
if ($LASTEXITCODE -ne 0) {
  docker compose logs --no-color postgres
  throw 'PostgreSQL is not ready on 127.0.0.1:5433.'
}
Write-Host 'PostgreSQL: ready'

$expectedMigrations = @(Get-ChildItem 'server/src/db/migrations' -Filter '*.sql').Count
$appliedMigrations = (docker compose exec -T postgres psql -U vendorproof -d vendorproof -tAc 'select count(*) from __vendorproof_migrations').Trim()
if ($LASTEXITCODE -ne 0 -or [int]$appliedMigrations -ne $expectedMigrations) {
  throw "Migration verification failed: expected $expectedMigrations applied migrations, found '$appliedMigrations'."
}
Write-Host "Migrations: $appliedMigrations applied"

Invoke-NpmGate 'Database metadata check' @('run', 'db:check')
Invoke-NpmGate 'Format check' @('run', 'format:check')
Invoke-NpmGate 'Lint' @('run', 'lint')
Invoke-NpmGate 'Typecheck' @('run', 'typecheck')
Invoke-NpmGateWithEnvironment 'Unit tests' @('run', 'test:unit') @{
  APP_DATABASE_URL = $null
  DATABASE_URL = $null
  NODE_ENV = 'test'
}
Invoke-NpmGateWithEnvironment 'Integration tests' @('run', 'test:integration') @{
  APP_DATABASE_URL = 'postgresql://vendorproof_app:vendorproof_app@127.0.0.1:5433/vendorproof'
  DATABASE_URL = $null
  NODE_ENV = 'test'
}
Invoke-NpmGate 'Production build' @('run', 'build')

if ($SkipHttpChecks) {
  Write-Host 'Repository and database checks passed. HTTP checks skipped by -SkipHttpChecks.'
  exit 0
}

Write-Host 'Repository and database checks passed. Verifying separately started API and frontend services...'
Assert-HttpStatus 'http://localhost:3000/health/live' 200 'API is not running. Start npm run dev:api in another terminal and rerun this check.'
Assert-HttpStatus 'http://localhost:3000/health/ready' 200 'API is not running. Start npm run dev:api in another terminal and rerun this check.'
Assert-HttpStatus 'http://localhost:3001/' 200 'Frontend is not running. Start npm run dev:web in another terminal and rerun this check.'
Assert-HttpStatus 'http://localhost:3001/api/v1/auth/me' 401 'Frontend is not running. Start npm run dev:web in another terminal and rerun this check.'
Write-Host 'API and frontend endpoints: reachable; proxy returns expected unauthenticated status'
Write-Host 'VendorProof local checks completed.'
