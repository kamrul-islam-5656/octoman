param(
    [string]$EnvPath = '.env'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Parse-QueryString {
    param([string]$Query)
    $map = [ordered]@{}
    if ([string]::IsNullOrWhiteSpace($Query)) { return $map }

    foreach ($pair in ($Query -split '&')) {
        if ([string]::IsNullOrWhiteSpace($pair)) { continue }
        $kv = $pair -split '=', 2
        $k = [System.Uri]::UnescapeDataString($kv[0])
        if ([string]::IsNullOrWhiteSpace($k)) { continue }
        $v = if ($kv.Count -gt 1) { [System.Uri]::UnescapeDataString($kv[1]) } else { '' }
        if (-not $map.Contains($k)) { $map[$k] = $v }
    }
    return $map
}

if (-not (Test-Path -LiteralPath $EnvPath)) {
    throw ".env file not found at $EnvPath"
}

$lines = Get-Content -LiteralPath $EnvPath
$mongoIdx = -1
$mongoRaw = $null

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*MONGODB_URI\s*=') {
        $mongoIdx = $i
        $mongoRaw = ($lines[$i] -replace '^\s*MONGODB_URI\s*=\s*', '')
        break
    }
}

if ($mongoIdx -lt 0) {
    throw 'MONGODB_URI not found in .env'
}

$mongoUri = $mongoRaw.Trim()
if (($mongoUri.StartsWith('"') -and $mongoUri.EndsWith('"')) -or ($mongoUri.StartsWith("'") -and $mongoUri.EndsWith("'"))) {
    $mongoUri = $mongoUri.Substring(1, $mongoUri.Length - 2)
}

if (-not $mongoUri.StartsWith('mongodb+srv://')) {
    Write-Output 'Status: MONGODB_URI is not mongodb+srv://; no updates applied.'
    exit 0
}

$uri = [System.Uri]$mongoUri
$clusterHost = $uri.Host
$dnsBase = "_mongodb._tcp.$clusterHost"

$srvRecords = Resolve-DnsName -Type SRV -Name $dnsBase -ErrorAction Stop
$hosts = @()
foreach ($rec in $srvRecords) {
    if ($null -ne $rec.NameTarget -and $null -ne $rec.Port) {
        $target = $rec.NameTarget.TrimEnd('.')
        $hosts += "${target}:$($rec.Port)"
    }
}
$hosts = $hosts | Select-Object -Unique
if (-not $hosts -or $hosts.Count -eq 0) {
    throw 'No SRV hosts resolved.'
}

$txtRecords = Resolve-DnsName -Type TXT -Name $dnsBase -ErrorAction SilentlyContinue
$txtQueryParts = @()
if ($txtRecords) {
    foreach ($txt in $txtRecords) {
        if ($txt.Strings) {
            $joined = ($txt.Strings -join '')
            if (-not [string]::IsNullOrWhiteSpace($joined)) { $txtQueryParts += $joined }
        }
    }
}
$txtQuery = $txtQueryParts -join '&'

$origQuery = $uri.Query.TrimStart('?')
$origOpts = Parse-QueryString -Query $origQuery
$txtOpts = Parse-QueryString -Query $txtQuery

foreach ($k in $txtOpts.Keys) {
    if (-not $origOpts.Contains($k)) {
        $origOpts[$k] = $txtOpts[$k]
    }
}

$auth = if ([string]::IsNullOrEmpty($uri.UserInfo)) { '' } else { "$($uri.UserInfo)@" }
$path = $uri.AbsolutePath
if ([string]::IsNullOrEmpty($path)) { $path = '/' }
if (-not $path.StartsWith('/')) { $path = "/$path" }

$seedList = ($hosts -join ',')
$fallbackUri = "mongodb://$auth$seedList$path"

if ($origOpts.Count -gt 0) {
    $pairs = foreach ($entry in $origOpts.GetEnumerator()) {
        "{0}={1}" -f [System.Uri]::EscapeDataString([string]$entry.Key), [System.Uri]::EscapeDataString([string]$entry.Value)
    }
    $fallbackUri += '?' + ($pairs -join '&')
}

$updates = @{}
$updates['MONGODB_URI_FALLBACK'] = $fallbackUri
$updates['MONGODB_CONNECT_MODE'] = 'fallback'

foreach ($key in $updates.Keys) {
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$([regex]::Escape($key))\s*=") {
            $lines[$i] = "$key=$($updates[$key])"
            $found = $true
            break
        }
    }
    if (-not $found) {
        $lines += "$key=$($updates[$key])"
    }
}

Set-Content -LiteralPath $EnvPath -Value $lines -Encoding UTF8

Write-Output ("Status: Updated keys: {0}; SRV hosts: {1}" -f (($updates.Keys | Sort-Object) -join ', '), $hosts.Count)

