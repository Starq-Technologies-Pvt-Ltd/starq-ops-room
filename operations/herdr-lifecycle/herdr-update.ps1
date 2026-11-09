[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('A','B')][string]$Path, [string]$ArtifactPath = '', [string]$ExpectedSha256 = '', [switch]$Apply)
. "$PSScriptRoot\herdr-common.ps1"
if ($Apply) { Stop-LiveApply 'update' }
$steps = if ($Path -eq 'A') { @('Verify integrity and compatibility for exact versions','Stage client side by side only after approval and independent review','Keep Windows and WSL server processes intact','Compare process identity and verify connections') } else { @('Classify every session and verify recovery capability','Preserve and verify backups and rollback','Obtain explicit Founder approval for exact migration','Use only a documented supported migration after independent review','Verify process, conversation and workspace outcomes separately') }
try {
    $artifact = @{ status = 'NOT_CHECKED' }
    if ($ArtifactPath -or $ExpectedSha256) {
        if (-not $ArtifactPath -or $ExpectedSha256 -notmatch '^[a-fA-F0-9]{64}$' -or -not (Test-Path -LiteralPath $ArtifactPath -PathType Leaf)) { throw 'An existing artifact and a 64-digit SHA256 are both required.' }
        $actual = (Get-FileHash -LiteralPath $ArtifactPath -Algorithm SHA256).Hash
        $artifact = @{ status = $(if ($actual -eq $ExpectedSha256) { 'HASH_MATCH' } else { 'HASH_MISMATCH' }); sha256 = $actual }
        if ($actual -ne $ExpectedSha256) { Write-Result 'update' 'BLOCKED' @{ path = $Path; artifact = $artifact; executed = $false }; exit 2 }
    }
    Write-Result 'update' 'PLAN_ONLY' @{ path = $Path; steps = $steps; artifact = $artifact; executed = $false; implementation = 'Invoke-DesktopUpdate (Path A) and Invoke-ServerMigration (Path B) in herdr-ops.ps1, sandbox-tested only.'; note = 'This entry point performs no download, install, handoff or restart. A bare operator-supplied hash proves nothing about provenance: the operational path requires release evidence with two agreeing published hash sources and the pinned Authenticode publisher.' }
} catch { Write-Result 'update' 'ERROR' @{ message = $_.Exception.Message }; exit 1 }
