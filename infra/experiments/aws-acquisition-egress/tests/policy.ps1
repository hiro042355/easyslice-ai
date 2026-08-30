$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$text = (Get-ChildItem -LiteralPath $root -Recurse -File |
    Where-Object { $_.FullName -notlike "$PSScriptRoot*" -and $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar).terraform$([IO.Path]::DirectorySeparatorChar)*" } |
    Get-Content -Raw) -join "`n"

$required = @(
  '10.87.0.0/24', '10.87.0.0/26', 'm7i.xlarge', 'http_tokens                 = "required"',
  'map_public_ip_on_launch = false', 'acquisition-control/v1/', 'AmazonSSMManagedInstanceCore',
  'sha256:9dc218d2f246f20c66f7dadaab6f1c1999ebb7132ad58e7543c1e5a8916d3a5e',
  'sha256:dde367547487b7458109508c69dbf8533f53d006b81d2616081095374d74d5f2'
)
foreach ($value in $required) { if (-not $text.Contains($value)) { throw "Missing required authority" } }

$variables = Get-Content -LiteralPath (Join-Path $root 'variables.tf') -Raw
$workerDigest = 'sha256:9dc218d2f246f20c66f7dadaab6f1c1999ebb7132ad58e7543c1e5a8916d3a5e'
$providerDigest = 'sha256:dde367547487b7458109508c69dbf8533f53d006b81d2616081095374d74d5f2'
if ([regex]::Matches($variables, [regex]::Escape($workerDigest)).Count -ne 2) {
  throw 'Worker immutable digest must be the exact default and validation authority.'
}
if ([regex]::Matches($variables, [regex]::Escape($providerDigest)).Count -ne 2) {
  throw 'Provider immutable digest must be the exact default and validation authority.'
}

$main = Get-Content -LiteralPath (Join-Path $root 'main.tf') -Raw
$userDataTemplate = Get-Content -LiteralPath (Join-Path $root 'templates/user-data.sh.tftpl') -Raw
foreach ($script in @('readiness', 'run-once', 'verify-safeguard.py')) {
  if (-not $main.Contains("base64gzip(file(`"`${path.module}/runtime/$script`"))")) {
    throw "Runtime script must remain repository-owned and gzip-embedded: $script"
  }
}
if (($userDataTemplate | Select-String -Pattern 'base64 -d \| gzip -d' -AllMatches).Matches.Count -ne 3) {
  throw 'All closed runtime scripts must be locally decoded from immutable user_data.'
}
if ($userDataTemplate -match 'curl.+\|.+(ba)?sh|github\.com|raw\.githubusercontent\.com') {
  throw 'Mutable or untrusted runtime download is forbidden.'
}
if (-not $main.Contains('length(aws_instance.experiment.user_data) <= 15000')) {
  throw 'The rendered user_data 15,000-byte safety budget must remain enforced.'
}

$safeguardVerifier = Get-Content -LiteralPath (Join-Path $root 'runtime/verify-safeguard.py') -Raw
foreach ($requiredSafeguardBoundary in @(
  'busctl', 'NextElapseUSecRealtime', 'NextElapseUSecMonotonic',
  'time.CLOCK_MONOTONIC', 'FUTURE_PROVEN', 'TIMESTAMP_UNAVAILABLE',
  'EXPIRED_PROVEN', 'INCONSISTENT'
)) {
  if (-not $safeguardVerifier.Contains($requiredSafeguardBoundary)) {
    throw "Missing safeguard verification boundary: $requiredSafeguardBoundary"
  }
}
if ($safeguardVerifier.Contains('list-timers')) {
  throw 'Human-readable list-timers output must not be verification authority.'
}

$forbidden = @('allUsers', 'allAuthenticatedUsers', 'google_service_account_key', 'aws_key_pair', 'aws_nat_gateway', '0.0.0.0/0"`n  ingress')
foreach ($value in $forbidden) { if ($text.Contains($value)) { throw "Forbidden authority present: $value" } }

$main = Get-Content -LiteralPath (Join-Path $root 'main.tf') -Raw
if (($main | Select-String -Pattern 'resource "aws_eip"' -AllMatches).Matches.Count -ne 1) { throw 'Elastic IP count must be one' }
if (($main | Select-String -Pattern '^\s*ingress\s*{' -AllMatches).Matches.Count -ne 0) { throw 'Ingress must be empty' }
if ($main.Contains('nexcut-prod-acquisition-worker') -or $main.Contains('nexcut-prod-acquisition-worker-egress-b')) { throw 'Production Cloud Run authority referenced' }

Write-Output 'AWS acquisition experiment policy: PASS'
