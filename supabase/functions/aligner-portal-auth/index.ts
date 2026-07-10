/**
 * Supabase Edge Function — external aligner portal auth bridge
 *
 * Always-on replacement for the main app's `/api/aligner-portal/{token,doctors}`
 * endpoints (see C:\ShwNodApp\routes\api\portal-aligner.routes.ts). Hosting this
 * on Supabase removes the clinic home-server / cloudflared-tunnel dependency from
 * the portal's login path — the portal now depends only on Supabase + Cloudflare
 * Access, both of which are always up.
 *
 * Flow:
 *   1. The portal authenticates the doctor via Cloudflare Access (a signed JWT in
 *      the `CF_Authorization` cookie on the portal's own origin).
 *   2. The portal forwards that JWT here (in the body for POST /token, or the
 *      `cf-access-jwt-assertion` header for GET /doctors — NOT in Authorization,
 *      which the Supabase gateway uses for the anon key).
 *   3. We verify it against Cloudflare's JWKS, map the email to an aligner `dr_id`
 *      (via a service-role client, since the doctor isn't authenticated to
 *      Supabase yet and the lookup must bypass RLS), and mint a short-lived
 *      Supabase JWT carrying a `dr_id` claim (role=authenticated, HS256).
 *   4. The portal attaches that token to supabase-js; RLS on the raw mirror tables
 *      filters every row by the `dr_id` claim.
 *
 * Routes (invoked at /functions/v1/aligner-portal-auth/...):
 *   POST  .../token    body: { cfToken?, email? (dev), impersonateDrId? (admin) }
 *   GET   .../doctors   (admin only) → full doctor list for the impersonation picker
 *
 * Required secrets (set via `supabase secrets set`; SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY are auto-injected by the platform):
 *   PORTAL_JWT_SECRET        — the project's JWT secret (Dashboard ▸ Settings ▸ API ▸ JWT Secret).
 *                              NOT named SUPABASE_* because that prefix is reserved for secrets.
 *   CF_ACCESS_TEAM_DOMAIN    — e.g. shwan-ortho.cloudflareaccess.com
 *   CF_ACCESS_AUD            — the Cloudflare Access application AUD tag
 *   PORTAL_ALLOWED_ORIGIN    — e.g. https://shwan-aligner-portal.pages.dev (CORS)
 *   PORTAL_ALLOW_DEV_EMAIL   — optional 'true' to accept a plain `email` (dev only; off in prod)
 *
 * Deploy with `verify_jwt = false` (see ../../config.toml) — we do our own
 * Cloudflare-Access verification; the gateway still requires the `apikey` header.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT, jwtVerify, createRemoteJWKSet, type JWTPayload } from 'https://esm.sh/jose@5';

const ADMIN_EMAIL = 'shwan.orthodontics@gmail.com';
const TOKEN_TTL = '30m';

// --- env -------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const JWT_SECRET = Deno.env.get('PORTAL_JWT_SECRET') ?? '';
// Comma-separated allowlist (e.g. the custom domain + the *.pages.dev preview).
// We reflect whichever request Origin matches so multiple front-ends work.
const ALLOWED_ORIGINS = (Deno.env.get('PORTAL_ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOW_DEV_EMAIL = (Deno.env.get('PORTAL_ALLOW_DEV_EMAIL') ?? '').toLowerCase() === 'true';

/** Normalize the CF Access team domain into a full https origin (no trailing slash). */
function teamDomainUrl(): string | null {
  const raw = (Deno.env.get('CF_ACCESS_TEAM_DOMAIN') ?? '').trim();
  if (!raw) return null;
  const withScheme = raw.startsWith('http') ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

// Lazily-built, cached remote JWKS for Cloudflare Access (jose caches keys
// internally and refreshes on rotation). Built once per isolate.
let cfJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getCfJwks(teamUrl: string): ReturnType<typeof createRemoteJWKSet> {
  if (!cfJwks) cfJwks = createRemoteJWKSet(new URL(`${teamUrl}/cdn-cgi/access/certs`));
  return cfJwks;
}

// Service-role client for the doctor lookup (bypasses RLS — the doctor is not
// authenticated to Supabase at this point; this is the chicken-and-egg resolve).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- CORS ------------------------------------------------------------------
/** Pick the Access-Control-Allow-Origin value for this request from the allowlist. */
function resolveOrigin(req: Request): string {
  if (ALLOWED_ORIGINS.includes('*')) return '*';
  const reqOrigin = req.headers.get('Origin') ?? '';
  if (reqOrigin && ALLOWED_ORIGINS.includes(reqOrigin)) return reqOrigin;
  // Non-allowlisted origin: echo the first configured one so the browser blocks
  // it (correct) rather than us accidentally allowing everything.
  return ALLOWED_ORIGINS[0] ?? '*';
}

function corsHeaders(req: Request): HeadersInit {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(req),
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, cf-access-jwt-assertion',
    'Access-Control-Max-Age': '600',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// --- Cloudflare-Access verification → resolved email -----------------------

/**
 * Pull the CF Access JWT from the dedicated header or body. Deliberately does
 * NOT read Authorization — the Supabase gateway uses that for the anon key —
 * and deliberately does NOT accept a query-string token: the client never
 * sends it that way, and a JWT in a URL ends up in access logs/referrers.
 */
function extractCfToken(req: Request, body: Record<string, unknown>): string | null {
  const headerToken = req.headers.get('cf-access-jwt-assertion');
  if (headerToken) return headerToken.trim();
  const bodyToken = typeof body.cfToken === 'string' ? body.cfToken : null;
  if (bodyToken) return bodyToken.trim();
  return null;
}

/**
 * Resolve the authenticated doctor email. With CF Access configured (team domain
 * + AUD), a valid Cloudflare-Access JWT is required. When CF Access is NOT
 * configured and PORTAL_ALLOW_DEV_EMAIL=true, a plain `email` is accepted so the
 * portal's `?email=` dev mode can exercise the full chain. Returns null → 401.
 */
async function resolveEmail(
  req: Request,
  body: Record<string, unknown>,
  url: URL
): Promise<string | null> {
  const teamUrl = teamDomainUrl();
  const cfAud = Deno.env.get('CF_ACCESS_AUD') ?? '';
  const cfConfigured = !!teamUrl && !!cfAud;

  if (cfConfigured) {
    const token = extractCfToken(req, body);
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, getCfJwks(teamUrl!), {
        issuer: teamUrl!,
        audience: cfAud,
      });
      const email = (payload as JWTPayload & { email?: string }).email;
      return email ? email.toLowerCase() : null;
    } catch (_err) {
      return null;
    }
  }

  if (ALLOW_DEV_EMAIL) {
    const devEmail =
      (typeof body.email === 'string' ? body.email : undefined) ??
      url.searchParams.get('email') ??
      undefined;
    if (devEmail) return devEmail.toLowerCase();
  }
  return null;
}

// --- doctor lookups (service role) -----------------------------------------
const DOCTOR_COLS = 'dr_id, doctor_name, doctor_email, logo_path';

async function getDoctorByEmail(email: string) {
  if (!email?.trim()) return null;
  const { data, error } = await admin
    .from('aligner_doctors')
    .select(DOCTOR_COLS)
    .eq('doctor_email', email.trim()) // doctor_email is citext → case-insensitive
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function getDoctorById(drId: number) {
  const { data, error } = await admin
    .from('aligner_doctors')
    .select(DOCTOR_COLS)
    .eq('dr_id', drId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function getAllDoctors() {
  const { data, error } = await admin
    .from('aligner_doctors')
    .select(DOCTOR_COLS)
    .order('doctor_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// --- token minting ---------------------------------------------------------
async function mintToken(doctor: { dr_id: number; doctor_email: string | null }, email: string) {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({
    role: 'authenticated',
    dr_id: doctor.dr_id,
    email: doctor.doctor_email ?? email,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(`portal-dr-${doctor.dr_id}`)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

// --- handlers --------------------------------------------------------------
async function handleToken(req: Request, url: URL): Promise<Response> {
  if (!JWT_SECRET) {
    return json(req, { success: false, error: 'PORTAL_JWT_SECRET is not configured' }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const email = await resolveEmail(req, body, url);
  if (!email) return json(req, { success: false, error: 'Cloudflare Access verification failed' }, 401);

  const isAdmin = email === ADMIN_EMAIL;

  let doctor;
  if (isAdmin) {
    const impersonateDrId = Number(body.impersonateDrId);
    if (!impersonateDrId || Number.isNaN(impersonateDrId)) {
      // Admin without a selected doctor — return identity so the portal can show
      // the doctor picker (list comes from GET /doctors).
      return json(req, { success: true, token: null, isAdmin: true, doctor: null });
    }
    doctor = await getDoctorById(impersonateDrId);
  } else {
    doctor = await getDoctorByEmail(email);
  }

  // Doctor not found (unknown email, or admin impersonating a stale/deleted
  // dr_id) is a resolved state, not a transport error — soft-resolve it the
  // same way as the no-selection case above so the client's requestToken()
  // doesn't throw on a non-ok status. That's what let the portal's own
  // "Doctor not found" messaging (useAuthenticatedDoctor.ts) reach the user
  // instead of being replaced by a generic "Token request failed (404)".
  if (!doctor) return json(req, { success: true, token: null, isAdmin, doctor: null });

  const token = await mintToken(doctor, email);
  return json(req, { success: true, token, isAdmin, doctor });
}

async function handleDoctors(req: Request, url: URL): Promise<Response> {
  const email = await resolveEmail(req, {}, url);
  if (!email) return json(req, { success: false, error: 'Cloudflare Access verification failed' }, 401);
  if (email !== ADMIN_EMAIL) return json(req, { success: false, error: 'Admin access required' }, 403);
  const doctors = await getAllDoctors();
  return json(req, { success: true, doctors });
}

// --- entry -----------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });

  const url = new URL(req.url);
  try {
    if (req.method === 'POST' && url.pathname.endsWith('/token')) return await handleToken(req, url);
    if (req.method === 'GET' && url.pathname.endsWith('/doctors')) return await handleDoctors(req, url);
    return json(req, { success: false, error: 'Not found' }, 404);
  } catch (err) {
    return json(
      req,
      { success: false, error: err instanceof Error ? err.message : 'Internal error' },
      500
    );
  }
});
