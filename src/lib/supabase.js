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
 * Helper function to authenticate with backend and get doctor email
 * This fetches email from Cloudflare Access via the backend API
 */
export async function authenticateDoctor() {
  try {
    // Call backend auth endpoint which reads Cloudflare Access headers
    const response = await fetch('/api/portal/auth', {
      credentials: 'include' // Include cookies for session
    });

    const data = await response.json();

    if (data.success && data.doctor) {
      // Store doctor info in sessionStorage for subsequent use
      sessionStorage.setItem('doctor_email', data.doctor.DoctorEmail);
      sessionStorage.setItem('doctor_name', data.doctor.DoctorName);
      sessionStorage.setItem('doctor_id', data.doctor.DrID);

      console.log('✅ Authenticated as:', data.doctor.DoctorEmail);
      return data.doctor;
    } else {
      console.error('❌ Authentication failed:', data.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return null;
  }
}

/**
 * Helper function to get doctor email (from sessionStorage after auth)
 */
export function getDoctorEmail() {
  // For development: check URL parameter (allows bypassing Cloudflare)
  const params = new URLSearchParams(window.location.search);
  const emailParam = params.get('email');
  if (emailParam) {
    console.log('Using email from URL parameter:', emailParam);
    return emailParam;
  }

  // For production: Get from sessionStorage (set by authenticateDoctor)
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
