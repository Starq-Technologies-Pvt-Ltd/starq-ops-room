[CmdletBinding()]
param([ValidateSet('core','desktop')][string]$Component = 'core', [string]$FixtureFile = '', [switch]$Online)
. "$PSScriptRoot\herdr-common.ps1"
try {
    if ($Online -and $FixtureFile) { throw 'Choose Online or FixtureFile, not both.' }
    if ($Online) {
        $repo = if ($Component -eq 'core') { 'herdrdev/herdr' } else { 'sheprd-labs/sheprd' }
        $headers = @{ 'User-Agent' = 'Starq-Herdr-Lifecycle-Discovery'; 'Accept' = 'application/vnd.github+json' }
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers -TimeoutSec 15 -ErrorAction Stop
    } elseif ($FixtureFile) { $release = Read-JsonFile $FixtureFile }
    else { Write-Result 'discovery' 'NOT_CHECKED' @{ reason = 'Use -Online or -FixtureFile; no network request made.' }; exit 0 }
    $tag = Get-Field $release 'tag_name'; $url = Get-Field $release 'html_url'
    if (-not $tag -or -not $url) { throw 'Release response lacks a tag or URL.' }
    Write-Result 'discovery' 'DISCOVERED' @{ component = $Component; tag = $tag; releaseUrl = $url; publishedAt = (Get-Field $release 'published_at'); warning = 'Release discovery is not compatibility, signature, artifact integrity, or update authorization.' }
} catch { Write-Result 'discovery' 'ERROR' @{ message = $_.Exception.Message }; exit 1 }
