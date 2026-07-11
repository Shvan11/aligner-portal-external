# Deploy the aligner-portal-photos Edge Function + its R2 secrets to Supabase.
#
# Reads all sensitive values from the main app's .env (C:\ShwNodApp\.env) so no
# secret is hardcoded here or typed at the prompt — same pattern as
# deploy-auth-fn.ps1. PORTAL_JWT_SECRET / PORTAL_ALLOWED_ORIGIN are already set
# project-wide by that script; this one adds the R2 block:
#
#   R2_ACCOUNT_ID        <- CLOUDFLARE_ACCOUNT_ID   (same Cloudflare account)
#   R2_ACCESS_KEY_ID     <- R2_ACCESS_KEY_ID        (the 'aligner-portal-writer'
#   R2_SECRET_ACCESS_KEY <- R2_SECRET_ACCESS_KEY     R2 API token: Object Read &
#                                                    Write, scoped to the bucket)
#   R2_BUCKET_NAME       <- R2_BUCKET_NAME           (optional; default aligner-portal-files)
#
# One-time Cloudflare setup before first run (dashboard → R2). The bucket is the
# pre-existing (empty) 'aligner-portal-files' left from the old pipeline:
#   1. Create API token 'aligner-portal-writer' (Object Read & Write, that bucket
#      only) and put its Access Key ID / Secret Access Key in C:\ShwNodApp\.env.
#      REVOKE the old 'aligner-portal-edge-functions' token (its keys are in git
#      history — burned).
#   2. Bucket → Settings → CORS policy → paste ../r2-cors.json (browsers PUT
#      directly to presigned URLs; replaces the old pipeline's stale origins).
#
# Run from the portal folder:   powershell -ExecutionPolicy Bypass -File scripts\deploy-photos-fn.ps1

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

$accessToken = Need 'SUPABASE_FAILOVER_ACCESS_TOKEN'   # CLI auth
$r2Account   = Need 'CLOUDFLARE_ACCOUNT_ID'            # -> R2_ACCOUNT_ID
$r2KeyId     = Need 'R2_ACCESS_KEY_ID'
$r2Secret    = Need 'R2_SECRET_ACCESS_KEY'
$r2Bucket    = if ($envMap.ContainsKey('R2_BUCKET_NAME') -and $envMap['R2_BUCKET_NAME']) { $envMap['R2_BUCKET_NAME'] } else { 'aligner-portal-files' }

$env:SUPABASE_ACCESS_TOKEN = $accessToken

Write-Host "Setting R2 secrets on project $ProjectRef ..."
supabase secrets set --project-ref $ProjectRef `
  "R2_ACCOUNT_ID=$r2Account" `
  "R2_ACCESS_KEY_ID=$r2KeyId" `
  "R2_SECRET_ACCESS_KEY=$r2Secret" `
  "R2_BUCKET_NAME=$r2Bucket"
if ($LASTEXITCODE -ne 0) { throw "supabase secrets set failed ($LASTEXITCODE)" }

Write-Host "Deploying aligner-portal-photos ..."
supabase functions deploy aligner-portal-photos --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw "supabase functions deploy failed ($LASTEXITCODE)" }

Write-Host "Done. Photos flow through the private R2 bucket '$r2Bucket'."
