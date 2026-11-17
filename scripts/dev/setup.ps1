[CmdletBinding()]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
Set-Location $repoRoot

function Set-EnvDefault {
  param(
    [string]$Path,
    [hashtable]$Defaults
  )

  $existing = if (Test-Path $Path) { Get-Content -Raw $Path } else { '' }
  $lines = @($existing.TrimEnd())
  foreach ($entry in $Defaults.GetEnumerator()) {
    if ($existing -notmatch "(?m)^$([regex]::Escape($entry.Key))=") {
      $lines += "$($entry.Key)=$($entry.Value)"
    }
  }
  Set-Content -Path $Path -Value (($lines -join [Environment]::NewLine) + [Environment]::NewLine) -NoNewline
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
}
Set-EnvDefault '.env' @{
  NODE_ENV = 'development'
  PORT = '3000'
  API_CORS_ORIGIN = 'http://localhost:3001'
  DATABASE_URL = 'postgresql://vendorproof:vendorproof@127.0.0.1:5433/vendorproof'
}

$webEnv = 'apps/web/.env.local'
if (-not (Test-Path $webEnv)) {
  New-Item -ItemType File -Path $webEnv -Force | Out-Null
}
Set-EnvDefault $webEnv @{ NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3000' }

if (-not $SkipInstall) {
  Write-Host 'Installing locked dependencies...'
  npm ci
}

Write-Host 'Starting the VendorProof PostgreSQL container on 127.0.0.1:5433...'
docker compose up -d postgres
Write-Host 'Waiting for PostgreSQL...'
for ($i = 0; $i -lt 30; $i++) {
  $ready = docker compose exec -T postgres pg_isready -U vendorproof -d vendorproof 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep -Seconds 2
  if ($i -eq 29) { throw 'PostgreSQL did not become ready. Run .\scripts\dev\check.ps1 for diagnostics.' }
}

Write-Host 'Applying local migrations...'
$env:DATABASE_URL = 'postgresql://vendorproof:vendorproof@127.0.0.1:5433/vendorproof'
npm run db:migrate
Write-Host 'Setup complete. Start the API with npm run dev:api and the web app with npm run dev:web.'
