/**
 * Dashboard - External Portal Dashboard with React Router
 */

import React, { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAlignerSetsWithDetails, clearDashboardCache } from '../lib/api';
import { useAuthenticatedDoctor } from '../hooks/useAuthenticatedDoctor';
import { useToast } from '../contexts/ToastContext';
import PortalHeader from '../components/shared/PortalHeader';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';
import AdminDoctorSelector from '../components/shared/AdminDoctorSelector';
import CaseCard from '../components/shared/CaseCard';
import type { AlignerDoctor, AlignerSetWithDetails, CaseData } from '../types';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [cases, setCases] = useState<CaseData[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [casesLoading, setCasesLoading] = useState<boolean>(false);

  // Use custom auth hook
  const {
    loading,
    error,
    doctor,
    adminEmail,
    impersonatedDoctor,
    handleAdminDoctorSelect: baseHandleAdminDoctorSelect,
    handleLogout,
  } = useAuthenticatedDoctor();

  // Load all cases for this doctor (optimized with single deep join query)
  const loadCases = useCallback(async (drId: number): Promise<void> => {
    setCasesLoading(true);
    try {
      // Single query with deep joins - work and patient data included
      const sets = await fetchAlignerSetsWithDetails(drId);

      // Group by work_id to create cases
      const casesMap: Record<number, CaseData> = {};
      sets.forEach((set: AlignerSetWithDetails) => {
        if (!casesMap[set.work_id]) {
          casesMap[set.work_id] = {
            work_id: set.work_id,
            patient: set.work.patients,
            type_of_work: set.work.type_of_work,
            sets: [],
            total_sets: 0,
            active_sets: 0,
            active_set: null,
          };
        }
        casesMap[set.work_id].sets.push(set);
        casesMap[set.work_id].total_sets++;
        if (set.is_active) {
          casesMap[set.work_id].active_sets++;
          casesMap[set.work_id].active_set = set;
        }
      });

      setCases(Object.values(casesMap));
    } catch {
      toast.error('Failed to load cases');
    } finally {
      setCasesLoading(false);
    }
    // Note: toast.error is a stable callback from ToastContext, safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load cases when doctor changes
  useEffect(() => {
    if (doctor?.dr_id) {
      loadCases(doctor.dr_id);
    }
  }, [doctor?.dr_id, loadCases]);

  // Handle admin doctor selection
  const handleAdminDoctorSelect = useCallback(
    async (selectedDoctor: AlignerDoctor | null): Promise<void> => {
      if (!selectedDoctor) {
        setCases([]);
      } else {
        // Clear cache for new doctor to ensure fresh data
        clearDashboardCache(selectedDoctor.dr_id);
      }
      await baseHandleAdminDoctorSelect(selectedDoctor);
    },
    [baseHandleAdminDoctorSelect]
  );

  // Navigate to case detail
  const selectCase = useCallback(
    (caseData: CaseData): void => {
      navigate(`/case/${caseData.work_id}`);
    },
    [navigate]
  );

  // Handle search input change
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
  };

  // Filter cases by search query
  const getFilteredCases = (): CaseData[] => {
    if (!searchQuery.trim()) {
      return cases;
    }
    const query = searchQuery.toLowerCase();
    return cases.filter(c => {
      const workId = c.work_id.toString();
      const patientName = c.patient?.patient_name?.toLowerCase() || '';
      const phone = c.patient?.phone?.toLowerCase() || '';

      return (
        workId.includes(query) ||
        patientName.includes(query) ||
        phone.includes(query)
      );
    });
  };

  // Get active cases count
  const getActiveCasesCount = (): number => cases.filter(c => c.active_sets > 0).length;

  // Render loading state
  if (loading) {
    return (
      <div className="portal-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading portal...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="portal-container">
        <div className="error-container">
          <i className="fas fa-exclamation-triangle"></i>
          <h2>Authentication Error</h2>
          <p>{error}</p>
          <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
            For testing, add ?email=doctor@example.com to the URL
          </p>
          <button className="logout-btn" onClick={handleLogout} style={{ marginTop: '1.5rem' }}>
            <i className="fas fa-sign-out-alt"></i>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-container">
      <PortalHeader doctor={doctor} />
      <AnnouncementBanner doctorId={doctor?.dr_id} />

      <main className="portal-main">
        {/* Admin Doctor Selector */}
        {adminEmail && !impersonatedDoctor && (
          <AdminDoctorSelector onDoctorSelect={handleAdminDoctorSelect} />
        )}

        {/* Admin Impersonation Bar */}
        {adminEmail && impersonatedDoctor && (
          <div className="admin-impersonation-bar">
            <div className="admin-impersonation-info">
              <i className="fas fa-user-shield"></i>
              <span>
                Admin View - Viewing as: <strong>Dr. {impersonatedDoctor.doctor_name}</strong>
              </span>
            </div>
            <AdminDoctorSelector onDoctorSelect={handleAdminDoctorSelect} />
          </div>
        )}

        {/* Show cases only if doctor is selected (admin or regular) */}
        {doctor && (
          <>
            <div className="dashboard-header">
              <h2 className="dashboard-title">My Cases</h2>
            </div>

            {/* Stats */}
            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-value">{cases.length}</div>
                <div className="stat-label">Total Cases</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--portal-success)' }}>
                  {getActiveCasesCount()}
                </div>
                <div className="stat-label">Active Cases</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--portal-grey)' }}>
                  {cases.length - getActiveCasesCount()}
                </div>
                <div className="stat-label">Completed</div>
              </div>
            </div>

            {/* Search */}
            <div className="search-container">
              <i className="fas fa-search search-icon"></i>
              <input
                type="text"
                className="search-input"
                placeholder="Search by patient name, phone, or work ID..."
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>

            {/* Cases Grid */}
            {casesLoading ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading cases...</p>
              </div>
            ) : getFilteredCases().length === 0 ? (
              <div className="empty-state">
                <i className="fas fa-inbox"></i>
                <h3>No cases found</h3>
                <p>{searchQuery ? 'Try a different search term' : 'No aligner cases assigned yet'}</p>
              </div>
            ) : (
              <div className="cases-grid">
                {getFilteredCases().map(caseData => (
                  <CaseCard key={caseData.work_id} caseData={caseData} onSelect={selectCase} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
