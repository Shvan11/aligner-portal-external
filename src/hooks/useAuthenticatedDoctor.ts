/**
 * useAuthenticatedDoctor - Custom hook for doctor authentication
 * Handles both regular doctor auth and admin impersonation
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, getDoctorEmail, isAdmin, getImpersonatedDoctorId } from '../lib/supabase';
import type { AlignerDoctor } from '../types';

/**
 * Hook options
 */
export interface UseAuthenticatedDoctorOptions {
  requireDoctor?: boolean;
}

/**
 * Hook return type
 */
export interface UseAuthenticatedDoctorReturn {
  loading: boolean;
  error: string | null;
  doctor: AlignerDoctor | null;
  adminEmail: string | null;
  impersonatedDoctor: AlignerDoctor | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  handleAdminDoctorSelect: (selectedDoctor: AlignerDoctor | null) => Promise<{
    success: boolean;
    doctor: AlignerDoctor | null;
  }>;
  handleLogout: () => void;
  setDoctor: React.Dispatch<React.SetStateAction<AlignerDoctor | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/**
 * Hook for authenticating doctors and handling admin impersonation
 */
export function useAuthenticatedDoctor(
  options: UseAuthenticatedDoctorOptions = {}
): UseAuthenticatedDoctorReturn {
  const { requireDoctor = false } = options;

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<AlignerDoctor | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [impersonatedDoctor, setImpersonatedDoctor] = useState<AlignerDoctor | null>(null);

  // Load doctor authentication on mount
  useEffect(() => {
    let isMounted = true;

    const loadDoctorAuth = async (): Promise<void> => {
      try {
        // Get doctor email from Cloudflare Access JWT or URL parameter
        const email = getDoctorEmail();

        if (!email) {
          if (isMounted) {
            setError(
              'Authentication failed. No email found.\n\n' +
                'Production: Ensure Cloudflare Access is configured and you are authenticated.\n' +
                'Testing: Add ?email=your@email.com to the URL'
            );
            setLoading(false);
          }
          return;
        }

        // Check if admin
        if (isAdmin(email)) {
          if (isMounted) {
            setAdminEmail(email);
          }

          // Check if admin has previously selected a doctor to impersonate
          const impersonatedDrId = getImpersonatedDoctorId();
          if (impersonatedDrId) {
            // Load the impersonated doctor
            const { data: impersonatedDoc, error: impError } = await supabase
              .from('aligner_doctors')
              .select('*')
              .eq('dr_id', impersonatedDrId)
              .single();

            if (!impError && impersonatedDoc && isMounted) {
              setImpersonatedDoctor(impersonatedDoc as AlignerDoctor);
              setDoctor(impersonatedDoc as AlignerDoctor);
            }
          } else if (requireDoctor && isMounted) {
            // Admin hasn't selected a doctor yet
            setError('admin_no_doctor_selected');
          }

          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        // Regular doctor authentication
        const { data, error: queryError } = await supabase
          .from('aligner_doctors')
          .select('*')
          .eq('doctor_email', email.toLowerCase())
          .single();

        if (queryError || !data) {
          if (isMounted) {
            setError(
              `Doctor not found: ${email}.\n\nPlease contact administrator to add your email to the system.`
            );
          }
        } else if (isMounted) {
          setDoctor(data as AlignerDoctor);
        }
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setError(`Failed to authenticate: ${message}. Please try again.`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDoctorAuth();

    return () => {
      isMounted = false;
    };
  }, [requireDoctor]);

  // Handle admin doctor selection
  const handleAdminDoctorSelect = useCallback(
    async (
      selectedDoctor: AlignerDoctor | null
    ): Promise<{ success: boolean; doctor: AlignerDoctor | null }> => {
      if (!selectedDoctor) {
        setImpersonatedDoctor(null);
        setDoctor(null);
        return { success: true, doctor: null };
      }

      setImpersonatedDoctor(selectedDoctor);
      setDoctor(selectedDoctor);
      return { success: true, doctor: selectedDoctor };
    },
    []
  );

  // Logout handler
  const handleLogout = useCallback((): void => {
    window.location.href = '/cdn-cgi/access/logout';
  }, []);

  return {
    // State
    loading,
    error,
    doctor,
    adminEmail,
    impersonatedDoctor,
    isAdmin: !!adminEmail,
    isAuthenticated: !!doctor,

    // Actions
    handleAdminDoctorSelect,
    handleLogout,
    setDoctor,
    setLoading,
    setError,
  };
}

export default useAuthenticatedDoctor;
