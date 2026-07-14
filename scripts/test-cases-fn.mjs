/**
 * E2E smoke test for the deployed aligner-portal-cases Edge Function (the twin of
 * the production Cloudflare Pages Function — Vite dev has no `/api` proxy, so the
 * deployed Supabase function is the functional test target).
 *
 * Exercises the full "New Case" flow exactly as the portal does, minus the browser:
 *   Negative: no token → 401; field validation (empty/short name, age 0, age 121,
 *             bad sex) → 400.
 *   Happy path: POST /create → 200 → assert EVEN ids (mirror sequences START 2
 *             INCREMENT 2), then verify all five mirror rows via PostgREST:
 *               patients   (name, gender, approx DOB, provenance note)
 *               works      (person_id link, total_required 0, currency/type/dr set)
 *               aligner_sets (work_id link, aligner_dr_id = the doctor, is_active)
 *               aligner_notes (note_type Doctor, is_read = false)
 *               aligner_activity_flags (activity_type CaseSubmitted, source portal)
 *   Duplicate: re-POST the same name → 409 DUPLICATE_PATIENT_NAME.
 *   Cleanup: service-role delete child → parent (removes the test rows; the mirror
 *             insert+delete coalesces so nothing lingers locally either).
 *
 * The doctor-scoped JWT is minted locally with SUPABASE_JWT_SECRET (read from the
 * main app's .env — owner-side ops script, same trust level as deploy-auth-fn). The
 * dr_id is discovered as the newest aligner_doctors row (it must exist — the
 * function reads aligner_doctors by dr_id).
 *
 * Usage (WSL):
 *   node scripts/test-cases-fn.mjs [dr_id] [--env /path/to/main/.env]
 */

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const DEFAULT_ENV = process.platform === 'win32' ? 'C:\\ShwNodApp\\.env' : '/home/administrator/projects/ShwNodApp/.env';
const PROJECT_URL = process.env.SUPABASE_URL || 'https://ucfbpflrhggxvejhhqhx.supabase.co';

// --- args --------------------------------------------------------------------
const args = process.argv.slice(2);
const envIdx = args.indexOf('--env');
const envFile = envIdx >= 0 ? args.splice(envIdx, 2)[1] : DEFAULT_ENV;
let [drIdArg] = args;

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

const fnUrl = `${PROJECT_URL}/functions/v1/aligner-portal-cases`;
const serviceJwt = mintJwt({ role: 'service_role' }, 300);

async function fnFetch(token, path, init = {}) {
  const res = await fetch(`${fnUrl}${path}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(token ? { 'x-portal-token': token } : {}) },
  });
  let body = {};
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body };
}

/** PostgREST via a locally-minted service-role JWT (bypasses RLS; verification + cleanup). */
async function rest(path, init = {}) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceJwt,
      Authorization: `Bearer ${serviceJwt}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  let body = [];
  try { body = await res.json(); } catch { /* 204 no body */ }
  return { status: res.status, body };
}

function assert(cond, label, detail) {
  if (cond) {
    console.log(`  ✔ ${label}`);
  } else {
    console.error(`  ✘ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
    process.exitCode = 1;
  }
}

// --- discovery (no arg): newest aligner_doctors row ----------------------------
if (!drIdArg) {
  const res = await fetch(
    `${PROJECT_URL}/rest/v1/aligner_doctors?select=dr_id&order=dr_id.desc&limit=1`,
    { headers: { apikey: serviceJwt, Authorization: `Bearer ${serviceJwt}` } }
  );
  if (!res.ok) throw new Error(`Doctor discovery failed (${res.status}): ${await res.text()}`);
  const [row] = await res.json();
  if (!row) throw new Error('No aligner_doctors rows found to test against');
  drIdArg = String(row.dr_id);
}
const drId = Number(drIdArg);
console.log(`Testing against ${fnUrl}\n  dr_id=${drId}\n`);

const token = mintJwt({ role: 'authenticated', dr_id: drId, sub: `portal-dr-${drId}` }, 600);
const uniqueName = `E2E Case ${Date.now()}`;
const validBody = { patientName: uniqueName, age: 31, sex: 'Male', note: 'E2E scan looks good' };
const postCreate = (tok, body) =>
  fnFetch(tok, '/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// --- negative checks -----------------------------------------------------------
console.log('Auth / validation guards:');
const noAuth = await postCreate(null, validBody);
assert(noAuth.status === 401, 'no token → 401', noAuth);

const shortName = await postCreate(token, { ...validBody, patientName: 'x' });
assert(shortName.status === 400, 'name too short → 400', shortName);

const ageLow = await postCreate(token, { ...validBody, age: 0 });
assert(ageLow.status === 400, 'age 0 → 400', ageLow);

const ageHigh = await postCreate(token, { ...validBody, age: 121 });
assert(ageHigh.status === 400, 'age 121 → 400', ageHigh);

const badSex = await postCreate(token, { ...validBody, sex: 'Other' });
assert(badSex.status === 400, 'bad sex → 400', badSex);

// --- happy path ------------------------------------------------------------------
console.log('Happy path:');
const created = await postCreate(token, validBody);
assert(created.status === 200 && created.body.success === true, 'create case', created);

const personId = Number(created.body.person_id);
const workId = Number(created.body.work_id);
const setId = Number(created.body.aligner_set_id);

if (created.status === 200) {
  assert(
    personId % 2 === 0 && workId % 2 === 0 && setId % 2 === 0,
    `ids are EVEN (mirror identity): person=${personId} work=${workId} set=${setId}`,
    created.body
  );

  const [patient] = (await rest(`patients?select=*&person_id=eq.${personId}`)).body;
  assert(patient?.patient_name === uniqueName, 'patient name saved', patient?.patient_name);
  assert(patient?.gender === 1, 'gender = 1 (Male)', patient?.gender);
  assert(!!patient?.date_of_birth, 'approx DOB set', patient?.date_of_birth);
  assert(typeof patient?.notes === 'string' && patient.notes.toLowerCase().includes('doctor portal'), 'provenance note', patient?.notes);

  const [work] = (await rest(`works?select=*&work_id=eq.${workId}`)).body;
  assert(work?.person_id === personId, 'work → patient link', work?.person_id);
  assert(Number(work?.total_required) === 0, 'total_required = 0', work?.total_required);
  assert(!!work?.currency, 'currency set (ck_works_cur)', work?.currency);
  assert(Number.isInteger(work?.type_of_work), 'type_of_work set', work?.type_of_work);
  assert(Number.isInteger(work?.dr_id), 'dr_id set', work?.dr_id);

  const [set] = (await rest(`aligner_sets?select=*&aligner_set_id=eq.${setId}`)).body;
  assert(set?.work_id === workId, 'set → work link', set?.work_id);
  assert(set?.aligner_dr_id === drId, 'set owned by the doctor', set?.aligner_dr_id);
  assert(set?.is_active === true, 'set is active', set?.is_active);

  const notes = (await rest(`aligner_notes?select=*&aligner_set_id=eq.${setId}`)).body;
  const note = notes.find((n) => n.note_type === 'Doctor');
  assert(!!note && note.note_text === validBody.note, 'doctor note saved', note?.note_text);
  assert(note?.is_read === false, 'note is_read = false', note?.is_read);

  const flags = (await rest(`aligner_activity_flags?select=*&aligner_set_id=eq.${setId}`)).body;
  const flag = flags.find((f) => f.activity_type === 'CaseSubmitted');
  assert(!!flag, 'CaseSubmitted flag written', flags);
  assert(flag?.source === 'portal', "flag source = 'portal'", flag?.source);

  // --- duplicate --------------------------------------------------------------
  console.log('Duplicate guard:');
  const dup = await postCreate(token, validBody);
  assert(dup.status === 409 && dup.body.error === 'DUPLICATE_PATIENT_NAME', 'duplicate name → 409', dup);

  // --- cleanup (child → parent) ----------------------------------------------
  console.log('Cleanup:');
  await rest(`aligner_activity_flags?aligner_set_id=eq.${setId}`, { method: 'DELETE' });
  await rest(`aligner_notes?aligner_set_id=eq.${setId}`, { method: 'DELETE' });
  await rest(`aligner_sets?aligner_set_id=eq.${setId}`, { method: 'DELETE' });
  await rest(`works?work_id=eq.${workId}`, { method: 'DELETE' });
  const delPatient = await rest(`patients?person_id=eq.${personId}`, { method: 'DELETE' });
  assert(delPatient.status >= 200 && delPatient.status < 300, 'test rows cleaned up', delPatient.status);
}

console.log(process.exitCode ? '\nFAILED' : '\nAll checks passed.');
