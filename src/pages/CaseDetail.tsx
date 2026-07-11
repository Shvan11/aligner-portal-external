/**
 * CaseDetail - Individual case detail with sets, batches, and notes
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCaseDetail } from '../lib/api';
import type { AlignerSetWithBatches } from '../lib/api';
import { useBatches } from '../hooks/useBatches';
import { useNotes } from '../hooks/useNotes';
import { usePhotos } from '../hooks/usePhotos';
import { useAuthenticatedDoctor } from '../hooks/useAuthenticatedDoctor';
import { useToast } from '../contexts/ToastContext';
import PortalHeader from '../components/shared/PortalHeader';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';
import SetCard from '../components/shared/SetCard';
import type { SelectedCase, ExpandedState, AlignerSetPhoto } from '../types';

const CaseDetail: React.FC = () => {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // Use custom hooks for data management
  const { batches, loadBatches, setBatchesData, updateDays } = useBatches();
  const { notes, loadNotes, addNote } = useNotes();
  const { photos, loadPhotos, removePhoto } = usePhotos();

  // Use custom auth hook
  const {
    loading: authLoading,
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

      // Auto-expand the active set and load its notes + photos. A photo-list
      // failure is swallowed (empty grid) — photos are auxiliary and must never
      // take the whole case view down with them.
      const activeSet = caseData.sets.find(set => set.is_active);
      if (activeSet) {
        await Promise.all([
          loadNotes(activeSet.aligner_set_id),
          loadPhotos(activeSet.aligner_set_id).catch(() => undefined),
        ]);
        setExpandedSets(prev => ({ ...prev, [activeSet.aligner_set_id]: true }));
      }
    } catch {
      toast.error('Failed to load case details');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, navigate, doctor?.dr_id, loadNotes, loadPhotos, setBatchesData]);

  // Load case data when doctor is authenticated. Any resolved non-doctor state
  // (admin with nothing picked, unknown email, a stale token, etc.) bounces to
  // the Dashboard, which owns the full auth-error UI — otherwise `loading` (init
  // true) never gets a setter to call and the spinner never leaves.
  useEffect(() => {
    if (authLoading) return;
    if (doctor?.dr_id) {
      loadCaseData();
    } else {
      navigate('/');
    }
  }, [authLoading, doctor?.dr_id, navigate, loadCaseData]);

  // Toggle set expansion
  const toggleSet = useCallback(
    async (setId: number): Promise<void> => {
      if (expandedSets[setId]) {
        setExpandedSets(prev => ({ ...prev, [setId]: false }));
        return;
      }
      try {
        // Load missing data in parallel
        const loadPromises: Promise<unknown>[] = [];
        if (!batches[setId]) loadPromises.push(loadBatches(setId));
        if (!notes[setId]) loadPromises.push(loadNotes(setId));
        // Photos are auxiliary: a failed list renders an empty grid instead of
        // blocking the expansion of batches/notes.
        if (!photos[setId]) loadPromises.push(loadPhotos(setId).catch(() => undefined));

        if (loadPromises.length > 0) {
          await Promise.all(loadPromises);
        }
        setExpandedSets(prev => ({ ...prev, [setId]: true }));
      } catch {
        // loadBatches/loadNotes/loadPhotos already stash their own per-set
        // error state; this rethrows, so without a catch here the card would
        // just silently fail to expand with no feedback at all.
        toast.error('Failed to load set details');
      }
    },
    [expandedSets, batches, notes, photos, loadBatches, loadNotes, loadPhotos, toast]
  );

  // Add a doctor note to a set (writes to mirror → reverse-syncs to local)
  const handleAddNote = useCallback(
    async (setId: number, noteText: string): Promise<void> => {
      await addNote(setId, noteText);
    },
    [addNote]
  );

  // Change a batch's days-per-aligner (writes to mirror → reverse-syncs to local)
  const handleUpdateDays = useCallback(
    async (setId: number, batchId: number, days: number): Promise<void> => {
      await updateDays(setId, batchId, days);
    },
    [updateDays]
  );

  // Re-list a set's photos (after an upload lands in the storage bucket)
  const handleRefreshPhotos = useCallback(
    async (setId: number): Promise<void> => {
      await loadPhotos(setId);
    },
    [loadPhotos]
  );

  // Delete a photo from the storage bucket, then re-list
  const handleDeletePhoto = useCallback(
    async (setId: number, photo: AlignerSetPhoto): Promise<void> => {
      await removePhoto(setId, photo);
    },
    [removePhoto]
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
            <i className="fas fa-tooth patient-watermark" aria-hidden="true"></i>
            <div className="patient-header-row">
              <div className="patient-avatar" aria-hidden="true">
                {selectedCase.patient?.patient_name?.trim().charAt(0) || '#'}
              </div>
              <div>
                <h2>{selectedCase.patient?.patient_name || `Work #${selectedCase.work_id}`}</h2>
                {selectedCase.patient?.phone && (
                  <div className="patient-header-meta">
                    <span>
                      <strong>Phone:</strong> {selectedCase.patient.phone}
                    </span>
                  </div>
                )}
              </div>
            </div>
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
                  photos={photos[set.aligner_set_id]}
                  onToggleExpand={toggleSet}
                  onAddNote={handleAddNote}
                  onUpdateDays={handleUpdateDays}
                  onRefreshPhotos={handleRefreshPhotos}
                  onDeletePhoto={handleDeletePhoto}
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
