# Deploy the aligner-portal-cases Edge Function + its case-config secrets to Supabase.
#
# Reads all values from the main app's .env (C:\ShwNodApp\.env) so nothing is
# hardcoded here or typed at the prompt — same pattern as deploy-photos-fn.ps1.
# PORTAL_JWT_SECRET / PORTAL_ALLOWED_ORIGIN and SUPABASE_URL / SERVICE_ROLE_KEY are
# already set project-wide (deploy-auth-fn / deploy-photos-fn); this one adds the
# three per-deployment case knobs:
#
#   PORTAL_CASE_WORK_TYPE_ID  <- the aligner work_types.id (confirm against the live DB:
#                                SELECT id, name FROM work_types)
#   PORTAL_CASE_DR_ID         <- a valid employees.id       (the local works.dr_id FK
#                                enforces it when the row reverse-syncs home)
#   PORTAL_CASE_CURRENCY      <- e.g. 'USD' (works.ck_works_cur requires a currency when
#                                total_required is non-null — portal cases enter at 0)
#
# One-time before first run: add those three keys to C:\ShwNodApp\.env (the canonical
# deployment config), AND add the SAME three as environment variables on the Cloudflare
# Pages project (Settings → Environment variables) — the production browser calls the
# same-origin Pages Function functions/api/cases, which reads them from the Pages env.
# (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / PORTAL_JWT_SECRET are already on Pages
# from the photos function.)
#
# Run from the portal folder:   powershell -ExecutionPolicy Bypass -File scripts\deploy-cases-fn.ps1

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
$caseWorkType = Need 'PORTAL_CASE_WORK_TYPE_ID'
$caseDrId     = Need 'PORTAL_CASE_DR_ID'
$caseCurrency = Need 'PORTAL_CASE_CURRENCY'

$env:SUPABASE_ACCESS_TOKEN = $accessToken

Write-Host "Setting case-config secrets on project $ProjectRef ..."
supabase secrets set --project-ref $ProjectRef `
  "PORTAL_CASE_WORK_TYPE_ID=$caseWorkType" `
  "PORTAL_CASE_DR_ID=$caseDrId" `
  "PORTAL_CASE_CURRENCY=$caseCurrency"
if ($LASTEXITCODE -ne 0) { throw "supabase secrets set failed ($LASTEXITCODE)" }

Write-Host "Deploying aligner-portal-cases ..."
supabase functions deploy aligner-portal-cases --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { throw "supabase functions deploy failed ($LASTEXITCODE)" }

Write-Host "Done. Reminder: mirror the same three PORTAL_CASE_* vars into the Cloudflare Pages"
Write-Host "project env (the browser calls the same-origin Pages Function, not this Edge twin)."
