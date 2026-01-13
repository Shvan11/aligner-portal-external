/**
 * CaseDetail - Individual case detail with sets, batches, and notes
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchWork, fetchPatient, fetchSetsForWork, updateBatchDays } from '../lib/api';
import { useBatches } from '../hooks/useBatches';
import { useNotes } from '../hooks/useNotes';
import { usePhotos } from '../hooks/usePhotos';
import { useAuthenticatedDoctor } from '../hooks/useAuthenticatedDoctor';
import { useToast } from '../contexts/ToastContext';
import PortalHeader from '../components/shared/PortalHeader';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';
import SetCard from '../components/shared/SetCard';
import FullscreenImageViewer from '../components/shared/FullscreenImageViewer';
import type { AlignerSet, AlignerSetPhoto, SelectedCase, ExpandedState, ShowAddNoteState } from '../types';

const CaseDetail: React.FC = () => {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // Use custom hooks for data management
  const { batches, loadBatches } = useBatches();
  const { notes, loadNotes, addNote: addNoteHook } = useNotes();
  const { photos, loadPhotos } = usePhotos();

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
  const [sets, setSets] = useState<AlignerSet[]>([]);
  const [expandedSets, setExpandedSets] = useState<ExpandedState>({});
  const [showAddNote, setShowAddNote] = useState<ShowAddNoteState>({});
  const [noteText, setNoteText] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<AlignerSetPhoto | null>(null);

  // Load sets for a specific case
  const loadSets = useCallback(async (workIdParam: number, drId: number): Promise<void> => {
    try {
      // Fetch sets using API utility
      const data = await fetchSetsForWork(workIdParam, drId);

      setSets(data);

      // Auto-expand the active set
      const activeSet = data.find(set => set.is_active);
      if (activeSet) {
        await loadBatches(activeSet.aligner_set_id);
        await loadNotes(activeSet.aligner_set_id);
        await loadPhotos(activeSet.aligner_set_id);
        setExpandedSets(prev => ({ ...prev, [activeSet.aligner_set_id]: true }));
      }
    } catch {
      toast.error('Failed to load aligner sets');
    }
  }, [loadBatches, loadNotes, loadPhotos, toast]);

  // Load case and sets data
  const loadCaseData = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      // Load work data (using API utility)
      const workData = await fetchWork(parseInt(workId || '0', 10));

      if (!workData) {
        navigate('/');
        return;
      }

      // Load patient data (using API utility)
      const patientData = await fetchPatient(workData.person_id);

      // Set case data
      setSelectedCase({
        work_id: workData.work_id,
        type_of_work: workData.type_of_work,
        patient: patientData,
      });

      // Load sets
      if (doctor?.dr_id) {
        await loadSets(parseInt(workId || '0', 10), doctor.dr_id);
      }
    } catch {
      toast.error('Failed to load case details');
    } finally {
      setLoading(false);
    }
  }, [workId, navigate, doctor?.dr_id, loadSets, toast]);

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
        if (!batches[setId]) {
          await loadBatches(setId);
        }
        if (!notes[setId]) {
          await loadNotes(setId);
        }
        if (!photos[setId]) {
          await loadPhotos(setId);
        }
        setExpandedSets(prev => ({ ...prev, [setId]: true }));
      }
    },
    [expandedSets, batches, notes, photos, loadBatches, loadNotes, loadPhotos]
  );

  // Update days per aligner (EDITABLE!)
  const updateDays = useCallback(
    async (batchId: number, newDays: number): Promise<void> => {
      try {
        // Update using API utility
        await updateBatchDays(batchId, newDays);

        // Find which set this batch belongs to and reload
        const batch = Object.values(batches)
          .flat()
          .find(b => b.aligner_batch_id === batchId);

        if (batch) {
          await loadBatches(batch.aligner_set_id);
        }

        toast.success('Days per aligner updated successfully');
      } catch {
        toast.error('Failed to update days per aligner');
      }
    },
    [batches, loadBatches, toast]
  );

  // Add a note (EDITABLE!)
  const addNote = useCallback(
    async (setId: number): Promise<void> => {
      if (!noteText.trim()) {
        toast.warning('Please enter a note');
        return;
      }

      try {
        // Use custom hook to add note
        await addNoteHook(setId, noteText, 'Doctor');

        setNoteText('');
        setShowAddNote(prev => ({ ...prev, [setId]: false }));
        toast.success('Note added successfully');
      } catch {
        toast.error('Failed to add note');
      }
    },
    [noteText, addNoteHook, toast]
  );

  // Handle toggle add note
  const handleToggleAddNote = useCallback((setId: number, show: boolean): void => {
    setShowAddNote(prev => ({ ...prev, [setId]: show }));
  }, []);

  // Handle photo click
  const handlePhotoClick = useCallback((photo: AlignerSetPhoto): void => {
    setSelectedPhoto(photo);
  }, []);

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
                <div>
                  <strong>Patient ID:</strong> {selectedCase.patient.patient_id}
                </div>
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
                  photos={photos[set.aligner_set_id]}
                  showAddNote={showAddNote[set.aligner_set_id]}
                  noteText={noteText}
                  onToggleExpand={toggleSet}
                  onUpdateDays={updateDays}
                  onToggleAddNote={handleToggleAddNote}
                  onNoteTextChange={setNoteText}
                  onAddNote={addNote}
                  onLoadPhotos={loadPhotos}
                  onPhotoClick={handlePhotoClick}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Fullscreen Photo Viewer */}
      {selectedPhoto && (
        <FullscreenImageViewer photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </div>
  );
};

export default CaseDetail;
