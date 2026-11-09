# Fixture-only implementation. No production Herdr command or installation is called.
# Phase 3: rebuilt on herdr-safefs.ps1 (locked-handle hashing, no-overwrite commits, hard-link, reparse,
# stream and aliasing refusal). Function names and return values from Phase 2 are preserved.
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\herdr-safefs.ps1"

function Get-FixtureParent {
    # Default is the Phase 2 location. A session may name its own parent through STARQ_HERDR_FIXTURE_PARENT,
    # but only beneath D:\StarqTech\scratch and only a directory called herdr-lifecycle-fixtures.
    $default = 'D:\StarqTech\scratch\codex\herdr-lifecycle-fixtures'
    $requested = [Environment]::GetEnvironmentVariable('STARQ_HERDR_FIXTURE_PARENT')
    if ([string]::IsNullOrWhiteSpace($requested)) { return $default }
    $candidate = Get-NormalizedPath $requested
    if (-not $candidate.StartsWith('D:\StarqTech\scratch\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture parent must stay under D:\StarqTech\scratch.' }
    if ((Split-Path -Leaf $candidate) -ne 'herdr-lifecycle-fixtures') { throw 'Fixture parent must be named herdr-lifecycle-fixtures.' }
    return $candidate
}
function Get-FixtureRoot([string]$Root) {
    $allowed = Get-FixtureParent
    $actual = Get-NormalizedPath $Root
    if (-not $actual.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture root is outside the authorized test area.' }
    if (-not (Test-Path -LiteralPath $actual -PathType Container)) { throw 'Fixture root missing.' }
    Assert-NoReparseChain $actual
    if (-not (Test-Path -LiteralPath (Join-Path $actual '.fixture-only') -PathType Leaf)) { throw 'Fixture marker missing.' }
    return $actual
}
function Get-FixturePath([string]$Root, [string]$Relative) { return Resolve-ConfinedPath $Root $Relative }

function Invoke-FixtureBackup([string]$Root, [string]$Source, [string]$Backup) {
    $rootPath = Get-FixtureRoot $Root; $src = Get-FixturePath $rootPath $Source; $dst = Get-FixturePath $rootPath $Backup
    Assert-PlainFile $src | Out-Null
    if (Test-Path -LiteralPath $dst) {
        Assert-PlainFile $dst | Out-Null
        if ((Get-LockedSha256 $src) -eq (Get-LockedSha256 $dst)) { return 'UNCHANGED' }
        throw 'Backup exists with different content.'
    }
    Copy-FileVerified -Source $src -Destination $dst | Out-Null
    return 'BACKED_UP'
}
function Invoke-FixtureStage([string]$Root, [string]$Source, [string]$Destination, [string]$Sha256, [switch]$SimulateInterrupt) {
    $rootPath = Get-FixtureRoot $Root; $src = Get-FixturePath $rootPath $Source; $dst = Get-FixturePath $rootPath $Destination
    if ($Sha256 -notmatch '^[0-9a-fA-F]{64}$') { throw 'Artifact or hash invalid.' }
    if (Test-Path -LiteralPath $dst) {
        Assert-PlainFile $dst | Out-Null
        if ((Get-LockedSha256 $dst) -eq $Sha256.ToUpperInvariant()) { return 'UNCHANGED' }
        throw 'Destination already exists.'
    }
    $interrupt = $null
    if ($SimulateInterrupt) { $interrupt = { throw 'Simulated interrupted installation; partial retained.' } }
    Copy-FileVerified -Source $src -Destination $dst -ExpectedSha256 $Sha256 -BeforeCommit $interrupt | Out-Null
    return 'STAGED'
}
function Invoke-FixtureRollback([string]$Root, [string]$Backup, [string]$Target, [string]$ExpectedCurrentHash) {
    $rootPath = Get-FixtureRoot $Root; $src = Get-FixturePath $rootPath $Backup; $dst = Get-FixturePath $rootPath $Target
    Assert-PlainFile $src | Out-Null
    Restore-FileAtomic -Backup $src -Target $dst -ExpectedBackupSha256 (Get-LockedSha256 $src) -ExpectedCurrentSha256 $ExpectedCurrentHash | Out-Null
    return 'RESTORED'
}
function Test-FixturePreflight($components, $sessions) {
    if (@($components).Count -eq 0) { throw 'No component evidence.' }
    foreach ($component in @($components)) {
        if ($component.connected -ne $true) { throw 'Connection failure.' }
        if ($component.compatible -ne $true) { throw 'Version incompatible.' }
        if ($component.backupVerified -ne $true) { throw 'Backup incomplete.' }
    }
    foreach ($session in @($sessions)) { if ($session.recoveryVerified -ne $true) { throw 'Session recovery failed.' } }
    return 'FIXTURE_READY'
}
