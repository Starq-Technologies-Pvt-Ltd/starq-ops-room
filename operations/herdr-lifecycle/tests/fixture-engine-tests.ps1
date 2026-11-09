Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'herdr-fixture-engine.ps1')
$parent = Get-FixtureParent
$root = Join-Path $parent ([Guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $root -Force | Out-Null
Set-Content -LiteralPath (Join-Path $root '.fixture-only') -Value 'fixture'
Set-Content -LiteralPath (Join-Path $root 'original.bin') -Value 'old'
Set-Content -LiteralPath (Join-Path $root 'update.bin') -Value 'new'
$passed = 0
function Assert($condition, [string]$name) { if (-not $condition) { throw "FAIL $name" }; $script:passed++; Write-Host "PASS $name" }
function Refuses([scriptblock]$action, [string]$name) { $failed = $false; try { & $action | Out-Null } catch { $failed = $true }; Assert $failed $name }
$newHash = (Get-FileHash -LiteralPath (Join-Path $root 'update.bin')).Hash
Assert ((Invoke-FixtureBackup $root 'original.bin' 'backup.bin') -eq 'BACKED_UP') 'backup created'
Assert ((Invoke-FixtureBackup $root 'original.bin' 'backup.bin') -eq 'UNCHANGED') 'backup idempotent'
Refuses { Invoke-FixtureBackup $root 'missing.bin' 'missing-backup.bin' } 'incomplete backup rejected'
Assert ((Invoke-FixtureStage $root 'update.bin' 'staged.bin' $newHash) -eq 'STAGED') 'side by side stage'
Assert ((Invoke-FixtureStage $root 'update.bin' 'staged.bin' $newHash) -eq 'UNCHANGED') 'stage idempotent'
Refuses { Invoke-FixtureStage $root 'update.bin' 'bad.bin' ('0' * 64) } 'integrity mismatch rejected'
Refuses { Invoke-FixtureStage $root 'update.bin' 'interrupted.bin' $newHash -SimulateInterrupt } 'interruption detected'
Assert (-not (Test-Path -LiteralPath (Join-Path $root 'interrupted.bin'))) 'interrupted final absent'
Refuses { Invoke-FixtureStage $root 'update.bin' 'interrupted.bin' $newHash } 'partial not overwritten'
Refuses { Invoke-FixtureStage $root 'update.bin' '..\outside.bin' $newHash } 'path escape rejected'
Refuses { Invoke-FixtureRollback $root 'backup.bin' 'staged.bin' ('0' * 64) } 'changed target refused'
Assert ((Invoke-FixtureRollback $root 'backup.bin' 'staged.bin' $newHash) -eq 'RESTORED') 'rollback restores backup'
Assert ((Get-FileHash -LiteralPath (Join-Path $root 'staged.bin')).Hash -eq (Get-FileHash -LiteralPath (Join-Path $root 'backup.bin')).Hash) 'rollback hash'
$win = @{ name='windows'; connected=$true; compatible=$true; backupVerified=$true }
$wsl = @{ name='ubuntu'; connected=$true; compatible=$true; backupVerified=$true }
Assert ((Test-FixturePreflight @($win,$wsl) @(@{recoveryVerified=$true})) -eq 'FIXTURE_READY') 'both backends ready'
Refuses { Test-FixturePreflight @($win,@{connected=$false;compatible=$true;backupVerified=$true}) @() } 'connection failure'
Refuses { Test-FixturePreflight @($win,@{connected=$true;compatible=$false;backupVerified=$true}) @() } 'version incompatibility'
Refuses { Test-FixturePreflight @($win,@{connected=$true;compatible=$true;backupVerified=$false}) @() } 'missing backup evidence'
Refuses { Test-FixturePreflight @($win,$wsl) @(@{recoveryVerified=$false}) } 'failed recovery'
Write-Host "TOTAL $passed passed; retained fixture root: $root"
