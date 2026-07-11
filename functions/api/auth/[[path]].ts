import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';

const ADMIN_EMAIL = 'shwan.orthodontics@gmail.com';
const TOKEN_TTL = '30m';

// Cache remote JWKS per isolate
let cfJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getCfJwks(teamUrl: string): ReturnType<typeof createRemoteJWKSet> {
  if (!cfJwks) cfJwks = createRemoteJWKSet(new URL(`${teamUrl}/cdn-cgi/access/certs`));
  return cfJwks;
}

function teamDomainUrl(env: any): string | null {
  const raw = (env.CF_ACCESS_TEAM_DOMAIN ?? '').trim();
  if (!raw) return null;
  const withScheme = raw.startsWith('http') ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, cf-access-jwt-assertion',
    'Access-Control-Max-Age': '600',
  };
}

function json(request: Request, env: any, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request, env), 'Content-Type': 'application/json' },
  });
}

function extractCfToken(request: Request, body: Record<string, unknown>): string | null {
  const headerToken = request.headers.get('cf-access-jwt-assertion');
  if (headerToken) return headerToken.trim();
  const bodyToken = typeof body.cfToken === 'string' ? body.cfToken : null;
  if (bodyToken) return bodyToken.trim();
  return null;
}

async function resolveEmail(
  request: Request,
  env: any,
  body: Record<string, unknown>,
  url: URL
): Promise<string | null> {
  const teamUrl = teamDomainUrl(env);
  const cfAud = env.CF_ACCESS_AUD ?? '';
  const cfConfigured = !!teamUrl && !!cfAud;
  const allowDevEmail = (env.PORTAL_ALLOW_DEV_EMAIL ?? '').toLowerCase() === 'true';

  if (cfConfigured) {
    const token = extractCfToken(request, body);
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

  if (allowDevEmail) {
    const devEmail =
      (typeof body.email === 'string' ? body.email : undefined) ??
      url.searchParams.get('email') ??
      undefined;
    if (devEmail) return devEmail.toLowerCase();
  }
  return null;
}

const DOCTOR_COLS = 'dr_id, doctor_name, doctor_email, logo_path';

async function getDoctorByEmail(admin: any, email: string) {
  if (!email?.trim()) return null;
  const { data, error } = await admin
    .from('aligner_doctors')
    .select(DOCTOR_COLS)
    .eq('doctor_email', email.trim())
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function getDoctorById(admin: any, drId: number) {
  const { data, error } = await admin
    .from('aligner_doctors')
    .select(DOCTOR_COLS)
    .eq('dr_id', drId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function getAllDoctors(admin: any) {
  const { data, error } = await admin
    .from('aligner_doctors')
    .select(DOCTOR_COLS)
    .order('doctor_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function mintToken(env: any, doctor: { dr_id: number; doctor_email: string | null }, email: string) {
  const secret = new TextEncoder().encode(env.PORTAL_JWT_SECRET);
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

export const onRequest: PagesFunction<any> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url = new URL(request.url);

  try {
    if (request.method === 'POST' && url.pathname.endsWith('/token')) {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }

      const email = await resolveEmail(request, env, body, url);
      if (!email) return json(request, env, { success: false, error: 'Cloudflare Access verification failed' }, 401);

      const isAdmin = email === ADMIN_EMAIL;
      let doctor;
      if (isAdmin) {
        const impersonateDrId = Number(body.impersonateDrId);
        if (!impersonateDrId || Number.isNaN(impersonateDrId)) {
          return json(request, env, { success: true, token: null, isAdmin: true, doctor: null });
        }
        doctor = await getDoctorById(admin, impersonateDrId);
      } else {
        doctor = await getDoctorByEmail(admin, email);
      }

      if (!doctor) return json(request, env, { success: true, token: null, isAdmin, doctor: null });

      const token = await mintToken(env, doctor, email);
      return json(request, env, { success: true, token, isAdmin, doctor });
    }

    if (request.method === 'GET' && url.pathname.endsWith('/doctors')) {
      const email = await resolveEmail(request, env, {}, url);
      if (!email) return json(request, env, { success: false, error: 'Cloudflare Access verification failed' }, 401);
      if (email !== ADMIN_EMAIL) return json(request, env, { success: false, error: 'Admin access required' }, 403);
      const doctors = await getAllDoctors(admin);
      return json(request, env, { success: true, doctors });
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
