# Deploy the aligner-portal-auth Edge Function + its secrets to Supabase.
#
# Reads all sensitive values from the main app's .env (C:\ShwNodApp\.env) so no
# secret is hardcoded here or typed at the prompt. Auth uses the Supabase
# personal access token (SUPABASE_FAILOVER_ACCESS_TOKEN) — no interactive
# `supabase login` / browser needed.
#
# Run from the portal folder:   powershell -ExecutionPolicy Bypass -File scripts\deploy-auth-fn.ps1

$ErrorActionPreference = 'Stop'
$ProjectRef = 'ucfbpflrhggxvejhhqhx'
$EnvFile = 'C:\ShwNodApp\.env'

if (-not (Test-Path $EnvFile)) { throw "Main app .env not found at $EnvFile" }

# --- minimal .env parser (KEY=VALUE, ignores comments/blank lines) ----------
$envMap = @{}
foreach ($line in Get-Content $EnvFile) {
  $t = $line.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $i = $t.IndexOf('=')
  if ($i -lt 1) { continue }
  $k = $t.Substring(0, $i).Trim()
  $v = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
  if (-not $envMap.ContainsKey($k)) { $envMap[$k] = $v }
}

function Need($key) {
  if (-not $envMap.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envMap[$key])) {
    throw "Missing '$key' in $EnvFile"
  }
  return $envMap[$key]
}

# Map main-app .env keys -> edge-function secret names.
$accessToken   = Need 'SUPABASE_FAILOVER_ACCESS_TOKEN'  # CLI auth
$jwtSecret     = Need 'SUPABASE_JWT_SECRET'             # -> PORTAL_JWT_SECRET
$cfTeam        = Need 'CF_ACCESS_TEAM_DOMAIN'
$cfAud         = Need 'CF_ACCESS_AUD'
$allowedOrigin = Need 'PORTAL_ALLOWED_ORIGIN'

$env:SUPABASE_ACCESS_TOKEN = $accessToken

Write-Host "Setting function secrets on project $ProjectRef ..." -ForegroundColor Cyan
npx --yes supabase secrets set `
  "PORTAL_JWT_SECRET=$jwtSecret" `
  "CF_ACCESS_TEAM_DOMAIN=$cfTeam" `
  "CF_ACCESS_AUD=$cfAud" `
  "PORTAL_ALLOWED_ORIGIN=$allowedOrigin" `
  --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw "secrets set failed ($LASTEXITCODE)" }

Write-Host "Deploying function aligner-portal-auth ..." -ForegroundColor Cyan
npx --yes supabase functions deploy aligner-portal-auth --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw "functions deploy failed ($LASTEXITCODE)" }

Write-Host "Done. Function URL: https://$ProjectRef.supabase.co/functions/v1/aligner-portal-auth" -ForegroundColor Green
