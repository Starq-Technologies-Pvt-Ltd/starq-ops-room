Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Write-Result($stage, $status, $details) {
    [ordered]@{ schema = 'starq.herdr.lifecycle.v1'; timestampUtc = [DateTime]::UtcNow.ToString('o'); stage = $stage; status = $status; details = $details } | ConvertTo-Json -Depth 20
}
function Read-JsonFile([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Input file not found: $path" }
    Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}
function Get-Field($object, [string]$name, $fallback = $null) {
    if ($null -eq $object) { return $fallback }
    $property = $object.PSObject.Properties[$name]
    if ($null -eq $property) { return $fallback }
    return $property.Value
}
function Require-True($value) { return ($value -is [bool] -and $value -eq $true) }
function Stop-LiveApply([string]$stage) {
    Write-Result $stage 'BLOCKED' @{ reason = 'Live execution is disabled: independent review and operational authorization are outstanding.' }
    exit 2
}
function Invoke-FixedHerdr([string]$binary, [string[]]$arguments) {
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { return @{ ok = $false; error = 'binary_missing' } }
    try {
        $output = & $binary @arguments 2>&1 | Out-String
        if ($LASTEXITCODE -ne 0) { return @{ ok = $false; error = 'command_failed'; exitCode = $LASTEXITCODE } }
        return @{ ok = $true; output = $output.Trim() }
    } catch { return @{ ok = $false; error = 'command_failed' } }
}
