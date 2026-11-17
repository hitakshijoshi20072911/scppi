[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '../..')
Set-Location $repoRoot

Write-Host "Node: $(node --version)"
Write-Host "npm:  $(npm --version)"
if ((node --version) -ne 'v22.23.4') {
  Write-Warning 'VendorProof is tested with Node v22.23.4; install/use the version in .node-version.'
}

if (-not (Test-Path '.env')) { throw '.env is missing. Run .\scripts\dev\setup.ps1 first.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is not on PATH.' }

docker compose config | Out-Null
Write-Host 'Compose configuration: valid'
docker compose ps postgres
$ready = docker compose exec -T postgres pg_isready -U vendorproof -d vendorproof 2>$null
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL is not ready on 127.0.0.1:5433.' }
Write-Host 'PostgreSQL: ready'

npm run db:check
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run build
Write-Host 'VendorProof local checks completed.'
