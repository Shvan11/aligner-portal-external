import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';
import { AwsClient } from 'aws4fetch';

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const SIGNED_VIEW_TTL_SECONDS = 60 * 60;
const SIGNED_UPLOAD_TTL_SECONDS = 15 * 60;
const MAX_PHOTOS_LISTED = 200;

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

async function ownsSet(admin: any, drId: number, setId: number): Promise<boolean> {
  const { data, error } = await admin
    .from('aligner_sets')
    .select('aligner_set_id')
    .eq('aligner_set_id', setId)
    .eq('aligner_dr_id', drId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

const PATH_RE = /^sets\/(\d+)\/(?:(photos|files)\/)?[\w.-]+$/;

function setFolder(setId: number): string {
  return `sets/${setId}`;
}

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

function displayName(objectName: string): string {
  return objectName.replace(/^\d{10,}-/, '');
}

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

export const onRequest: PagesFunction<any> = async (context) => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (!env.PORTAL_JWT_SECRET) {
    return json(request, env, { success: false, error: 'PORTAL_JWT_SECRET is not configured' }, 500);
  }
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    return json(request, env, { success: false, error: 'R2 credentials are not configured' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const r2Endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const r2Bucket = env.R2_BUCKET_NAME || 'aligner-portal-files';
  const r2 = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });

  function r2ObjectUrl(key: string): string {
    return `${r2Endpoint}/${r2Bucket}/${key}`;
  }

  async function presign(method: 'GET' | 'PUT', key: string, expiresSeconds: number): Promise<string> {
    const req = new Request(`${r2ObjectUrl(key)}?X-Amz-Expires=${expiresSeconds}`, { method });
    const signed = await r2.sign(req, { aws: { signQuery: true } });
    return signed.url;
  }

  const url = new URL(request.url);

  try {
    const drId = await resolveDrId(request, env);
    if (!drId) return json(request, env, { success: false, error: 'Portal authentication required' }, 401);

    if (request.method === 'GET' && url.pathname.endsWith('/photos')) {
      const setId = Number(url.searchParams.get('setId'));
      if (!Number.isInteger(setId) || setId <= 0) {
        return json(request, env, { success: false, error: 'Valid setId is required' }, 400);
      }
      if (!(await ownsSet(admin, drId, setId))) {
        return json(request, env, { success: false, error: 'Set not found' }, 404);
      }

      const listUrl =
        `${r2Endpoint}/${r2Bucket}?list-type=2` +
        `&prefix=${encodeURIComponent(`${setFolder(setId)}/`)}` +
        `&max-keys=${MAX_PHOTOS_LISTED}`;
      const listRes = await r2.fetch(listUrl, { method: 'GET' });
      if (!listRes.ok) {
        throw new Error(`R2 list failed (${listRes.status}): ${(await listRes.text()).slice(0, 300)}`);
      }
      const xml = await listRes.text();

      const objects = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((m) => {
        const field = (tag: string): string =>
          m[1].match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? '';
        return {
          key: field('Key'),
          size: Number(field('Size')) || null,
          lastModified: field('LastModified') || null,
        };
      });

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

      return json(request, env, { success: true, photos });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/upload-url')) {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
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
        return json(request, env, { success: false, error: 'Valid setId is required' }, 400);
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
        return json(request, env, { success: false, error: 'File must be between 1 byte and 100MB' }, 400);
      }
      if (!(await ownsSet(admin, drId, setId))) {
        return json(request, env, { success: false, error: 'Set not found' }, 404);
      }

      const path = `${setFolder(setId)}/${category}/${Date.now()}-${sanitizeFileName(fileName)}`;
      const signedUrl = await presign('PUT', path, SIGNED_UPLOAD_TTL_SECONDS);

      return json(request, env, { success: true, path, signedUrl });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/delete')) {
      let body: Record<string, unknown> = {};
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }

      const path = typeof body.path === 'string' ? body.path : '';
      const match = PATH_RE.exec(path);
      if (!match) {
        return json(request, env, { success: false, error: 'Valid photo path is required' }, 400);
      }
      const setId = Number(match[1]);
      if (!(await ownsSet(admin, drId, setId))) {
        return json(request, env, { success: false, error: 'Photo not found' }, 404);
      }

      const delRes = await r2.fetch(r2ObjectUrl(path), { method: 'DELETE' });
      if (!delRes.ok && delRes.status !== 204) {
        throw new Error(`R2 delete failed (${delRes.status})`);
      }

      return json(request, env, { success: true });
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
