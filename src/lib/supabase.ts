/**
 * Supabase Client Configuration
 * Connects to PostgreSQL database on Supabase
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Patient, AlignerDoctor, AlignerDoctorMinimal } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Main app (cloudflared tunnel) — mints the scoped Supabase JWT the portal reads under.
const mainAppUrl = (import.meta.env.VITE_MAIN_APP_URL || '').replace(/\/+$/, '');

// =============================================================================
// PORTAL SESSION / TOKEN EXCHANGE
//
// The Supabase project is the RAW clinic mirror, RLS-locked. The anon key alone
// returns nothing. Instead we send the Cloudflare-Access identity to the main
// app, which verifies it and mints a short-lived Supabase JWT carrying a `dr_id`
// claim. RLS on the raw tables filters every row by that claim. The minted token
// is supplied to supabase-js via the `accessToken` option (called per request),
// so all reads run under the doctor's row boundary.
// =============================================================================

interface PortalCredentials {
  cfToken?: string | null;
  email?: string | null;
  impersonateDrId?: number | null;
}

interface TokenResponse {
  success: boolean;
  token: string | null;
  isAdmin: boolean;
  doctor: AlignerDoctor | null;
}

let authContext: PortalCredentials | null = null;
let cachedToken: string | null = null;
let cachedTokenExpMs = 0;
let inFlight: Promise<string | null> | null = null;

/** Read the raw Cloudflare Access JWT cookie (the credential the main app verifies). */
export function getCfToken(): string | null {
  return getCookie('CF_Authorization');
}

/** Call the main app to mint a scoped Supabase JWT for the current auth context. */
async function requestToken(ctx: PortalCredentials): Promise<TokenResponse> {
  if (!mainAppUrl) {
    throw new Error('VITE_MAIN_APP_URL is not configured');
  }
  const res = await fetch(`${mainAppUrl}/api/aligner-portal/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cfToken: ctx.cfToken ?? undefined,
      email: ctx.email ?? undefined,
      impersonateDrId: ctx.impersonateDrId ?? undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status})`);
  }
  return (await res.json()) as TokenResponse;
}

/** Decode a JWT's `exp` (seconds) into epoch ms, or 0 if unavailable. */
function tokenExpiryMs(token: string): number {
  const payload = decodeJWT(token);
  return payload?.exp ? payload.exp * 1000 : 0;
}

/**
 * Establish (or re-establish) the portal session for a given identity. Returns
 * the resolved doctor + admin flag from the main app. Called by
 * useAuthenticatedDoctor on mount and on admin doctor selection.
 */
export async function establishPortalSession(
  ctx: PortalCredentials
): Promise<{ isAdmin: boolean; doctor: AlignerDoctor | null }> {
  authContext = ctx;
  cachedToken = null;
  cachedTokenExpMs = 0;
  const result = await requestToken(ctx);
  if (result.token) {
    cachedToken = result.token;
    cachedTokenExpMs = tokenExpiryMs(result.token);
  }
  return { isAdmin: result.isAdmin, doctor: result.doctor };
}

/** Clear the portal session (logout / impersonation cleared). */
export function clearPortalSession(): void {
  authContext = null;
  cachedToken = null;
  cachedTokenExpMs = 0;
}

/**
 * Fetch the full doctor list for the admin impersonation dropdown. Sourced from
 * the main app (RLS keeps a regular doctor from listing peers, and the admin
 * never gets a blanket mirror bypass), so this never touches Supabase.
 */
export async function fetchAdminDoctors(): Promise<AlignerDoctorMinimal[]> {
  if (!mainAppUrl) {
    throw new Error('VITE_MAIN_APP_URL is not configured');
  }
  const cfToken = getCfToken();
  const email = getDoctorEmail();
  const params = new URLSearchParams();
  if (!cfToken && email) params.set('email', email); // dev fallback
  const res = await fetch(`${mainAppUrl}/api/aligner-portal/doctors?${params.toString()}`, {
    headers: cfToken ? { Authorization: `Bearer ${cfToken}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Failed to load doctors (${res.status})`);
  }
  const json = (await res.json()) as { doctors?: AlignerDoctorMinimal[] };
  return json.doctors || [];
}

/**
 * supabase-js `accessToken` callback. Returns the current minted JWT, refreshing
 * it from the main app when expired. Falls back to the anon key (RLS → no rows)
 * before a session is established.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpMs - 30_000) {
    return cachedToken;
  }
  if (!authContext) {
    return supabaseAnonKey;
  }
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const result = await requestToken(authContext as PortalCredentials);
        cachedToken = result.token;
        cachedTokenExpMs = result.token ? tokenExpiryMs(result.token) : 0;
        return cachedToken;
      } finally {
        inFlight = null;
      }
    })();
  }
  const refreshed = await inFlight;
  return refreshed ?? supabaseAnonKey;
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: getAccessToken,
});

/**
 * JWT Payload structure from Cloudflare Access
 */
interface CloudflareJWTPayload {
  email?: string;
  sub?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

/**
 * Helper function to decode JWT token (Cloudflare Access)
 * Cloudflare Access sets a CF_Authorization cookie with user info
 */
function decodeJWT(token: string): CloudflareJWTPayload | null {
  try {
    // JWT has 3 parts: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (base64url)
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Helper function to get cookie value by name
 */
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() ?? null;
  }
  return null;
}

/**
 * Helper function to get doctor email from Cloudflare Access JWT
 * For static apps on Cloudflare Pages
 */
export function getDoctorEmailFromCloudflare(): string | null {
  // Check for Cloudflare Access JWT cookie
  const cfToken = getCookie('CF_Authorization');

  if (cfToken) {
    const payload = decodeJWT(cfToken);
    if (payload?.email) {
      return payload.email;
    }
  }

  return null;
}

/**
 * Helper function to get doctor email (supports multiple sources)
 */
export function getDoctorEmail(): string | null {
  // Priority 1: URL parameter (for development/testing)
  const params = new URLSearchParams(window.location.search);
  const emailParam = params.get('email');
  if (emailParam) {
    // Store in sessionStorage for navigation persistence
    sessionStorage.setItem('doctor_email', emailParam);
    return emailParam;
  }

  // Priority 2: Cloudflare Access JWT (for production)
  const cfEmail = getDoctorEmailFromCloudflare();
  if (cfEmail) {
    // Store in sessionStorage for navigation persistence
    sessionStorage.setItem('doctor_email', cfEmail);
    return cfEmail;
  }

  // Priority 3: sessionStorage (fallback)
  const storedEmail = sessionStorage.getItem('doctor_email');
  if (storedEmail) {
    return storedEmail;
  }

  return null;
}

/**
 * Helper function to format dates
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Helper function to format datetime
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Helper to format patient name
 */
export function formatPatientName(patient: Patient | null | undefined): string {
  if (!patient) return '';
  return patient.patient_name || `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
}

/**
 * Check if current user is admin
 */
export function isAdmin(email: string | null | undefined): boolean {
  return email?.toLowerCase() === 'shwan.orthodontics@gmail.com';
}

/**
 * Get impersonated doctor ID from sessionStorage (admin only)
 */
export function getImpersonatedDoctorId(): number | null {
  const doctorId = sessionStorage.getItem('admin_impersonated_doctor_id');
  return doctorId ? parseInt(doctorId, 10) : null;
}

/**
 * Clear impersonation state
 */
export function clearImpersonation(): void {
  sessionStorage.removeItem('admin_impersonated_doctor_id');
}
