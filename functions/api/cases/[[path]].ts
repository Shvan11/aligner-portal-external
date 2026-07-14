/**
 * Cloudflare Pages Function — doctor-portal "New Case" submission (production runtime).
 *
 * DUAL-RUNTIME LOCKSTEP: this is the twin of
 * supabase/functions/aligner-portal-cases/index.ts. The browser always calls the
 * same-origin Pages Function (`/api/cases`); the Supabase Edge twin is the
 * smoke-test target (scripts/test-cases-fn.mjs) since Vite dev has no `/api`
 * proxy — `/api/cases` exists only on a deployed Pages build (same as
 * `/api/photos` / `/api/auth` today). ANY change here must be mirrored there.
 *
 * A doctor submits a new case (patient name/age/sex + optional note) from the
 * portal. Unlike the read-only rest of the portal, this AUTO-CREATES the real
 * clinical records — patient → work → aligner set (+ optional doctor note) — on
 * the Supabase mirror using the SERVICE ROLE, then drops one
 * aligner_activity_flags row (activity_type='CaseSubmitted', source='portal')
 * that reverse-syncs to the staff "Portal activity" header bell. All five tables
 * are reverse-sync-capable (updated_at + single-col PK + remote triggers), so the
 * new records ride the existing reverse-CDC path home to the clinic's local DB.
 *
 *   - Why service-role (not an `authenticated` grant): case creation is a
 *     multi-table chain with clinic-controlled values (works.dr_id / type_of_work
 *     / currency) and cross-table integrity RLS cannot express. Granting the
 *     browser role INSERT on patients/works/aligner_sets would be a far larger
 *     attack surface than a server-held key. Identity ALWAYS comes from the
 *     verified x-portal-token claims; privileged values are pinned server-side;
 *     the browser role gains zero new grants.
 *
 *   - Auth: same minted, dr_id-scoped portal JWT the rest of the app reads under,
 *     sent in the dedicated `x-portal-token` header (Authorization carries the
 *     anon key for the gateway). Verified with PORTAL_JWT_SECRET (HS256); dr_id
 *     is taken from the verified claims, never the body. Admin impersonation
 *     needs no special-casing — the admin's token already carries the
 *     impersonated doctor's dr_id.
 *
 * Route: POST .../create
 *   body { patientName, age, sex ('Male'|'Female'), note? }
 *   → 200 { success, person_id, work_id, aligner_set_id }
 *   → 409 DUPLICATE_PATIENT_NAME (case-insensitive citext match)
 *   → 400 on bad fields; 401 no/invalid token; 500 on config/insert failure
 *
 * Required env/secrets (fail 500 loudly if unset):
 *   PORTAL_JWT_SECRET / PORTAL_ALLOWED_ORIGIN — already set for the other functions
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   — already set for the photos function
 *   PORTAL_CASE_WORK_TYPE_ID  — aligner work_types.id  (confirm against live DB at deploy)
 *   PORTAL_CASE_DR_ID         — a valid employees.id    (local FK enforces on apply)
 *   PORTAL_CASE_CURRENCY      — e.g. 'USD' (works.ck_works_cur needs currency when priced)
 * (On Cloudflare Pages add the three PORTAL_CASE_* as project env vars — see
 *  scripts/deploy-cases-fn.ps1's header for the manual step.)
 */

import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const PATIENT_NAME_MIN = 2;
const PATIENT_NAME_MAX = 80;
const AGE_MIN = 1;
const AGE_MAX = 120;
const NOTE_MAX = 2000;

function resolveOrigin(request: Request, env: any): string {
  const allowedOrigins = (env.PORTAL_ALLOWED_ORIGIN ?? '*')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (allowedOrigins.includes('*')) return '*';
  const reqOrigin = request.headers.get('Origin') ?? '';
  if (reqOrigin && allowedOrigins.includes(reqOrigin)) return reqOrigin;
  return allowedOrigins[0] ?? '*';
}

function corsHeaders(request: Request, env: any): HeadersInit {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(request, env),
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-portal-token',
    'Access-Control-Max-Age': '600',
  };
}

function json(request: Request, env: any, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
  });
}

async function resolveDrId(request: Request, env: any): Promise<number | null> {
  const token = request.headers.get('x-portal-token')?.trim();
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.PORTAL_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { audience: 'authenticated' });
    const drId = Number((payload as { dr_id?: unknown }).dr_id);
    return Number.isInteger(drId) && drId > 0 ? drId : null;
  } catch (_err) {
    return null;
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local wall-clock date-only string 'YYYY-MM-DD' (patient DOB / set creation_date). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Approximate DOB from a reported age: today minus `age` years (JS Date
 * normalizes Feb-29 → Mar-1 in a non-leap target year, so the string is always
 * a valid date). Chosen over NULL so the staff app's age display works; the
 * patient's notes carry a provenance line marking it approximate.
 */
function approxDobFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return localDateStr(d);
}

export const onRequest: PagesFunction<any> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (!env.PORTAL_JWT_SECRET) {
    return json(request, env, { success: false, error: 'PORTAL_JWT_SECRET is not configured' }, 500);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(request, env, { success: false, error: 'Supabase credentials are not configured' }, 500);
  }

  // Clinic-controlled case defaults (per-deployment knobs). Fail loud if unset —
  // total_required:0 still needs a currency (ck_works_cur), and works.dr_id /
  // type_of_work are NOT NULL FKs on the local DB.
  const workTypeId = Number(env.PORTAL_CASE_WORK_TYPE_ID);
  const caseDrId = Number(env.PORTAL_CASE_DR_ID);
  const currency = typeof env.PORTAL_CASE_CURRENCY === 'string' ? env.PORTAL_CASE_CURRENCY.trim() : '';
  if (!Number.isInteger(workTypeId) || workTypeId <= 0) {
    return json(request, env, { success: false, error: 'PORTAL_CASE_WORK_TYPE_ID is not configured' }, 500);
  }
  if (!Number.isInteger(caseDrId) || caseDrId <= 0) {
    return json(request, env, { success: false, error: 'PORTAL_CASE_DR_ID is not configured' }, 500);
  }
  if (!currency) {
    return json(request, env, { success: false, error: 'PORTAL_CASE_CURRENCY is not configured' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const insertReturning = async (table: string, row: Record<string, unknown>, idCol: string): Promise<number> => {
    const { data, error } = await admin.from(table).insert(row).select(idCol).single();
    if (error) throw error;
    return (data as Record<string, number>)[idCol];
  };
  const bestEffortDelete = async (table: string, idCol: string, id: number): Promise<void> => {
    try {
      await admin.from(table).delete().eq(idCol, id);
    } catch {
      // Compensation is best-effort; the mirror has no FKs and insert-then-delete
      // coalesces in change_log → a clean no-op locally.
    }
  };

  const url = new URL(request.url);

  try {
    const drId = await resolveDrId(request, env);
    if (!drId) return json(request, env, { success: false, error: 'Portal authentication required' }, 401);

    if (request.method === 'POST' && url.pathname.endsWith('/create')) {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }

      // --- validate (field-specific 400s) ------------------------------------
      const patientName = typeof body.patientName === 'string' ? body.patientName.trim() : '';
      if (patientName.length < PATIENT_NAME_MIN || patientName.length > PATIENT_NAME_MAX) {
        return json(request, env, { success: false, error: `Patient name must be ${PATIENT_NAME_MIN}–${PATIENT_NAME_MAX} characters`, field: 'patientName' }, 400);
      }

      const age = Number(body.age);
      if (!Number.isInteger(age) || age < AGE_MIN || age > AGE_MAX) {
        return json(request, env, { success: false, error: `Age must be a whole number between ${AGE_MIN} and ${AGE_MAX}`, field: 'age' }, 400);
      }

      const sexRaw = typeof body.sex === 'string' ? body.sex.trim().toLowerCase() : '';
      const gender = sexRaw === 'male' ? 1 : sexRaw === 'female' ? 2 : 0;
      if (!gender) {
        return json(request, env, { success: false, error: 'Sex must be Male or Female', field: 'sex' }, 400);
      }

      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (note.length > NOTE_MAX) {
        return json(request, env, { success: false, error: `Note must be ${NOTE_MAX} characters or fewer`, field: 'note' }, 400);
      }

      // --- resolve doctor name (also re-validates the doctor exists) -----------
      const { data: doctorRow, error: doctorErr } = await admin
        .from('aligner_doctors')
        .select('doctor_name')
        .eq('dr_id', drId)
        .maybeSingle();
      if (doctorErr) throw doctorErr;
      if (!doctorRow) return json(request, env, { success: false, error: 'Doctor not found' }, 404);
      const doctorName = (doctorRow as { doctor_name: string }).doctor_name;

      // --- duplicate pre-check (citext = case-insensitive) --------------------
      // Best-effort only: this can't see a clinic patient created in the mirror's
      // last-few-seconds LWW window, so a residual dup defer-loops that ONE row
      // locally (warn only, self-heals) — see docs. The 409 covers the common case.
      const { data: dupRow, error: dupErr } = await admin
        .from('patients')
        .select('person_id')
        .eq('patient_name', patientName)
        .limit(1)
        .maybeSingle();
      if (dupErr) throw dupErr;
      if (dupRow) {
        return json(
          request,
          env,
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

      // --- sequential service-role inserts (order = local-FK-safe on reverse apply) ---
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
            currency,
            type_of_work: workTypeId,
            dr_id: caseDrId,
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
        // Best-effort compensation in reverse order, then fail: nothing was saved.
        if (alignerSetId) await bestEffortDelete('aligner_sets', 'aligner_set_id', alignerSetId);
        if (workId) await bestEffortDelete('works', 'work_id', workId);
        if (personId) await bestEffortDelete('patients', 'person_id', personId);
        const msg = chainErr instanceof Error ? chainErr.message : 'insert failed';
        return json(request, env, { success: false, error: `Could not create the case (${msg}); nothing was saved.` }, 500);
      }

      // --- staff-bell flag (best-effort: one retry, then swallow) --------------
      // Creating the case already succeeded — a lost flag only costs a bell entry.
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

      return json(request, env, { success: true, person_id: personId, work_id: workId, aligner_set_id: alignerSetId });
    }

    return json(request, env, { success: false, error: 'Not found' }, 404);
  } catch (err: any) {
    return json(
      request,
      env,
      { success: false, error: err instanceof Error ? err.message : 'Internal error' },
      500
    );
  }
};
