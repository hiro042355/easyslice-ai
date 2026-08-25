$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$text = (Get-ChildItem -LiteralPath $root -Recurse -File |
    Where-Object { $_.FullName -notlike "$PSScriptRoot*" -and $_.FullName -notlike "*$([IO.Path]::DirectorySeparatorChar).terraform$([IO.Path]::DirectorySeparatorChar)*" } |
    Get-Content -Raw) -join "`n"

$required = @(
  '10.87.0.0/24', '10.87.0.0/26', 'm7i.xlarge', 'http_tokens                 = "required"',
  'map_public_ip_on_launch = false', 'acquisition-control/v1/', 'AmazonSSMManagedInstanceCore',
  'sha256:508e34e650a6cf1fa10ad451e9b9b78b6abe8af2b7c4a07fd16b3f899a7c01d0',
  'sha256:dde367547487b7458109508c69dbf8533f53d006b81d2616081095374d74d5f2'
)
foreach ($value in $required) { if (-not $text.Contains($value)) { throw "Missing required authority" } }

$forbidden = @('allUsers', 'allAuthenticatedUsers', 'google_service_account_key', 'aws_key_pair', 'aws_nat_gateway', '0.0.0.0/0"`n  ingress')
foreach ($value in $forbidden) { if ($text.Contains($value)) { throw "Forbidden authority present: $value" } }

$main = Get-Content -LiteralPath (Join-Path $root 'main.tf') -Raw
if (($main | Select-String -Pattern 'resource "aws_eip"' -AllMatches).Matches.Count -ne 1) { throw 'Elastic IP count must be one' }
if (($main | Select-String -Pattern '^\s*ingress\s*{' -AllMatches).Matches.Count -ne 0) { throw 'Ingress must be empty' }
if ($main.Contains('nexcut-prod-acquisition-worker') -or $main.Contains('nexcut-prod-acquisition-worker-egress-b')) { throw 'Production Cloud Run authority referenced' }

Write-Output 'AWS acquisition experiment policy: PASS'
