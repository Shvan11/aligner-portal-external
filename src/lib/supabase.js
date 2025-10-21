/**
 * Supabase Client Configuration
 * Connects to PostgreSQL database on Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables!');
  console.log('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Helper function to decode JWT token (Cloudflare Access)
 * Cloudflare Access sets a CF_Authorization cookie with user info
 */
function decodeJWT(token) {
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
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

/**
 * Helper function to get cookie value by name
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return null;
}

/**
 * Helper function to get doctor email from Cloudflare Access JWT
 * For static apps on Cloudflare Pages
 */
export function getDoctorEmailFromCloudflare() {
  // Check for Cloudflare Access JWT cookie
  const cfToken = getCookie('CF_Authorization');

  if (cfToken) {
    const payload = decodeJWT(cfToken);
    if (payload && payload.email) {
      console.log('✅ Authenticated via Cloudflare Access:', payload.email);
      return payload.email;
    }
  }

  return null;
}

/**
 * Helper function to get doctor email (supports multiple sources)
 */
export function getDoctorEmail() {
  // Priority 1: URL parameter (for development/testing)
  const params = new URLSearchParams(window.location.search);
  const emailParam = params.get('email');
  if (emailParam) {
    console.log('🧪 Using email from URL parameter:', emailParam);
    return emailParam;
  }

  // Priority 2: Cloudflare Access JWT (for production)
  const cfEmail = getDoctorEmailFromCloudflare();
  if (cfEmail) {
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
export function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Helper function to format datetime
 */
export function formatDateTime(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Helper to format patient name
 */
export function formatPatientName(caseData) {
  return caseData.patient_name || `${caseData.first_name || ''} ${caseData.last_name || ''}`.trim();
}
