/**
 * Supabase Edge Function — external aligner portal case photos (Cloudflare R2)
 *
 * Phase 3 of the portal: doctors attach clinical photos to an aligner set.
 * Photos live in a PRIVATE Cloudflare R2 bucket (10GB free tier, $0 egress);
 * this function is the only thing holding R2 credentials — the browser never
 * sees them, it only receives short-lived presigned URLs. There is NO metadata
 * table — the R2 object list IS the source of truth (key/size/last-modified),
 * so the CDC sync (which mirrors public-schema tables only) is untouched and
 * no DDL runs on the mirror.
 *
 *   - Auth: the same minted, dr_id-scoped portal JWT the rest of the app reads
 *     under (see ../aligner-portal-auth). The client sends it in the dedicated
 *     `x-portal-token` header (Authorization carries the anon key for the
 *     gateway, same convention as the auth function's cf-access-jwt-assertion).
 *     We verify it with PORTAL_JWT_SECRET (HS256) and take dr_id from the
 *     verified claims — never from the request body.
 *
 *   - Ownership: every route resolves the set and checks
 *     aligner_sets.aligner_dr_id = dr_id (service-role read) before touching
 *     R2. Object keys are `sets/{setId}/{ts}-{sanitized-name}`, so a delete's
 *     key re-derives its setId for the same check.
 *
 * Routes (invoked at /functions/v1/aligner-portal-photos/...):
 *   GET  .../photos?setId=N  → { photos: [{ path, file_name, file_size,
 *                                mime_type, uploaded_at, view_url }] }
 *   POST .../upload-url      body { setId, fileName, fileSize, mimeType }
 *                            → { path, signedUrl } (client PUTs the file
 *                              straight to R2 — no 10MB body through us)
 *   POST .../delete          body { path } → { success }
 *
 * Required secrets (`supabase secrets set`, see ../../scripts/deploy-photos-fn.ps1):
 *   PORTAL_JWT_SECRET / PORTAL_ALLOWED_ORIGIN — already set for aligner-portal-auth
 *   R2_ACCOUNT_ID        — Cloudflare account id (same as CLOUDFLARE_ACCOUNT_ID)
 *   R2_ACCESS_KEY_ID     — R2 API token key   (token: Object Read & Write on the bucket)
 *   R2_SECRET_ACCESS_KEY — R2 API token secret
 *   R2_BUCKET_NAME       — defaults to 'aligner-portal-files' (the pre-existing,
 *                          empty bucket left from the old pipeline)
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected. Deploy with
 * `verify_jwt = false` (see ../../config.toml) — we verify the portal token
 * ourselves.
 *
 * One-time R2 setup (dashboard): a fresh API token scoped to the bucket (the old
 * pipeline's token is committed to git history — revoke it), and the CORS policy
 * in ../../r2-cors.json applied to the bucket (browsers PUT directly to presigned
 * URLs, so it must allow PUT from the portal origins).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jwtVerify } from 'https://esm.sh/jose@5';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // keep in sync with the client check
const SIGNED_VIEW_TTL_SECONDS = 60 * 60; // 1h — the grid re-signs on every list
const SIGNED_UPLOAD_TTL_SECONDS = 15 * 60;
const MAX_PHOTOS_LISTED = 200;

// --- env -------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const JWT_SECRET = Deno.env.get('PORTAL_JWT_SECRET') ?? '';
const R2_ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const R2_ACCESS_KEY_ID = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const R2_SECRET_ACCESS_KEY = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const R2_BUCKET = Deno.env.get('R2_BUCKET_NAME') || 'aligner-portal-files';
const ALLOWED_ORIGINS = (Deno.env.get('PORTAL_ALLOWED_ORIGIN') ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Service-role client: ownership lookups on aligner_sets only (storage is R2).
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// SigV4 signer for the R2 S3 endpoint. Object keys stay within [\w.\-/] by
// construction (sanitizeFileName), so plain string concatenation into URLs is
// safe with no per-segment encoding.
const r2Endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const r2 = new AwsClient({
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  service: 's3',
  region: 'auto',
});

function r2ObjectUrl(key: string): string {
  return `${r2Endpoint}/${R2_BUCKET}/${key}`;
}

/** Presign a GET/PUT on an object key (credentials stay server-side). */
async function presign(method: 'GET' | 'PUT', key: string, expiresSeconds: number): Promise<string> {
  const req = new Request(`${r2ObjectUrl(key)}?X-Amz-Expires=${expiresSeconds}`, { method });
  const signed = await r2.sign(req, { aws: { signQuery: true } });
  return signed.url;
}

// --- CORS (same pattern as aligner-portal-auth) ------------------------------
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
/**
 * Verify the `x-portal-token` header (the dr_id-scoped JWT minted by
 * aligner-portal-auth, HS256 over the project JWT secret). Returns the dr_id
 * claim, or null → 401. Admin impersonation needs no special casing: the admin's
 * token already carries the impersonated doctor's dr_id.
 */
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

/** True iff the set exists and belongs to this doctor (service-role read). */
async function ownsSet(drId: number, setId: number): Promise<boolean> {
  const { data, error } = await admin
    .from('aligner_sets')
    .select('aligner_set_id')
    .eq('aligner_set_id', setId)
    .eq('aligner_dr_id', drId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

// --- helpers ------------------------------------------------------------------
const PATH_RE = /^sets\/(\d+)\/(?:(photos|files)\/)?[\w.-]+$/;

function setFolder(setId: number): string {
  return `sets/${setId}`;
}

/**
 * Keep the extension, strip anything shell/URL-hostile, cap the length.
 * Non-ASCII names (Arabic is common here) sanitize to nothing — fall back to
 * `photo.<ext>` rather than a bare extension.
 */
function sanitizeFileName(name: string): string {
  const trimmed = name.trim().slice(-80);
  const dot = trimmed.lastIndexOf('.');
  const ext = dot > 0 ? trimmed.slice(dot + 1).replace(/[^\w]+/g, '').slice(0, 8) : '';
  let base = (dot > 0 ? trimmed.slice(0, dot) : trimmed)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '');
  if (!base) base = 'photo';
  return ext ? `${base}.${ext}` : base;
}

/** Display name = object basename minus the `{ts}-` uniqueness prefix. */
function displayName(objectName: string): string {
  return objectName.replace(/^\d{10,}-/, '');
}

/** R2's list response has no content-type; derive it from the extension. */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  zip: 'application/zip',
  stl: 'model/stl',
  ply: 'model/ply',
};
function mimeFromKey(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

// --- handlers -----------------------------------------------------------------
async function handleList(req: Request, url: URL, drId: number): Promise<Response> {
  const setId = Number(url.searchParams.get('setId'));
  if (!Number.isInteger(setId) || setId <= 0) {
    return json(req, { success: false, error: 'Valid setId is required' }, 400);
  }
  if (!(await ownsSet(drId, setId))) {
    return json(req, { success: false, error: 'Set not found' }, 404);
  }

  // S3 ListObjectsV2 under the set's prefix (bounded; no pagination follow-up —
  // MAX_PHOTOS_LISTED is far above any plausible per-set photo count).
  const listUrl =
    `${r2Endpoint}/${R2_BUCKET}?list-type=2` +
    `&prefix=${encodeURIComponent(`${setFolder(setId)}/`)}` +
    `&max-keys=${MAX_PHOTOS_LISTED}`;
  const listRes = await r2.fetch(listUrl, { method: 'GET' });
  if (!listRes.ok) {
    throw new Error(`R2 list failed (${listRes.status}): ${(await listRes.text()).slice(0, 300)}`);
  }
  const xml = await listRes.text();

  // Keys are our own [\w.\-/] charset, so no XML-entity decoding is needed.
  const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => {
    const field = (tag: string): string =>
      m[1].match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '';
    return {
      key: field('Key'),
      size: Number(field('Size')) || null,
      lastModified: field('LastModified') || null,
    };
  });

  // Keys start with a fixed-width ms-epoch, so lexicographic desc = newest first.
  objects.sort((a, b) => (a.key < b.key ? 1 : -1));

  const photos = await Promise.all(
    objects.map(async (o) => ({
      path: o.key,
      file_name: displayName(o.key.slice(o.key.lastIndexOf('/') + 1)),
      file_size: o.size,
      mime_type: mimeFromKey(o.key),
      uploaded_at: o.lastModified,
      view_url: await presign('GET', o.key, SIGNED_VIEW_TTL_SECONDS),
    }))
  );

  return json(req, { success: true, photos });
}

async function handleUploadUrl(req: Request, drId: number): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const setId = Number(body.setId);
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const fileSize = Number(body.fileSize);
  const category = typeof body.category === 'string' && body.category === 'files' ? 'files' : 'photos';
  let mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase() : '';

  if (!mimeType && fileName) {
    mimeType = mimeFromKey(fileName);
  }
  if (!mimeType) {
    mimeType = 'application/octet-stream';
  }

  if (!Number.isInteger(setId) || setId <= 0) {
    return json(req, { success: false, error: 'Valid setId is required' }, 400);
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
    return json(req, { success: false, error: 'File must be between 1 byte and 100MB' }, 400);
  }
  if (!(await ownsSet(drId, setId))) {
    return json(req, { success: false, error: 'Set not found' }, 404);
  }

  const path = `${setFolder(setId)}/${category}/${Date.now()}-${sanitizeFileName(fileName)}`;
  const signedUrl = await presign('PUT', path, SIGNED_UPLOAD_TTL_SECONDS);

  return json(req, { success: true, path, signedUrl });
}

async function handleDelete(req: Request, drId: number): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const path = typeof body.path === 'string' ? body.path : '';
  const match = PATH_RE.exec(path);
  if (!match) {
    return json(req, { success: false, error: 'Valid photo path is required' }, 400);
  }
  const setId = Number(match[1]);
  if (!(await ownsSet(drId, setId))) {
    return json(req, { success: false, error: 'Photo not found' }, 404);
  }

  const delRes = await r2.fetch(r2ObjectUrl(path), { method: 'DELETE' });
  // S3 DeleteObject is idempotent: 204 whether or not the key existed.
  if (!delRes.ok && delRes.status !== 204) {
    throw new Error(`R2 delete failed (${delRes.status})`);
  }

  return json(req, { success: true });
}

// --- entry ---------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });

  if (!JWT_SECRET) {
    return json(req, { success: false, error: 'PORTAL_JWT_SECRET is not configured' }, 500);
  }
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    return json(req, { success: false, error: 'R2 credentials are not configured' }, 500);
  }

  const url = new URL(req.url);
  try {
    const drId = await resolveDrId(req);
    if (!drId) return json(req, { success: false, error: 'Portal authentication required' }, 401);

    if (req.method === 'GET' && url.pathname.endsWith('/photos')) return await handleList(req, url, drId);
    if (req.method === 'POST' && url.pathname.endsWith('/upload-url')) return await handleUploadUrl(req, drId);
    if (req.method === 'POST' && url.pathname.endsWith('/delete')) return await handleDelete(req, drId);
    return json(req, { success: false, error: 'Not found' }, 404);
  } catch (err) {
    return json(
      req,
      { success: false, error: err instanceof Error ? err.message : 'Internal error' },
      500
    );
  }
});
