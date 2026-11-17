[CmdletBinding()]
param()

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

function Assert-HttpStatus {
  param([string]$Url, [int]$ExpectedStatus)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 10
    if ([int]$response.StatusCode -ne $ExpectedStatus) { throw "returned HTTP $($response.StatusCode)" }
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq $ExpectedStatus) { return }
    throw "Expected HTTP $ExpectedStatus from $Url, but the request failed: $($_.Exception.Message)"
  }
}

Assert-HttpStatus 'http://127.0.0.1:3000/health/live' 200
Assert-HttpStatus 'http://127.0.0.1:3000/health/ready' 200
Assert-HttpStatus 'http://localhost:3001/' 200
Assert-HttpStatus 'http://localhost:3001/api/v1/auth/me' 401
Write-Host 'API and frontend endpoints: reachable; proxy returns expected unauthenticated status'

npm run db:check
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
if ($LASTEXITCODE -ne 0) { throw 'A repository quality gate failed.' }
Write-Host 'VendorProof local checks completed.'
