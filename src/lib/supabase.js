/**
 * Supabase Client Configuration
 * Connects to PostgreSQL database on Supabase
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

/**
 * Check if current user is admin
 */
export function isAdmin(email) {
  return email?.toLowerCase() === 'shwan.orthodontics@gmail.com';
}

/**
 * Get impersonated doctor ID from sessionStorage (admin only)
 */
export function getImpersonatedDoctorId() {
  const doctorId = sessionStorage.getItem('admin_impersonated_doctor_id');
  return doctorId ? parseInt(doctorId) : null;
}

/**
 * Clear impersonation state
 */
export function clearImpersonation() {
  sessionStorage.removeItem('admin_impersonated_doctor_id');
}
