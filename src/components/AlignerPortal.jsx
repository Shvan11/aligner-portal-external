import React, { useState, useEffect } from 'react';
import { supabase, getDoctorEmail, formatDate, formatDateTime } from '../lib/supabase';

const AlignerPortal = () => {
    // State management
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [doctor, setDoctor] = useState(null);
    const [cases, setCases] = useState([]);
    const [selectedCase, setSelectedCase] = useState(null);
    const [sets, setSets] = useState([]);
    const [batches, setBatches] = useState({});
    const [notes, setNotes] = useState({});
    const [expandedSets, setExpandedSets] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddNote, setShowAddNote] = useState({});
    const [noteText, setNoteText] = useState('');

    // Logout via Cloudflare Access
    const handleLogout = () => {
        window.location.href = '/cdn-cgi/access/logout';
    };

    // Load doctor info on mount
    useEffect(() => {
        loadDoctorAuth();
    }, []);

    // Load doctor authentication
    const loadDoctorAuth = async () => {
        try {
            const email = getDoctorEmail();
            if (!email) {
                setError('No doctor email found. Add ?email=your@email.com to URL for testing');
                setLoading(false);
                return;
            }

            const { data, error: queryError } = await supabase
                .from('aligner_doctors')
                .select('*')
                .eq('doctor_email', email.toLowerCase())
                .single();

            if (queryError || !data) {
                console.error('Doctor query error:', queryError);
                setError(`Doctor not found: ${email}. Please contact administrator.`);
                setLoading(false);
                return;
            }

            setDoctor(data);
            await loadCases(data.dr_id);

        } catch (error) {
            console.error('Error loading doctor auth:', error);
            setError(`Failed to authenticate: ${error.message}. Please try again.`);
        } finally {
            setLoading(false);
        }
    };

    // Load all cases for this doctor
    const loadCases = async (drId) => {
        try {
            // Get all sets for this doctor with related data
            const { data: sets, error: queryError } = await supabase
                .from('aligner_sets')
                .select(`
                    *,
                    aligner_batches (
                        aligner_batch_id,
                        batch_sequence,
                        delivered_to_patient_date,
                        upper_aligner_count,
                        lower_aligner_count
                    ),
                    aligner_set_payments (
                        total_paid,
                        balance,
                        payment_status
                    )
                `)
                .eq('aligner_dr_id', drId)
                .order('creation_date', { ascending: false });

            if (queryError) throw queryError;

            // Get unique work IDs
            const workIds = [...new Set(sets?.map(s => s.work_id) || [])];

            // Load work and patient data separately (avoid ambiguous relationship by joining manually)
            let workData = {};
            if (workIds.length > 0) {
                console.log('Loading work data for work_ids:', workIds);

                // Get work records
                const { data: workRecords, error: workError } = await supabase
                    .from('work')
                    .select('work_id, person_id, type_of_work')
                    .in('work_id', workIds);

                if (workError) {
                    console.error('Error loading work data:', workError);
                }

                // Get unique person_ids from work records
                const personIds = [...new Set(workRecords?.map(w => w.person_id) || [])];

                // Get patient records
                const { data: patientRecords, error: patientError } = await supabase
                    .from('patients')
                    .select('person_id, patient_id, patient_name, first_name, last_name, phone')
                    .in('person_id', personIds);

                if (patientError) {
                    console.error('Error loading patient data:', patientError);
                }

                console.log('Loaded work records:', workRecords?.length, 'patient records:', patientRecords?.length);

                // Create patient lookup map
                const patientMap = {};
                patientRecords?.forEach(p => {
                    patientMap[p.person_id] = p;
                });

                // Combine work and patient data
                workRecords?.forEach(w => {
                    workData[w.work_id] = {
                        ...w,
                        patients: patientMap[w.person_id]
                    };
                });
            }
            console.log('Final workData:', workData);

            // Group by work_id to create cases
            const casesMap = {};
            sets?.forEach(set => {
                if (!casesMap[set.work_id]) {
                    const work = workData[set.work_id];
                    casesMap[set.work_id] = {
                        work_id: set.work_id,
                        patient: work?.patients,
                        type_of_work: work?.type_of_work,
                        sets: [],
                        total_sets: 0,
                        active_sets: 0,
                        active_set: null
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

        } catch (error) {
            console.error('Error loading cases:', error);
            console.error('Error details:', error.message, error.details);
            throw error; // Re-throw so parent catch can handle it
        }
    };

    // Load sets for a specific case
    const loadSets = async (workId) => {
        try {
            const { data, error: queryError } = await supabase
                .from('aligner_sets')
                .select(`
                    *,
                    aligner_batches (count),
                    aligner_set_payments (
                        total_paid,
                        balance,
                        payment_status
                    )
                `)
                .eq('work_id', workId)
                .eq('aligner_dr_id', doctor.dr_id)
                .order('set_sequence');

            if (queryError) throw queryError;

            setSets(data || []);

            // Auto-expand the active set
            const activeSet = data?.find(set => set.is_active);
            if (activeSet) {
                await loadBatches(activeSet.aligner_set_id);
                await loadNotes(activeSet.aligner_set_id);
                setExpandedSets(prev => ({ ...prev, [activeSet.aligner_set_id]: true }));
            }

        } catch (error) {
            console.error('Error loading sets:', error);
            alert('Failed to load aligner sets');
        }
    };

    // Load batches for a set
    const loadBatches = async (setId) => {
        try {
            const { data, error: queryError } = await supabase
                .from('aligner_batches')
                .select('*')
                .eq('aligner_set_id', setId)
                .order('batch_sequence');

            if (queryError) throw queryError;

            setBatches(prev => ({ ...prev, [setId]: data || [] }));

        } catch (error) {
            console.error('Error loading batches:', error);
            alert('Failed to load batches');
        }
    };

    // Load notes for a set
    const loadNotes = async (setId) => {
        try {
            const { data, error: queryError } = await supabase
                .from('aligner_notes')
                .select('*')
                .eq('aligner_set_id', setId)
                .order('created_at', { ascending: false });

            if (queryError) throw queryError;

            setNotes(prev => ({ ...prev, [setId]: data || [] }));

        } catch (error) {
            console.error('Error loading notes:', error);
            alert('Failed to load notes');
        }
    };

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
            setExpandedSets(prev => ({ ...prev, [setId]: true }));
        }
    };

    // Select a case to view details
    const selectCase = async (caseData) => {
        setSelectedCase(caseData);
        await loadSets(caseData.work_id);
    };

    // Go back to cases list
    const backToCases = () => {
        setSelectedCase(null);
        setSets([]);
        setBatches({});
        setNotes({});
        setExpandedSets({});
    };

    // Update days per aligner (EDITABLE!)
    const updateDays = async (batchId, newDays) => {
        try {
            const { error: updateError } = await supabase
                .from('aligner_batches')
                .update({ days: parseInt(newDays) })
                .eq('aligner_batch_id', batchId);

            if (updateError) throw updateError;

            // Reload batches to get updated values
            const batch = Object.values(batches)
                .flat()
                .find(b => b.aligner_batch_id === batchId);

            if (batch) {
                await loadBatches(batch.aligner_set_id);
            }

            alert('Days per aligner updated successfully');

        } catch (error) {
            console.error('Error updating days:', error);
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
            const { error: insertError } = await supabase
                .from('aligner_notes')
                .insert({
                    aligner_set_id: setId,
                    note_type: 'Doctor',
                    note_text: noteText.trim()
                });

            if (insertError) throw insertError;

            setNoteText('');
            setShowAddNote(prev => ({ ...prev, [setId]: false }));
            await loadNotes(setId);

        } catch (error) {
            console.error('Error adding note:', error);
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

    // Filter cases by search query
    const getFilteredCases = () => {
        if (!searchQuery.trim()) {
            return cases;
        }
        const query = searchQuery.toLowerCase();
        return cases.filter(c => {
            const workId = c.work_id.toString();
            const patientName = c.patient?.patient_name?.toLowerCase() || '';
            const patientId = c.patient?.patient_id?.toLowerCase() || '';
            const phone = c.patient?.phone?.toLowerCase() || '';

            return workId.includes(query) ||
                   patientName.includes(query) ||
                   patientId.includes(query) ||
                   phone.includes(query);
        });
    };

    // Get active cases count
    const getActiveCasesCount = () => cases.filter(c => c.active_sets > 0).length;

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
            {/* Header */}
            <header className="portal-header">
                <div className="portal-header-content">
                    <div className="portal-branding">
                        <i className="fas fa-tooth portal-logo"></i>
                        <div className="portal-title">
                            <h1>Shwan Aligner Portal</h1>
                            <div className="portal-subtitle">Doctor Access</div>
                        </div>
                    </div>
                    <div className="portal-doctor-info">
                        <span className="doctor-name">
                            <i className="fas fa-user-md"></i> Dr. {doctor?.doctor_name}
                        </span>
                        <button className="logout-btn" onClick={handleLogout}>
                            <i className="fas fa-sign-out-alt"></i>
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="portal-main">
                {!selectedCase ? (
                    /* Dashboard View - Cases List */
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
                                placeholder="Search by patient name, ID, phone, or work ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Cases Grid */}
                        {getFilteredCases().length === 0 ? (
                            <div className="empty-state">
                                <i className="fas fa-inbox"></i>
                                <h3>No cases found</h3>
                                <p>
                                    {searchQuery ? 'Try a different search term' : 'No aligner cases assigned yet'}
                                </p>
                            </div>
                        ) : (
                            <div className="cases-grid">
                                {getFilteredCases().map((caseData) => {
                                    const activeSet = caseData.active_set;
                                    const payment = activeSet?.aligner_set_payments?.[0];

                                    return (
                                        <div
                                            key={caseData.work_id}
                                            className="case-card"
                                            onClick={() => selectCase(caseData)}
                                        >
                                            <div className="case-header">
                                                <div className="case-patient-info">
                                                    <h3>{caseData.patient?.patient_name || `Work #${caseData.work_id}`}</h3>
                                                    {caseData.patient?.patient_id && (
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--portal-grey)', marginTop: '0.25rem' }}>
                                                            ID: {caseData.patient.patient_id}
                                                        </div>
                                                    )}
                                                </div>
                                                {caseData.active_sets > 0 ? (
                                                    <span className="case-active-badge">Active</span>
                                                ) : (
                                                    <span className="case-inactive-badge">Completed</span>
                                                )}
                                            </div>

                                            {/* Active Set Info */}
                                            {activeSet && (
                                                <div className="case-active-set-info">
                                                    <div className="active-set-header">
                                                        <i className="fas fa-layer-group"></i>
                                                        <strong>Active Set Info</strong>
                                                    </div>
                                                    <div className="active-set-details">
                                                        <span><i className="fas fa-hashtag"></i> Set #{activeSet.set_sequence || '?'}</span>
                                                        <span><i className="fas fa-teeth"></i> {activeSet.upper_aligners_count || 0}U / {activeSet.lower_aligners_count || 0}L</span>
                                                        <span><i className="fas fa-box-open"></i> Remaining: {activeSet.remaining_upper_aligners || 0}U / {activeSet.remaining_lower_aligners || 0}L</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Payment Summary */}
                                            {payment && (
                                                <div className="case-payment-summary">
                                                    <div className="case-payment-item">
                                                        <div className="case-payment-label">Total Required</div>
                                                        <div className="case-payment-value">{activeSet.set_cost || 0} {activeSet.currency || 'USD'}</div>
                                                    </div>
                                                    <div className="case-payment-divider"></div>
                                                    <div className="case-payment-item">
                                                        <div className="case-payment-label">Total Paid</div>
                                                        <div className="case-payment-value paid">{payment.total_paid || 0} {activeSet.currency || 'USD'}</div>
                                                    </div>
                                                    <div className="case-payment-divider"></div>
                                                    <div className="case-payment-item">
                                                        <div className="case-payment-label">Balance</div>
                                                        <div className="case-payment-value balance">{payment.balance || 0} {activeSet.currency || 'USD'}</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* URLs for Active Set */}
                                            {(activeSet?.set_url || activeSet?.set_pdf_url) && (
                                                <div className="case-urls">
                                                    {activeSet.set_url && (
                                                        <a
                                                            href={activeSet.set_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="case-url-btn"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <i className="fas fa-link"></i>
                                                            Setup URL
                                                        </a>
                                                    )}
                                                    {activeSet.set_pdf_url && (
                                                        <a
                                                            href={activeSet.set_pdf_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="case-url-btn pdf"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <i className="fas fa-file-pdf"></i>
                                                            View PDF
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            <div className="case-stats">
                                                <div className="case-stat">
                                                    <div className="case-stat-value">{caseData.total_sets}</div>
                                                    <div className="case-stat-label">Sets</div>
                                                </div>
                                                <div className="case-stat">
                                                    <div className="case-stat-value" style={{ color: 'var(--portal-success)' }}>
                                                        {caseData.active_sets}
                                                    </div>
                                                    <div className="case-stat-label">Active</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                ) : (
                    /* Case Detail View */
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
                                                        <div className="payment-summary-value">{set.set_cost || 0} {set.currency || 'USD'}</div>
                                                    </div>
                                                    <div className="payment-summary-divider"></div>
                                                    <div className="payment-summary-item">
                                                        <div className="payment-summary-label">Total Paid</div>
                                                        <div className="payment-summary-value paid">{payment.total_paid || 0} {set.currency || 'USD'}</div>
                                                    </div>
                                                    <div className="payment-summary-divider"></div>
                                                    <div className="payment-summary-item">
                                                        <div className="payment-summary-label">Balance</div>
                                                        <div className="payment-summary-value balance">{payment.balance || 0} {set.currency || 'USD'}</div>
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
                                                            formatDate={formatDate}
                                                        />
                                                    )}

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
                                                        formatDateTime={formatDateTime}
                                                    />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

// Batches Section Component with EDITABLE Days
const BatchesSection = ({ batches, onUpdateDays, formatDate }) => {
    const [editingDays, setEditingDays] = useState({});
    const [daysValues, setDaysValues] = useState({});

    const handleStartEdit = (batchId, currentDays) => {
        setEditingDays(prev => ({ ...prev, [batchId]: true }));
        setDaysValues(prev => ({ ...prev, [batchId]: currentDays || '' }));
    };

    const handleSave = async (batchId) => {
        const newDays = parseInt(daysValues[batchId]);
        if (isNaN(newDays) || newDays < 1) {
            alert('Please enter a valid number of days (minimum 1)');
            return;
        }

        await onUpdateDays(batchId, newDays);
        setEditingDays(prev => ({ ...prev, [batchId]: false }));
    };

    const handleCancel = (batchId) => {
        setEditingDays(prev => ({ ...prev, [batchId]: false }));
        setDaysValues(prev => ({ ...prev, [batchId]: '' }));
    };

    return (
        <div className="batches-section">
            <h4>Batches</h4>
            {batches.map((batch) => {
                const isDelivered = batch.delivered_to_patient_date !== null;

                return (
                    <div key={batch.aligner_batch_id} className={`batch-card ${isDelivered ? 'delivered' : ''}`}>
                        <div className="batch-header">
                            <div className="batch-title">Batch #{batch.batch_sequence}</div>
                            <span className={`batch-status ${isDelivered ? 'delivered' : 'pending'}`}>
                                {isDelivered ? 'Delivered' : 'Pending'}
                            </span>
                        </div>

                        <div className="batch-info-grid">
                            <div className="batch-info-item">
                                <i className="fas fa-teeth"></i>
                                Upper: {batch.upper_aligner_start_sequence}-{batch.upper_aligner_end_sequence} ({batch.upper_aligner_count})
                            </div>
                            <div className="batch-info-item">
                                <i className="fas fa-teeth"></i>
                                Lower: {batch.lower_aligner_start_sequence}-{batch.lower_aligner_end_sequence} ({batch.lower_aligner_count})
                            </div>
                            <div className="batch-info-item">
                                <i className="fas fa-industry"></i>
                                Manufactured: {formatDate(batch.manufacture_date)}
                            </div>
                            {isDelivered && (
                                <div className="batch-info-item">
                                    <i className="fas fa-truck"></i>
                                    Delivered: {formatDate(batch.delivered_to_patient_date)}
                                </div>
                            )}
                            <div className="batch-info-item">
                                <i className="fas fa-clock"></i>
                                <span>Days per Aligner: </span>
                                {editingDays[batch.aligner_batch_id] ? (
                                    <div className="days-editor">
                                        <input
                                            type="number"
                                            className="days-input"
                                            value={daysValues[batch.aligner_batch_id]}
                                            onChange={(e) => setDaysValues(prev => ({
                                                ...prev,
                                                [batch.aligner_batch_id]: e.target.value
                                            }))}
                                            min="1"
                                        />
                                        <button
                                            className="days-save-btn"
                                            onClick={() => handleSave(batch.aligner_batch_id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            className="btn-cancel"
                                            onClick={() => handleCancel(batch.aligner_batch_id)}
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <strong>{batch.days || 'N/A'}</strong>
                                        <button
                                            onClick={() => handleStartEdit(batch.aligner_batch_id, batch.days)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--portal-primary)',
                                                cursor: 'pointer',
                                                marginLeft: '0.5rem'
                                            }}
                                        >
                                            <i className="fas fa-edit"></i>
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="batch-info-item">
                                <i className="fas fa-hourglass-half"></i>
                                Validity: {batch.validity_period || 'N/A'} days
                            </div>
                            {batch.next_batch_ready_date && (
                                <div className="batch-info-item">
                                    <i className="fas fa-calendar-check"></i>
                                    Next Batch: {formatDate(batch.next_batch_ready_date)}
                                </div>
                            )}
                        </div>

                        {batch.notes && (
                            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--portal-grey)' }}>
                                <i className="fas fa-sticky-note"></i> {batch.notes}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// Notes Section Component with EDITABLE Add Note
const NotesSection = ({
    setId,
    notes,
    showAddNote,
    noteText,
    doctorName,
    onToggleAddNote,
    onNoteTextChange,
    onAddNote,
    formatDateTime
}) => {
    return (
        <div className="notes-section">
            <div className="notes-header">
                <h3>Communication</h3>
                {!showAddNote && (
                    <button className="btn-add-note" onClick={() => onToggleAddNote(true)}>
                        <i className="fas fa-plus"></i>
                        Add Note
                    </button>
                )}
            </div>

            {showAddNote && (
                <div className="add-note-form">
                    <textarea
                        className="note-textarea"
                        placeholder="Type your message to the lab..."
                        value={noteText}
                        onChange={(e) => onNoteTextChange(e.target.value)}
                    />
                    <div className="note-form-actions">
                        <button className="btn-cancel" onClick={() => onToggleAddNote(false)}>
                            Cancel
                        </button>
                        <button className="btn-submit" onClick={() => onAddNote(setId)}>
                            <i className="fas fa-paper-plane"></i>
                            Send Note
                        </button>
                    </div>
                </div>
            )}

            <div className="notes-timeline">
                {notes.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                        <i className="fas fa-comments"></i>
                        <p>No messages yet</p>
                    </div>
                ) : (
                    notes.map((note) => (
                        <div key={note.note_id} className={`note-item ${note.note_type === 'Lab' ? 'lab-note' : ''}`}>
                            <div className="note-header-row">
                                <div className={`note-author ${note.note_type === 'Lab' ? 'lab' : ''}`}>
                                    <i className={note.note_type === 'Lab' ? 'fas fa-flask' : 'fas fa-user-md'}></i>
                                    {note.note_type === 'Lab' ? 'Shwan Lab' : `Dr. ${doctorName}`}
                                </div>
                                <div className="note-date">
                                    {formatDateTime(note.created_at)}
                                    {note.is_edited && ' (edited)'}
                                </div>
                            </div>
                            <p className="note-text">{note.note_text}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default AlignerPortal;
