$ErrorActionPreference = "Stop"

function Parse-EnvFile {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $map }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        if ($line -match '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $k = $matches[1]
            $v = $matches[2].Trim()
            if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
                if ($v.Length -ge 2) { $v = $v.Substring(1, $v.Length-2) }
            }
            $map[$k] = $v
        }
    }
    return $map
}

function Get-MongoHosts {
    param([string]$Uri)
    if ([string]::IsNullOrWhiteSpace($Uri)) { return @() }
    $m = [regex]::Match($Uri, '^mongodb(?:\+srv)?://(?:[^@/]+@)?(?<hosts>[^/?]+)')
    if (-not $m.Success) { return @() }
    $hostsRaw = $m.Groups['hosts'].Value.Split(',')
    $hosts = foreach ($h in $hostsRaw) {
        $x = $h.Trim()
        if (-not $x) { continue }
        if ($x.StartsWith('[')) {
            $ix = $x.IndexOf(']')
            if ($ix -gt 0) { $x.Substring(1,$ix-1) } else { $x }
        } else {
            ($x -split ':')[0]
        }
    }
    return $hosts | Where-Object { $_ } | Select-Object -Unique
}

function Get-MongoScheme {
    param([string]$Uri)
    $m = [regex]::Match($Uri, '^(mongodb(?:\+srv)?)://')
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

$envPath = Join-Path (Get-Location) '.env'
$envMap = Parse-EnvFile -Path $envPath

$requiredKeys = @('MONGODB_URI','MONGODB_URI_FALLBACK','MONGODB_DB_NAME')
$stepResults = @()

$stepResults += [pscustomobject]@{ Step='1) Read .env safely'; Status= if (Test-Path -LiteralPath $envPath) {'PASS'} else {'FAIL'}; Detail= if (Test-Path -LiteralPath $envPath) {'.env loaded'} else {'.env not found'} }

$missing = $requiredKeys | Where-Object { -not $envMap.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($envMap[$_]) }
$stepResults += [pscustomobject]@{ Step='2) Required keys present'; Status= if ($missing.Count -eq 0) {'PASS'} else {'FAIL'}; Detail= if ($missing.Count -eq 0) {'All required keys exist'} else {('Missing: ' + ($missing -join ', '))} }

$primaryUri = $envMap['MONGODB_URI']
$fallbackUri = $envMap['MONGODB_URI_FALLBACK']

$primaryHosts = Get-MongoHosts -Uri $primaryUri
$fallbackHosts = Get-MongoHosts -Uri $fallbackUri

$stepResults += [pscustomobject]@{ Step='3) Extract hostnames (primary URI)'; Status= if ($primaryHosts.Count -gt 0) {'PASS'} else {'FAIL'}; Detail= if ($primaryHosts.Count -gt 0) {($primaryHosts -join ', ')} else {'No host extracted'} }
$stepResults += [pscustomobject]@{ Step='3) Extract hostnames (fallback URI)'; Status= if ($fallbackHosts.Count -gt 0) {'PASS'} else {'FAIL'}; Detail= if ($fallbackHosts.Count -gt 0) {($fallbackHosts -join ', ')} else {'No host extracted'} }

$primaryScheme = Get-MongoScheme -Uri $primaryUri
if ($primaryScheme -eq 'mongodb+srv' -and $primaryHosts.Count -gt 0) {
    $srvHost = @($primaryHosts)[0]
    try {
        $srv = Resolve-DnsName -Type SRV ("_mongodb._tcp." + $srvHost) -ErrorAction Stop
        $targets = $srv | Select-Object -ExpandProperty NameTarget -ErrorAction SilentlyContinue | Where-Object { $_ } | Select-Object -Unique
        $stepResults += [pscustomobject]@{ Step='4) SRV lookup for +srv host'; Status='PASS'; Detail= if ($targets) {('Targets: ' + ($targets -join ', '))} else {'SRV records found'} }
    } catch {
        $stepResults += [pscustomobject]@{ Step='4) SRV lookup for +srv host'; Status='FAIL'; Detail=$_.Exception.Message }
    }
} else {
    $stepResults += [pscustomobject]@{ Step='4) SRV lookup for +srv host'; Status='FAIL'; Detail='Primary URI is not mongodb+srv or host missing' }
}

if ($fallbackHosts.Count -gt 0) {
    $firstFallback = @($fallbackHosts)[0]
    try {
        $a = Resolve-DnsName -Name $firstFallback -Type A -ErrorAction Stop
        $ips = $a | Select-Object -ExpandProperty IPAddress -ErrorAction SilentlyContinue | Where-Object { $_ } | Select-Object -Unique
        $stepResults += [pscustomobject]@{ Step='5a) Fallback A lookup'; Status='PASS'; Detail= if ($ips) {('IPs: ' + ($ips -join ', '))} else {'A record resolved'} }
    } catch {
        $stepResults += [pscustomobject]@{ Step='5a) Fallback A lookup'; Status='FAIL'; Detail=$_.Exception.Message }
    }

    try {
        $tnc = Test-NetConnection -ComputerName $firstFallback -Port 27017 -WarningAction SilentlyContinue
        $ok = [bool]$tnc.TcpTestSucceeded
        $stepResults += [pscustomobject]@{ Step='5b) TCP 27017 to first fallback host'; Status= if ($ok) {'PASS'} else {'FAIL'}; Detail=("Host: " + $firstFallback + "; TcpTestSucceeded=" + $ok) }
    } catch {
        $stepResults += [pscustomobject]@{ Step='5b) TCP 27017 to first fallback host'; Status='FAIL'; Detail=$_.Exception.Message }
    }
} else {
    $stepResults += [pscustomobject]@{ Step='5) Fallback host tests'; Status='FAIL'; Detail='No fallback hosts extracted' }
}

$stepResults | Format-Table -AutoSize | Out-String -Width 240

