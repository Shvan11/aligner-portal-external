// CaseDetail.jsx - Individual case detail with sets, batches, and notes
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, getDoctorEmail, formatDate, isAdmin, getImpersonatedDoctorId } from '../lib/supabase';
import { fetchWork, fetchPatient, fetchSetsForWork, updateBatchDays } from '../lib/api';
import { useBatches } from '../hooks/useBatches';
import { useNotes } from '../hooks/useNotes';
import { usePhotos } from '../hooks/usePhotos';
import PortalHeader from '../components/shared/PortalHeader';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';
import BatchesSection from '../components/shared/BatchesSection';
import NotesSection from '../components/shared/NotesSection';
import SetPhotoUpload from '../components/shared/SetPhotoUpload';
import SetPhotoGrid from '../components/shared/SetPhotoGrid';
import FullscreenImageViewer from '../components/shared/FullscreenImageViewer';

const CaseDetail = () => {
    const { workId } = useParams();
    const navigate = useNavigate();

    // Use custom hooks for data management
    const { batches, loadBatches } = useBatches();
    const { notes, loadNotes, addNote: addNoteHook } = useNotes();
    const { photos, loadPhotos } = usePhotos();

    const [loading, setLoading] = useState(true);
    const [doctor, setDoctor] = useState(null);
    const [selectedCase, setSelectedCase] = useState(null);
    const [sets, setSets] = useState([]);
    const [expandedSets, setExpandedSets] = useState({});
    const [showAddNote, setShowAddNote] = useState({});
    const [noteText, setNoteText] = useState('');
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [adminEmail, setAdminEmail] = useState(null);
    const [impersonatedDoctor, setImpersonatedDoctor] = useState(null);

    // Load data on mount
    useEffect(() => {
        loadData();
    }, [workId]);

    // Load doctor and case data
    const loadData = async () => {
        try {
            // Get doctor email
            const email = getDoctorEmail();
            if (!email) {
                navigate('/');
                return;
            }

            // Check if admin
            if (isAdmin(email)) {
                setAdminEmail(email);

                // Check if admin has selected a doctor to impersonate
                const impersonatedDrId = getImpersonatedDoctorId();
                if (!impersonatedDrId) {
                    navigate('/');
                    return;
                }

                // Load the impersonated doctor
                const { data: impersonatedDoc, error: impError } = await supabase
                    .from('aligner_doctors')
                    .select('*')
                    .eq('dr_id', impersonatedDrId)
                    .single();

                if (impError || !impersonatedDoc) {
                    navigate('/');
                    return;
                }

                setImpersonatedDoctor(impersonatedDoc);
                setDoctor(impersonatedDoc);

                // Load case and sets using impersonated doctor's ID
                await loadCaseAndSets(parseInt(workId), impersonatedDoc.dr_id);

            } else {
                // Regular doctor authentication
                const { data: doctorData, error: doctorError } = await supabase
                    .from('aligner_doctors')
                    .select('*')
                    .eq('doctor_email', email.toLowerCase())
                    .single();

                if (doctorError || !doctorData) {
                    navigate('/');
                    return;
                }

                setDoctor(doctorData);

                // Load case and sets
                await loadCaseAndSets(parseInt(workId), doctorData.dr_id);
            }

        } catch (error) {
            // Error loading data
        } finally {
            setLoading(false);
        }
    };

    // Load case and sets data
    const loadCaseAndSets = async (workIdParam, drId) => {
        try {
            // Load work data (using API utility)
            const workData = await fetchWork(workIdParam);

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
                patient: patientData
            });

            // Load sets
            await loadSets(workIdParam, drId);

        } catch (error) {
            // Error loading case
        }
    };

    // Load sets for a specific case
    const loadSets = async (workIdParam, drId) => {
        try {
            // Fetch sets using API utility
            const data = await fetchSetsForWork(workIdParam, drId);

            setSets(data);

            // Auto-expand the active set
            const activeSet = data.find(set => set.is_active);
            if (activeSet) {
                await loadBatches(activeSet.aligner_set_id);
                await loadNotes(activeSet.aligner_set_id);
                setExpandedSets(prev => ({ ...prev, [activeSet.aligner_set_id]: true }));
            }

        } catch (error) {
            // Error loading sets
        }
    };

    // Note: loadBatches, loadNotes, and loadPhotos are now provided by custom hooks

    // Toggle set expansion
    const toggleSet = async (setId) => {
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
    };

    // Update days per aligner (EDITABLE!)
    const updateDays = async (batchId, newDays) => {
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

            alert('Days per aligner updated successfully');

        } catch (error) {
            alert('Failed to update days per aligner');
        }
    };

    // Add a note (EDITABLE!)
    const addNote = async (setId) => {
        if (!noteText.trim()) {
            alert('Please enter a note');
            return;
        }

        try {
            // Use custom hook to add note
            await addNoteHook(setId, noteText, 'Doctor');

            setNoteText('');
            setShowAddNote(prev => ({ ...prev, [setId]: false }));

        } catch (error) {
            alert('Failed to add note');
        }
    };

    // Calculate progress
    const calculateProgress = (set) => {
        const delivered = (set.upper_aligners_count || 0) + (set.lower_aligners_count || 0) -
                         (set.remaining_upper_aligners || 0) - (set.remaining_lower_aligners || 0);
        const total = (set.upper_aligners_count || 0) + (set.lower_aligners_count || 0);
        return total > 0 ? Math.round((delivered / total) * 100) : 0;
    };

    // Navigate back to dashboard
    const backToCases = () => {
        navigate('/');
    };

    // Render loading state
    if (loading) {
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
            <PortalHeader doctor={doctor} isAdmin={!!adminEmail} impersonatedDoctor={impersonatedDoctor} />
            <AnnouncementBanner doctorId={doctor?.dr_id} />

            <main className="portal-main">
                {/* Admin Impersonation Indicator */}
                {adminEmail && impersonatedDoctor && (
                    <div className="admin-impersonation-bar" style={{ marginBottom: '1.5rem' }}>
                        <div className="admin-impersonation-info">
                            <i className="fas fa-user-shield"></i>
                            <span>Admin View - Viewing case as: <strong>Dr. {impersonatedDoctor.doctor_name}</strong></span>
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
                            <div style={{ marginTop: '0.5rem', fontSize: '0.95rem', color: 'var(--portal-grey)' }}>
                                <div><strong>Patient ID:</strong> {selectedCase.patient.patient_id}</div>
                                {selectedCase.patient.phone && (
                                    <div><strong>Phone:</strong> {selectedCase.patient.phone}</div>
                                )}
                                {selectedCase.type_of_work && (
                                    <div><strong>Treatment:</strong> {selectedCase.type_of_work}</div>
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
                            {sets.map((set) => {
                                const progress = calculateProgress(set);
                                const delivered = (set.upper_aligners_count || 0) + (set.lower_aligners_count || 0) -
                                                (set.remaining_upper_aligners || 0) - (set.remaining_lower_aligners || 0);
                                const total = (set.upper_aligners_count || 0) + (set.lower_aligners_count || 0);
                                const payment = set.aligner_set_payments?.[0];

                                return (
                                    <div key={set.aligner_set_id} className={`set-card ${set.is_active ? '' : 'inactive'}`}>
                                        <div className="set-header" onClick={() => toggleSet(set.aligner_set_id)}>
                                            <div className="set-title-row">
                                                <h3>Set #{set.set_sequence}</h3>
                                                {set.type && (
                                                    <span className="set-type-badge">{set.type}</span>
                                                )}
                                                <span className={set.is_active ? 'case-active-badge' : 'case-inactive-badge'}>
                                                    {set.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                            <button className={`set-expand-btn ${expandedSets[set.aligner_set_id] ? 'expanded' : ''}`}>
                                                <i className="fas fa-chevron-down"></i>
                                            </button>
                                        </div>

                                        <div className="set-info-grid">
                                            <div className="set-info-item">
                                                <i className="fas fa-teeth"></i>
                                                <span>Upper: <strong>{set.upper_aligners_count || 0}</strong></span>
                                            </div>
                                            <div className="set-info-item">
                                                <i className="fas fa-teeth"></i>
                                                <span>Lower: <strong>{set.lower_aligners_count || 0}</strong></span>
                                            </div>
                                            <div className="set-info-item">
                                                <i className="fas fa-calendar"></i>
                                                <span>Created: <strong>{formatDate(set.creation_date)}</strong></span>
                                            </div>
                                        </div>

                                        {/* Payment Summary */}
                                        {payment && (
                                            <div className="set-payment-summary">
                                                <div className="payment-summary-item">
                                                    <div className="payment-summary-label">Total Required</div>
                                                    <div className="payment-summary-value">{set.set_cost !== null && set.set_cost !== undefined ? set.set_cost : 0} {set.currency || 'USD'}</div>
                                                </div>
                                                <div className="payment-summary-divider"></div>
                                                <div className="payment-summary-item">
                                                    <div className="payment-summary-label">Total Paid</div>
                                                    <div className="payment-summary-value paid">{payment.total_paid !== null && payment.total_paid !== undefined ? payment.total_paid : 0} {set.currency || 'USD'}</div>
                                                </div>
                                                <div className="payment-summary-divider"></div>
                                                <div className="payment-summary-item">
                                                    <div className="payment-summary-label">Balance</div>
                                                    <div className="payment-summary-value balance">{payment.balance !== null && payment.balance !== undefined ? payment.balance : 0} {set.currency || 'USD'}</div>
                                                </div>
                                                <div className="payment-summary-status">
                                                    <span className={`payment-status-badge ${payment.payment_status?.toLowerCase().replace(/\s+/g, '-') || 'unpaid'}`}>
                                                        {payment.payment_status || 'Unpaid'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* URLs */}
                                        <div className="set-urls">
                                            {set.set_url && (
                                                <a href={set.set_url} target="_blank" rel="noopener noreferrer" className="url-btn">
                                                    <i className="fas fa-link"></i>
                                                    Setup URL
                                                </a>
                                            )}
                                            {set.set_pdf_url && (
                                                <a href={set.set_pdf_url} target="_blank" rel="noopener noreferrer" className="url-btn pdf">
                                                    <i className="fas fa-file-pdf"></i>
                                                    View PDF
                                                </a>
                                            )}
                                        </div>

                                        <div className="set-progress">
                                            <div className="progress-bar-container">
                                                <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                                            </div>
                                            <div className="progress-text">
                                                <span>{delivered} of {total} aligners delivered</span>
                                                <span>{progress}%</span>
                                            </div>
                                        </div>

                                        {expandedSets[set.aligner_set_id] && (
                                            <>
                                                {/* Batches with EDITABLE Days */}
                                                {batches[set.aligner_set_id] && batches[set.aligner_set_id].length > 0 && (
                                                    <BatchesSection
                                                        batches={batches[set.aligner_set_id]}
                                                        onUpdateDays={updateDays}
                                                    />
                                                )}

                                                {/* Photos Section */}
                                                <div className="set-section">
                                                    <div className="section-header-row">
                                                        <h4>
                                                            <i className="fas fa-images"></i>
                                                            Photos
                                                        </h4>
                                                        <SetPhotoUpload
                                                            setId={set.aligner_set_id}
                                                            doctorId={doctor.dr_id}
                                                            onUploadComplete={() => loadPhotos(set.aligner_set_id)}
                                                        />
                                                    </div>
                                                    <SetPhotoGrid
                                                        photos={photos[set.aligner_set_id] || []}
                                                        onPhotoClick={(photo) => setSelectedPhoto(photo)}
                                                        onPhotoDelete={() => loadPhotos(set.aligner_set_id)}
                                                        doctorId={doctor.dr_id}
                                                    />
                                                </div>

                                                {/* Notes with EDITABLE Add Note */}
                                                <NotesSection
                                                    setId={set.aligner_set_id}
                                                    notes={notes[set.aligner_set_id] || []}
                                                    showAddNote={showAddNote[set.aligner_set_id]}
                                                    noteText={noteText}
                                                    doctorName={doctor.doctor_name}
                                                    onToggleAddNote={(show) => setShowAddNote(prev => ({ ...prev, [set.aligner_set_id]: show }))}
                                                    onNoteTextChange={setNoteText}
                                                    onAddNote={addNote}
                                                />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>

            {/* Fullscreen Photo Viewer */}
            {selectedPhoto && (
                <FullscreenImageViewer
                    photo={selectedPhoto}
                    onClose={() => setSelectedPhoto(null)}
                />
            )}
        </div>
    );
};

export default CaseDetail;
