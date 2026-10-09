# Deploy the preserved Business OS migration sequence to its dedicated, disposable
# Supabase staging project. No production, Telegram or ProPulse database is targeted.
#
# Run from the repository root:
#   pwsh -File scripts/deploy-interior-os-db.ps1
#   pwsh -File scripts/deploy-interior-os-db.ps1 -Apply
#
# Prerequisites: Node.js/npm/npx, a Supabase CLI login (npx supabase login),
# a reviewed staging target and interactive database-password access.
# Without -Apply, this script only links and previews the migrations.

param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$ProjectRef = 'wqkjzuqiarjyoimrzalk'
$ForbiddenRefs = @(
    'iioufogthnlwzxlxxdna', # existing Telegram bot
    'tnlamwifelkwxnvcjkkb'  # existing ProPulse Business
)
if ($ForbiddenRefs -contains $ProjectRef) {
    throw 'Refusing to target an existing, unrelated Supabase project.'
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DatabaseRoot = Join-Path $Root 'packages/database'
$MigrationDirectory = Join-Path $DatabaseRoot 'supabase/migrations'

if (-not (Test-Path $MigrationDirectory)) {
    throw 'Migration directory missing. Run from a complete Git checkout.'
}

$Migrations = @(Get-ChildItem $MigrationDirectory -Filter '*.sql' -File | Sort-Object Name)
if ($Migrations.Count -ne 103) {
    throw "Refusing deployment: expected 103 migrations, found $($Migrations.Count)."
}
if ($Migrations[0].Name -ne '20260927000000_baseline.sql' -or
    $Migrations[-1].Name -ne '20261008000100_report_snapshot_pagination.sql') {
    throw 'Refusing deployment: first/last migration does not match the release manifest.'
}

& node (Join-Path $DatabaseRoot 'scripts/check-preserved-migrations.mjs')
if ($LASTEXITCODE -ne 0) {
    throw 'Preserved migration hash verification failed.'
}

function Invoke-Supabase {
    param([string[]]$Arguments)
    $npxCommand = if ($env:OS -eq 'Windows_NT') { 'npx.cmd' } else { 'npx' }
    & $npxCommand --yes supabase @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Supabase CLI command failed: $($Arguments -join ' ')"
    }
}

Push-Location $DatabaseRoot
try {
    Write-Host "Linking ONLY to Interior Business OS staging project $ProjectRef" -ForegroundColor Cyan
    Write-Host 'CLI login and database password might be requested. Do not enter credentials in Git or chat.'
    Invoke-Supabase -Arguments @('link', '--project-ref', $ProjectRef)

    Write-Host 'Existing remote migration history:' -ForegroundColor Cyan
    Invoke-Supabase -Arguments @('migration', 'list', '--linked')
    Write-Host 'Previewing the 103 migration files; no changes applied:' -ForegroundColor Cyan
    Invoke-Supabase -Arguments @('db', 'push', '--dry-run')

    if (-not $Apply) {
        Write-Host 'Preview complete. After reviewing, use -Apply to deploy.' -ForegroundColor Green
        exit 0
    }

    $Confirmation = Read-Host "Type the exact project ref $ProjectRef to apply these 103 migrations"
    if ($Confirmation -cne $ProjectRef) {
        throw 'Project identity confirmation failed. No migrations applied.'
    }
    Write-Host 'Applying tracked migrations using their original versions...' -ForegroundColor Yellow
    Invoke-Supabase -Arguments @('db', 'push')
    Write-Host 'Verifying remote migration history...' -ForegroundColor Cyan
    Invoke-Supabase -Arguments @('migration', 'list', '--linked')
    Write-Host 'Migration push completed. Run hosted security and tenant-isolation acceptance before production.' -ForegroundColor Green
}
finally {
    Pop-Location
}
