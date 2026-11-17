[CmdletBinding()]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $repoRoot

function Assert-NodeRuntime {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $nodeCommand -or -not $npmCommand) {
    throw 'Node.js and npm are required. Install Node.js 22.23.4 with the official Windows MSI: https://nodejs.org/dist/v22.23.4/node-v22.23.4-x64.msi'
  }

  $nodeRaw = (& node --version).Trim()
  $npmRaw = (& npm --version).Trim()
  Write-Host "Node: $nodeRaw"
  Write-Host "npm:  $npmRaw"
  if ($nodeRaw -notmatch '^v(\d+)\.(\d+)\.(\d+)$') {
    throw "Unable to parse Node.js version '$nodeRaw'. Install Node.js 22.23.4 from the official Windows MSI."
  }
  $nodeVersion = [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
  if ($nodeVersion -lt [version]'22.23.4' -or $nodeVersion.Major -ge 23) {
    throw "Node.js $nodeRaw is incompatible. VendorProof requires >=22.23.4 and <23. Install https://nodejs.org/dist/v22.23.4/node-v22.23.4-x64.msi, then reopen PowerShell. nvm is not required."
  }
}

function Set-EnvDefault {
  param(
    [string]$Path,
    [hashtable]$Defaults
  )

  $existing = if (Test-Path $Path) { Get-Content -Raw $Path } else { '' }
  $lines = if ([string]::IsNullOrWhiteSpace($existing)) { @() } else { @($existing.TrimEnd()) }
  foreach ($entry in $Defaults.GetEnumerator()) {
    if ($existing -notmatch "(?m)^$([regex]::Escape($entry.Key))=") {
      $lines += "$($entry.Key)=$($entry.Value)"
    }
  }
  Set-Content -Path $Path -Value (($lines -join [Environment]::NewLine) + [Environment]::NewLine) -NoNewline
}

function Assert-DockerEngine {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker CLI is not installed or not on PATH. Install/start Docker Desktop, then reopen PowerShell.'
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is installed but its engine is not running. Start Docker Desktop and rerun this script.'
  }
  docker compose config --quiet
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose configuration is invalid. Run docker compose config for details.'
  }
}

function Invoke-ComposeOrThrow {
  param([string[]]$Arguments)
  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'PostgreSQL container logs:'
    docker compose logs --no-color postgres
    throw "docker compose $($Arguments -join ' ') failed."
  }
}

Assert-NodeRuntime
Assert-DockerEngine

if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
Set-EnvDefault '.env' @{
  NODE_ENV = 'development'
  PORT = '3000'
  HOST = '127.0.0.1'
  API_CORS_ORIGIN = 'http://localhost:3001'
  DATABASE_URL = 'postgresql://vendorproof:vendorproof@127.0.0.1:5433/vendorproof'
}

$webEnv = Join-Path $repoRoot 'apps/web/.env.local'
if (-not (Test-Path $webEnv)) { New-Item -ItemType File -Path $webEnv -Force | Out-Null }
Set-EnvDefault $webEnv @{ NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:3000' }

if (-not $SkipInstall) {
  Write-Host 'Installing locked dependencies...'
  npm ci
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}

Write-Host 'Starting only the VendorProof PostgreSQL service on 127.0.0.1:5433...'
Invoke-ComposeOrThrow @('up', '-d', 'postgres')
Write-Host 'Waiting for PostgreSQL to accept connections...'
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T postgres pg_isready -U vendorproof -d vendorproof *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) {
  docker compose logs --no-color postgres
  throw 'PostgreSQL did not become ready within 60 seconds on 127.0.0.1:5433.'
}

$env:DATABASE_URL = 'postgresql://vendorproof:vendorproof@127.0.0.1:5433/vendorproof'
Write-Host 'Applying local migrations to the vendorproof database...'
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }

# The migration creates the restricted role without a password. This local-only
# password is used only for the disposable local integration run; it is never printed.
$localAppPasswordSql = "ALTER ROLE vendorproof_app PASSWORD 'vendorproof_app';"
$localAppPasswordSql | docker compose exec -T postgres psql -U vendorproof -d vendorproof -v ON_ERROR_STOP=1 *> $null
if ($LASTEXITCODE -ne 0) { throw 'Could not provision the local restricted runtime role.' }

$expectedMigrations = @(Get-ChildItem 'server/src/db/migrations' -Filter '*.sql').Count
$appliedMigrations = (docker compose exec -T postgres psql -U vendorproof -d vendorproof -tAc 'select count(*) from __vendorproof_migrations').Trim()
if ($LASTEXITCODE -ne 0 -or [int]$appliedMigrations -ne $expectedMigrations) {
  throw "Migration verification failed: expected $expectedMigrations applied migrations, found '$appliedMigrations'."
}
Write-Host "PostgreSQL ready; verified $appliedMigrations applied migrations in vendorproof."
Write-Host 'Setup complete. Start the API with npm run dev:api and the frontend with npm run dev:web.'
Write-Host 'Restart the Next.js dev server after changing apps/web/.env.local.'
