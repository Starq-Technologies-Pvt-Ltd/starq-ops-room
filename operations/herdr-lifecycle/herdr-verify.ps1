[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BeforeFile, [Parameter(Mandatory=$true)][string]$AfterFile)
. "$PSScriptRoot\herdr-common.ps1"
try {
    $before = Read-JsonFile $BeforeFile; $after = Read-JsonFile $AfterFile
    $checks = [ordered]@{}
    foreach ($name in @('windowsServerIdentity','wslServerIdentity','windowsWorkspaceEvidence','wslWorkspaceEvidence','agentConversationEvidence','remoteControlEvidence','acpEvidence','configurationEvidence')) {
        $b = Get-Field $before $name; $a = Get-Field $after $name
        $checks[$name] = ($null -ne $b -and $null -ne $a -and $b -is [string] -and $a -is [string] -and $b.Trim() -ne '' -and $a.Trim() -ne '' -and $b -eq $a)
    }
    $failed = @($checks.Keys | Where-Object { -not $checks[$_] })
    Write-Result 'verify' $(if ($failed.Count) { 'INCOMPLETE' } else { 'EVIDENCE_MATCH' }) @{ checks = $checks; missingOrChanged = $failed; warning = 'Matching supplied evidence is not a health or activity probe; verify provenance and agent activity separately.' }
    if ($failed.Count) { exit 2 }
} catch { Write-Result 'verify' 'ERROR' @{ message = $_.Exception.Message }; exit 1 }
