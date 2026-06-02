/**
 * CaseDetail - Individual case detail with sets, batches, and notes
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCaseDetail } from '../lib/api';
import type { AlignerSetWithBatches } from '../lib/api';
import { useBatches } from '../hooks/useBatches';
import { useNotes } from '../hooks/useNotes';
import { useAuthenticatedDoctor } from '../hooks/useAuthenticatedDoctor';
import { useToast } from '../contexts/ToastContext';
import PortalHeader from '../components/shared/PortalHeader';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';
import SetCard from '../components/shared/SetCard';
import type { SelectedCase, ExpandedState } from '../types';

const CaseDetail: React.FC = () => {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // Use custom hooks for data management
  const { batches, loadBatches, setBatchesData } = useBatches();
  const { notes, loadNotes } = useNotes();

  // Use custom auth hook
  const {
    loading: authLoading,
    error: authError,
    doctor,
    adminEmail,
    impersonatedDoctor,
  } = useAuthenticatedDoctor({ requireDoctor: true });

  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCase, setSelectedCase] = useState<SelectedCase | null>(null);
  const [sets, setSets] = useState<AlignerSetWithBatches[]>([]);
  const [expandedSets, setExpandedSets] = useState<ExpandedState>({});

  // Load case and sets data
  const loadCaseData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      if (!doctor?.dr_id) return;

      // work + patient + sets + batches (joined client-side in fetchCaseDetail)
      const caseData = await fetchCaseDetail(parseInt(workId || '0', 10), doctor.dr_id);

      if (!caseData) {
        navigate('/');
        return;
      }

      // Set case data
      setSelectedCase({
        work_id: caseData.work.work_id,
        type_of_work: caseData.work.type_of_work,
        patient: caseData.work.patients,
      });

      // Set sets (batches already included)
      setSets(caseData.sets);

      // Pre-populate batches cache from the response
      caseData.sets.forEach(set => {
        if (set.aligner_batches) {
          setBatchesData(set.aligner_set_id, set.aligner_batches);
        }
      });

      // Auto-expand the active set and load its notes
      const activeSet = caseData.sets.find(set => set.is_active);
      if (activeSet) {
        await loadNotes(activeSet.aligner_set_id);
        setExpandedSets(prev => ({ ...prev, [activeSet.aligner_set_id]: true }));
      }
    } catch {
      toast.error('Failed to load case details');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, navigate, doctor?.dr_id, loadNotes, setBatchesData]);

  // Load case data when doctor is authenticated
  useEffect(() => {
    if (!authLoading && doctor?.dr_id) {
      loadCaseData();
    } else if (!authLoading && authError === 'admin_no_doctor_selected') {
      navigate('/');
    }
  }, [authLoading, doctor?.dr_id, authError, navigate, loadCaseData]);

  // Toggle set expansion
  const toggleSet = useCallback(
    async (setId: number): Promise<void> => {
      if (expandedSets[setId]) {
        setExpandedSets(prev => ({ ...prev, [setId]: false }));
      } else {
        // Load missing data in parallel
        const loadPromises: Promise<unknown>[] = [];
        if (!batches[setId]) loadPromises.push(loadBatches(setId));
        if (!notes[setId]) loadPromises.push(loadNotes(setId));

        if (loadPromises.length > 0) {
          await Promise.all(loadPromises);
        }
        setExpandedSets(prev => ({ ...prev, [setId]: true }));
      }
    },
    [expandedSets, batches, notes, loadBatches, loadNotes]
  );

  // Navigate back to dashboard
  const backToCases = (): void => {
    navigate('/');
  };

  // Show loading while auth is in progress
  if (authLoading || loading) {
    return (
      <div className="portal-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading case details...</p>
        </div>
      </div>
    );
  }

  // Render case not found
  if (!selectedCase) {
    return (
      <div className="portal-container">
        <PortalHeader doctor={doctor} />
        <div className="error-container">
          <i className="fas fa-exclamation-triangle"></i>
          <h2>Case Not Found</h2>
          <p>The requested case could not be found.</p>
          <button onClick={backToCases} className="logout-btn">
            Back to Dashboard
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
        {/* Admin Impersonation Indicator */}
        {adminEmail && impersonatedDoctor && (
          <div className="admin-impersonation-bar" style={{ marginBottom: '1.5rem' }}>
            <div className="admin-impersonation-info">
              <i className="fas fa-user-shield"></i>
              <span>
                Admin View - Viewing case as:{' '}
                <strong>Dr. {impersonatedDoctor.doctor_name}</strong>
              </span>
            </div>
          </div>
        )}

        <div className="case-detail-container">
          <button className="back-button" onClick={backToCases}>
            <i className="fas fa-arrow-left"></i>
            Back to Cases
          </button>

          <div className="patient-header-card">
            <h2>{selectedCase.patient?.patient_name || `Work #${selectedCase.work_id}`}</h2>
            {selectedCase.patient && (
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.95rem',
                  color: 'var(--portal-grey)',
                }}
              >
                {selectedCase.patient.phone && (
                  <div>
                    <strong>Phone:</strong> {selectedCase.patient.phone}
                  </div>
                )}
                {selectedCase.type_of_work && (
                  <div>
                    <strong>Treatment:</strong> {selectedCase.type_of_work}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sets List */}
          {sets.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-inbox"></i>
              <h3>No aligner sets found</h3>
            </div>
          ) : (
            <div className="sets-list">
              {sets.map(set => (
                <SetCard
                  key={set.aligner_set_id}
                  set={set}
                  doctor={doctor!}
                  isExpanded={expandedSets[set.aligner_set_id] || false}
                  batches={batches[set.aligner_set_id]}
                  notes={notes[set.aligner_set_id]}
                  onToggleExpand={toggleSet}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CaseDetail;
