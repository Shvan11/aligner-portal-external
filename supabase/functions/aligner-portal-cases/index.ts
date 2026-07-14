/**
 * Supabase Edge Function — doctor-portal "New Case" submission (smoke-test twin).
 *
 * DUAL-RUNTIME LOCKSTEP: this is the twin of functions/api/cases/[[path]].ts
 * (the production Cloudflare Pages Function the browser actually calls at
 * `/api/cases`). This Edge copy is the smoke-test target (scripts/test-cases-fn.mjs)
 * because Vite dev has no `/api` proxy — the Pages path exists only on a deployed
 * build. ANY change to the case-creation logic must land in BOTH files, exactly
 * as photos/auth are maintained today.
 *
 * A doctor submits a new case (patient name/age/sex + optional note). Unlike the
 * read-only rest of the portal, this AUTO-CREATES the real clinical records —
 * patient → work → aligner set (+ optional doctor note) — on the Supabase mirror
 * using the SERVICE ROLE, then drops one aligner_activity_flags row
 * (activity_type='CaseSubmitted', source='portal') that reverse-syncs to the
 * staff "Portal activity" header bell. All five tables are reverse-sync-capable
 * (updated_at + single-col PK + remote triggers), so the new records ride the
 * existing reverse-CDC path home to the clinic's local DB.
 *
 *   - Why service-role (not an `authenticated` grant): case creation is a
 *     multi-table chain with clinic-controlled values (works.dr_id / type_of_work
 *     / currency) and cross-table integrity RLS cannot express. Granting the
 *     browser role INSERT on patients/works/aligner_sets would be a far larger
 *     attack surface than a server-held key. Identity ALWAYS comes from the
 *     verified x-portal-token claims; privileged values are pinned server-side.
 *
 *   - Auth: same minted, dr_id-scoped portal JWT the rest of the app reads under,
 *     sent in the dedicated `x-portal-token` header (Authorization carries the
 *     anon key for the gateway). Verified with PORTAL_JWT_SECRET (HS256); dr_id
 *     comes from the verified claims, never the body.
 *
 * Route (invoked at /functions/v1/aligner-portal-cases/...):
 *   POST .../create  body { patientName, age, sex ('Male'|'Female'), note? }
 *     → 200 { success, person_id, work_id, aligner_set_id }
 *     → 409 DUPLICATE_PATIENT_NAME (case-insensitive citext match)
 *     → 400 bad fields; 401 no/invalid token; 500 config/insert failure
 *
 * Required secrets (`supabase secrets set`, see ../../scripts/deploy-cases-fn.ps1):
 *   PORTAL_JWT_SECRET / PORTAL_ALLOWED_ORIGIN — already set for aligner-portal-auth
 *   PORTAL_CASE_WORK_TYPE_ID  — aligner work_types.id  (confirm against live DB at deploy)
 *   PORTAL_CASE_DR_ID         — a valid employees.id    (local FK enforces on apply)
 *   PORTAL_CASE_CURRENCY      — e.g. 'USD' (works.ck_works_cur needs currency when priced)
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected. Deploy with
 * `verify_jwt = false` (see ../../config.toml) — we verify the portal token ourselves.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://esm.sh/jose@5';

const PATIENT_NAME_MIN = 2;
const PATIENT_NAME_MAX = 80;
const AGE_MIN = 1;
const AGE_MAX = 120;
const NOTE_MAX = 2000;

// --- env ---------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const JWT_SECRET = Deno.env.get('PORTAL_JWT_SECRET') ?? '';
const CASE_WORK_TYPE_ID = Number(Deno.env.get('PORTAL_CASE_WORK_TYPE_ID'));
const CASE_DR_ID = Number(Deno.env.get('PORTAL_CASE_DR_ID'));
const CASE_CURRENCY = (Deno.env.get('PORTAL_CASE_CURRENCY') ?? '').trim();
const ALLOWED_ORIGINS = (Deno.env.get('PORTAL_ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Service-role client: the whole create chain runs privileged (RLS cannot express
// the cross-table integrity here — identity always comes from the verified token).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- CORS (same pattern as aligner-portal-photos) ----------------------------
function resolveOrigin(req: Request): string {
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  const reqOrigin = req.headers.get('Origin') ?? '';
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  return ALLOWED_ORIGINS[0] ?? '*';
}

function corsHeaders(req: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(req),
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-portal-token',
    'Access-Control-Max-Age': '600',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// --- auth: verify the minted portal JWT → dr_id ------------------------------
async function resolveDrId(req: Request): Promise<number | null> {
  const token = req.headers.get('x-portal-token')?.trim();
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { audience: 'authenticated' });
    const drId = Number((payload as { dr_id?: unknown }).dr_id);
    return Number.isInteger(drId) && drId > 0 ? drId : null;
  } catch (_err) {
    return null;
  }
}

// --- helpers ------------------------------------------------------------------
const pad = (n: number): string => String(n).padStart(2, '0');

/** Local wall-clock date-only string 'YYYY-MM-DD' (patient DOB / set creation_date). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Approximate DOB from a reported age: today minus `age` years (JS Date
 * normalizes Feb-29 → Mar-1 in a non-leap target year, so the string is always
 * a valid date). Chosen over NULL so staff age display works; the patient's
 * notes carry a provenance line marking it approximate.
 */
function approxDobFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return localDateStr(d);
}

async function insertReturning(table: string, row: Record<string, unknown>, idCol: string): Promise<number> {
  const { data, error } = await admin.from(table).insert(row).select(idCol).single();
  if (error) throw error;
  return (data as Record<string, number>)[idCol];
}

async function bestEffortDelete(table: string, idCol: string, id: number): Promise<void> {
  try {
    await admin.from(table).delete().eq(idCol, id);
  } catch {
    // Best-effort; the mirror has no FKs and insert-then-delete coalesces in
    // change_log → a clean no-op locally.
  }
}

// --- handler ------------------------------------------------------------------
async function handleCreate(req: Request, drId: number): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  // validate (field-specific 400s)
  const patientName = typeof body.patientName === 'string' ? body.patientName.trim() : '';
  if (patientName.length < PATIENT_NAME_MIN || patientName.length > PATIENT_NAME_MAX) {
    return json(req, { success: false, error: `Patient name must be ${PATIENT_NAME_MIN}–${PATIENT_NAME_MAX} characters`, field: 'patientName' }, 400);
  }

  const age = Number(body.age);
  if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) {
    return json(req, { success: false, error: `Age must be a whole number between ${AGE_MIN} and ${AGE_MAX}`, field: 'age' }, 400);
  }

  const sexRaw = typeof body.sex === 'string' ? body.sex.trim().toLowerCase() : '';
  const gender = sexRaw === 'male' ? 1 : sexRaw === 'female' ? 2 : 0;
  if (!gender) {
    return json(req, { success: false, error: 'Sex must be Male or Female', field: 'sex' }, 400);
  }

  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > NOTE_MAX) {
    return json(req, { success: false, error: `Note must be ${NOTE_MAX} characters or fewer`, field: 'note' }, 400);
  }

  // resolve doctor name (also re-validates the doctor exists)
  const { data: doctorRow, error: doctorErr } = await admin
    .from('aligner_doctors')
    .select('doctor_name')
    .eq('dr_id', drId)
    .maybeSingle();
  if (doctorErr) throw doctorErr;
  if (!doctorRow) return json(req, { success: false, error: 'Doctor not found' }, 404);
  const doctorName = (doctorRow as { doctor_name: string }).doctor_name;

  // duplicate pre-check (citext = case-insensitive). Best-effort: can't see a
  // clinic patient created in the mirror's last-few-seconds LWW window; a residual
  // dup defer-loops that ONE row locally (warn only, self-heals). 409 covers the rest.
  const { data: dupRow, error: dupErr } = await admin
    .from('patients')
    .select('person_id')
    .eq('patient_name', patientName)
    .limit(1)
    .maybeSingle();
  if (dupErr) throw dupErr;
  if (dupRow) {
    return json(
      req,
      {
        success: false,
        error: 'DUPLICATE_PATIENT_NAME',
        message: `A patient named "${patientName}" already exists. Add a distinguishing detail (e.g. a middle name or initial) to tell them apart.`,
        field: 'patientName',
      },
      409
    );
  }

  const today = localDateStr(new Date());

  // sequential service-role inserts (order = local-FK-safe on reverse apply)
  let personId = 0;
  let workId = 0;
  let alignerSetId = 0;
  try {
    personId = await insertReturning(
      'patients',
      {
        patient_name: patientName,
        date_of_birth: approxDobFromAge(age),
        gender,
        notes: `Created via doctor portal by Dr ${doctorName} on ${today} — reported age ${age} (DOB approximate).`,
      },
      'person_id'
    );

    workId = await insertReturning(
      'works',
      {
        person_id: personId,
        total_required: 0,
        currency: CASE_CURRENCY,
        type_of_work: CASE_WORK_TYPE_ID,
        dr_id: CASE_DR_ID,
      },
      'work_id'
    );

    alignerSetId = await insertReturning(
      'aligner_sets',
      {
        work_id: workId,
        aligner_dr_id: drId,
        set_sequence: 1,
        upper_aligners_count: 0,
        lower_aligners_count: 0,
        remaining_upper_aligners: 0,
        remaining_lower_aligners: 0,
        is_active: true,
        creation_date: today,
      },
      'aligner_set_id'
    );

    if (note) {
      // is_read MUST be sent false explicitly — the column DEFAULTs TRUE.
      await admin
        .from('aligner_notes')
        .insert({ aligner_set_id: alignerSetId, note_type: 'Doctor', note_text: note, is_read: false });
    }
  } catch (chainErr) {
    if (alignerSetId) await bestEffortDelete('aligner_sets', 'aligner_set_id', alignerSetId);
    if (workId) await bestEffortDelete('works', 'work_id', workId);
    if (personId) await bestEffortDelete('patients', 'person_id', personId);
    const msg = chainErr instanceof Error ? chainErr.message : 'insert failed';
    return json(req, { success: false, error: `Could not create the case (${msg}); nothing was saved.` }, 500);
  }

  // staff-bell flag (best-effort: one retry, then swallow). The case already exists.
  const flagRow = {
    aligner_set_id: alignerSetId,
    activity_type: 'CaseSubmitted',
    activity_description: `submitted a new case for "${patientName}"`,
    source: 'portal',
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error: flagErr } = await admin.from('aligner_activity_flags').insert(flagRow);
    if (!flagErr) break;
  }

  return json(req, { success: true, person_id: personId, work_id: workId, aligner_set_id: alignerSetId });
}

// --- entry --------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });

  if (!JWT_SECRET) {
    return json(req, { success: false, error: 'PORTAL_JWT_SECRET is not configured' }, 500);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(req, { success: false, error: 'Supabase credentials are not configured' }, 500);
  }
  if (!Number.isInteger(CASE_WORK_TYPE_ID) || CASE_WORK_TYPE_ID <= 0) {
    return json(req, { success: false, error: 'PORTAL_CASE_WORK_TYPE_ID is not configured' }, 500);
  }
  if (!Number.isInteger(CASE_DR_ID) || CASE_DR_ID <= 0) {
    return json(req, { success: false, error: 'PORTAL_CASE_DR_ID is not configured' }, 500);
  }
  if (!CASE_CURRENCY) {
    return json(req, { success: false, error: 'PORTAL_CASE_CURRENCY is not configured' }, 500);
  }

  const url = new URL(req.url);
  try {
    const drId = await resolveDrId(req);
    if (!drId) return json(req, { success: false, error: 'Portal authentication required' }, 401);

    if (req.method === 'POST' && url.pathname.endsWith('/create')) return await handleCreate(req, drId);
    return json(req, { success: false, error: 'Not found' }, 404);
  } catch (err) {
    return json(
      req,
      { success: false, error: err instanceof Error ? err.message : 'Internal error' },
      500
    );
  }
});
