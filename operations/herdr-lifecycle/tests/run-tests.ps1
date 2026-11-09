Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$passed = 0
function Check([string]$name, [int]$expectedExit, [string]$expectedStatus, [string[]]$arguments) {
    $output = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File @arguments
    $code = $LASTEXITCODE
    if ($code -ne $expectedExit) { throw "$name exit $code, expected $expectedExit. Output: $output" }
    $json = ($output | Out-String | ConvertFrom-Json)
    if ($json.status -ne $expectedStatus) { throw "$name status $($json.status), expected $expectedStatus" }
    $script:passed++
    Write-Host "PASS $name"
}
Check 'Path A declared evidence' 0 'EVIDENCE_DECLARED' @("$root\herdr-preflight.ps1",'-Path','A','-EvidenceFile',"$PSScriptRoot\preflight-a.json")
Check 'Path B missing approval' 2 'BLOCKED' @("$root\herdr-preflight.ps1",'-Path','B','-EvidenceFile',"$PSScriptRoot\preflight-b-incomplete.json")
Check 'Path B empty sessions' 2 'BLOCKED' @("$root\herdr-preflight.ps1",'-Path','B','-EvidenceFile',"$PSScriptRoot\preflight-b-empty.json")
Check 'Path B declared recovery evidence' 0 'EVIDENCE_DECLARED' @("$root\herdr-preflight.ps1",'-Path','B','-EvidenceFile',"$PSScriptRoot\preflight-b-ready.json")
Check 'String true does not pass' 2 'BLOCKED' @("$root\herdr-preflight.ps1",'-Path','A','-EvidenceFile',"$PSScriptRoot\preflight-strings.json")
Check 'Missing input fails' 1 'ERROR' @("$root\herdr-preflight.ps1",'-Path','A','-EvidenceFile',"$PSScriptRoot\does-not-exist.json")
Check 'Matching evidence' 0 'EVIDENCE_MATCH' @("$root\herdr-verify.ps1",'-BeforeFile',"$PSScriptRoot\verify-before.json",'-AfterFile',"$PSScriptRoot\verify-before.json")
Check 'Missing conversation evidence' 2 'INCOMPLETE' @("$root\herdr-verify.ps1",'-BeforeFile',"$PSScriptRoot\verify-before.json",'-AfterFile',"$PSScriptRoot\verify-incomplete.json")
$fixture = "$PSScriptRoot\preflight-a.json"
$fixtureHash = (Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash
Check 'Artifact hash match' 0 'PLAN_ONLY' @("$root\herdr-update.ps1",'-Path','A','-ArtifactPath',$fixture,'-ExpectedSha256',$fixtureHash)
Check 'Artifact hash mismatch' 2 'BLOCKED' @("$root\herdr-update.ps1",'-Path','A','-ArtifactPath',$fixture,'-ExpectedSha256',('0' * 64))
foreach ($operation in @('detach','update','reconnect','rollback')) {
    Check "$operation plan A" 0 'PLAN_ONLY' @("$root\herdr-$operation.ps1",'-Path','A')
    Check "$operation plan B" 0 'PLAN_ONLY' @("$root\herdr-$operation.ps1",'-Path','B')
    Check "$operation live apply blocked" 2 'BLOCKED' @("$root\herdr-$operation.ps1",'-Path','A','-Apply')
    Check "$operation migration apply blocked" 2 'BLOCKED' @("$root\herdr-$operation.ps1",'-Path','B','-Apply')
}
Write-Host "TOTAL $passed passed"
