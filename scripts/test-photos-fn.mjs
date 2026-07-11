/**
 * E2E smoke test for the deployed aligner-portal-photos Edge Function.
 *
 * Exercises the full pipeline exactly as the portal does, minus the browser:
 *   1. GET  /photos?setId=…       (list — expect success)
 *   2. POST /upload-url           (signed upload URL)
 *   3. PUT  <signedUrl>           (upload a 1x1 PNG)
 *   4. GET  /photos               (expect the new photo + fetch its signed view_url)
 *   5. POST /delete               (remove the test photo)
 *   6. GET  /photos               (expect it gone)
 * Plus two negative checks: no token → 401, foreign/bogus set → 404.
 *
 * The doctor-scoped JWT is minted locally with SUPABASE_JWT_SECRET (read from the
 * main app's .env — owner-side ops script, same trust level as deploy-auth-fn).
 * With no arguments it discovers the newest (set, doctor) pair via PostgREST
 * using a locally-minted service-role JWT (read-only, one row).
 *
 * Usage (WSL):
 *   node scripts/test-photos-fn.mjs [dr_id set_id] [--env /path/to/main/.env]
 */

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const DEFAULT_ENV = process.platform === 'win32' ? 'C:\\ShwNodApp\\.env' : '/home/administrator/projects/ShwNodApp/.env';
const PROJECT_URL = process.env.SUPABASE_URL || 'https://ucfbpflrhggxvejhhqhx.supabase.co';

// --- args --------------------------------------------------------------------
const args = process.argv.slice(2);
const envIdx = args.indexOf('--env');
const envFile = envIdx >= 0 ? args.splice(envIdx, 2)[1] : DEFAULT_ENV;
let [drIdArg, setIdArg] = args;

// --- read the JWT secret from the main app's .env ------------------------------
function parseEnv(file) {
  const map = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    map[t.slice(0, i).trim()] ??= t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return map;
}
const env = parseEnv(envFile);
const JWT_SECRET = env.SUPABASE_JWT_SECRET;
if (!JWT_SECRET) throw new Error(`SUPABASE_JWT_SECRET not found in ${envFile}`);

// --- minimal HS256 JWT mint (same shape aligner-portal-auth produces) ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function mintJwt(claims, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ aud: 'authenticated', iat: now, exp: now + ttlSeconds, ...claims }));
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const fnUrl = `${PROJECT_URL}/functions/v1/aligner-portal-photos`;

async function fnFetch(token, path, init = {}) {
  const res = await fetch(`${fnUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { 'x-portal-token': token } : {}) },
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

function assert(cond, label, detail) {
  if (cond) {
    console.log(`  ✔ ${label}`);
  } else {
    console.error(`  ✘ ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`);
    process.exitCode = 1;
  }
}

// --- discovery (no args): newest set via PostgREST + service-role JWT ----------
if (!drIdArg || !setIdArg) {
  const serviceJwt = mintJwt({ role: 'service_role' }, 120);
  const res = await fetch(
    `${PROJECT_URL}/rest/v1/aligner_sets?select=aligner_set_id,aligner_dr_id&order=aligner_set_id.desc&limit=1`,
    { headers: { apikey: serviceJwt, Authorization: `Bearer ${serviceJwt}` } }
  );
  if (!res.ok) throw new Error(`Set discovery failed (${res.status}): ${await res.text()}`);
  const [row] = await res.json();
  if (!row) throw new Error('No aligner_sets rows found to test against');
  drIdArg = String(row.aligner_dr_id);
  setIdArg = String(row.aligner_set_id);
}
const drId = Number(drIdArg);
const setId = Number(setIdArg);
console.log(`Testing against ${fnUrl}\n  dr_id=${drId} set_id=${setId}\n`);

const token = mintJwt({ role: 'authenticated', dr_id: drId, sub: `portal-dr-${drId}` }, 600);

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const testName = `e2e-test-${Date.now()}.png`;

// --- negative checks -----------------------------------------------------------
console.log('Auth / ownership guards:');
const noAuth = await fnFetch(null, `/photos?setId=${setId}`);
assert(noAuth.status === 401, 'no token → 401', noAuth);
const bogus = await fnFetch(token, `/photos?setId=999999999`);
assert(bogus.status === 404, 'foreign/bogus set → 404', bogus);

// --- happy path ------------------------------------------------------------------
console.log('Happy path:');
const list0 = await fnFetch(token, `/photos?setId=${setId}`);
assert(list0.status === 200 && Array.isArray(list0.body.photos), 'list photos', list0);
const before = list0.body.photos?.length ?? 0;

const grant = await fnFetch(token, '/upload-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ setId, fileName: testName, fileSize: PNG.length, mimeType: 'image/png' }),
});
assert(grant.status === 200 && grant.body.signedUrl && grant.body.path, 'signed upload URL issued', grant);

const put = await fetch(grant.body.signedUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/png' },
  body: PNG,
});
assert(put.ok, `PUT file to signed URL (${put.status})`, put.ok ? undefined : await put.text());

const list1 = await fnFetch(token, `/photos?setId=${setId}`);
const uploaded = list1.body.photos?.find((p) => p.path === grant.body.path);
assert(!!uploaded, `uploaded photo appears in list (${before} → ${list1.body.photos?.length})`, list1.body);
if (uploaded) {
  const view = await fetch(uploaded.view_url);
  assert(view.ok, `signed view_url serves the image (${view.status})`);
}

const del = await fnFetch(token, '/delete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: grant.body.path }),
});
assert(del.status === 200, 'delete photo', del);

const list2 = await fnFetch(token, `/photos?setId=${setId}`);
assert(
  !(list2.body.photos ?? []).some((p) => p.path === grant.body.path),
  `photo gone after delete (count ${list2.body.photos?.length})`
);

console.log(process.exitCode ? '\nFAILED' : '\nAll checks passed.');
