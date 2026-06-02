/**
 * useAuthenticatedDoctor - Custom hook for doctor authentication
 * Handles both regular doctor auth and admin impersonation
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getDoctorEmail,
  getCfToken,
  isAdmin,
  getImpersonatedDoctorId,
  establishPortalSession,
} from '../lib/supabase';
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
        const cfToken = getCfToken();

        if (!email && !cfToken) {
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

        const admin = isAdmin(email);

        // Admin flow — may impersonate a previously-selected doctor.
        if (admin) {
          if (isMounted) setAdminEmail(email);

          const impersonatedDrId = getImpersonatedDoctorId();
          // Mint a token scoped to the impersonated doctor (or an identity-only
          // token when none is selected yet).
          const { doctor: resolved } = await establishPortalSession({
            cfToken,
            email,
            impersonateDrId: impersonatedDrId ?? undefined,
          });

          if (resolved && isMounted) {
            setImpersonatedDoctor(resolved);
            setDoctor(resolved);
          } else if (requireDoctor && isMounted) {
            setError('admin_no_doctor_selected');
          }

          if (isMounted) setLoading(false);
          return;
        }

        // Regular doctor — the main app maps the verified identity to a dr_id
        // and mints a scoped token; the resolved doctor row comes back with it.
        const { doctor: resolved } = await establishPortalSession({ cfToken, email });

        if (!resolved) {
          if (isMounted) {
            setError(
              `Doctor not found: ${email}.\n\nPlease contact administrator to add your email to the system.`
            );
          }
        } else if (isMounted) {
          setDoctor(resolved);
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

  // Handle admin doctor selection — re-mint the Supabase token scoped to the
  // chosen doctor so RLS returns that doctor's rows.
  const handleAdminDoctorSelect = useCallback(
    async (
      selectedDoctor: AlignerDoctor | null
    ): Promise<{ success: boolean; doctor: AlignerDoctor | null }> => {
      const cfToken = getCfToken();
      const email = getDoctorEmail();

      if (!selectedDoctor) {
        // Clear impersonation: identity-only token (no rows until one is picked).
        await establishPortalSession({ cfToken, email });
        setImpersonatedDoctor(null);
        setDoctor(null);
        return { success: true, doctor: null };
      }

      const { doctor: resolved } = await establishPortalSession({
        cfToken,
        email,
        impersonateDrId: selectedDoctor.dr_id,
      });
      const effective = resolved ?? selectedDoctor;
      setImpersonatedDoctor(effective);
      setDoctor(effective);
      return { success: true, doctor: effective };
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
