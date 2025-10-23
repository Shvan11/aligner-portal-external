// Dashboard.jsx - External Portal Dashboard with React Router
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, getDoctorEmail, isAdmin, getImpersonatedDoctorId } from '../lib/supabase';
import PortalHeader from '../components/shared/PortalHeader';
import AnnouncementBanner from '../components/shared/AnnouncementBanner';
import AdminDoctorSelector from '../components/shared/AdminDoctorSelector';

const Dashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [doctor, setDoctor] = useState(null);
    const [cases, setCases] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [adminEmail, setAdminEmail] = useState(null);
    const [impersonatedDoctor, setImpersonatedDoctor] = useState(null);

    // Load doctor info on mount
    useEffect(() => {
        loadDoctorAuth();
    }, []);

    // Load doctor authentication
    const loadDoctorAuth = async () => {
        try {
            // Get doctor email from Cloudflare Access JWT or URL parameter
            const email = getDoctorEmail();

            if (!email) {
                setError('Authentication failed. No email found.\n\n' +
                         'Production: Ensure Cloudflare Access is configured and you are authenticated.\n' +
                         'Testing: Add ?email=your@email.com to the URL');
                setLoading(false);
                return;
            }

            console.log('🔐 Authenticating doctor:', email);

            // Check if admin
            if (isAdmin(email)) {
                console.log('👑 Admin logged in');
                setAdminEmail(email);

                // Check if admin has previously selected a doctor to impersonate
                const impersonatedDrId = getImpersonatedDoctorId();
                if (impersonatedDrId) {
                    // Load the impersonated doctor
                    const { data: impersonatedDoc, error: impError } = await supabase
                        .from('aligner_doctors')
                        .select('*')
                        .eq('dr_id', impersonatedDrId)
                        .single();

                    if (!impError && impersonatedDoc) {
                        console.log('🎭 Restoring impersonation for:', impersonatedDoc.doctor_name);
                        setImpersonatedDoctor(impersonatedDoc);
                        setDoctor(impersonatedDoc);
                        await loadCases(impersonatedDoc.dr_id);
                    }
                }

                setLoading(false);
                return;
            }

            // Regular doctor authentication
            const { data, error: queryError } = await supabase
                .from('aligner_doctors')
                .select('*')
                .eq('doctor_email', email.toLowerCase())
                .single();

            if (queryError || !data) {
                console.error('Doctor query error:', queryError);
                setError(`Doctor not found: ${email}.\n\nPlease contact administrator to add your email to the system.`);
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

    // Handle admin doctor selection
    const handleAdminDoctorSelect = async (selectedDoctor) => {
        if (!selectedDoctor) {
            setImpersonatedDoctor(null);
            setDoctor(null);
            setCases([]);
            return;
        }

        console.log('🎭 Admin impersonating:', selectedDoctor.doctor_name);
        setImpersonatedDoctor(selectedDoctor);
        setDoctor(selectedDoctor);
        setLoading(true);
        try {
            await loadCases(selectedDoctor.dr_id);
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

    // Navigate to case detail
    const selectCase = (caseData) => {
        navigate(`/case/${caseData.work_id}`);
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

    // Logout handler
    const handleLogout = () => {
        window.location.href = '/cdn-cgi/access/logout';
    };

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
            <PortalHeader doctor={doctor} isAdmin={!!adminEmail} impersonatedDoctor={impersonatedDoctor} />
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
                            <span>Admin View - Viewing as: <strong>Dr. {impersonatedDoctor.doctor_name}</strong></span>
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
                                    {activeSet && (
                                        <div className="case-payment-summary">
                                            <div className="case-payment-item">
                                                <div className="case-payment-label">Total Required</div>
                                                <div className="case-payment-value">{activeSet.set_cost !== null && activeSet.set_cost !== undefined ? activeSet.set_cost : 0} {activeSet.currency || 'USD'}</div>
                                            </div>
                                            <div className="case-payment-divider"></div>
                                            <div className="case-payment-item">
                                                <div className="case-payment-label">Total Paid</div>
                                                <div className="case-payment-value paid">{payment?.total_paid !== null && payment?.total_paid !== undefined ? payment.total_paid : 0} {activeSet.currency || 'USD'}</div>
                                            </div>
                                            <div className="case-payment-divider"></div>
                                            <div className="case-payment-item">
                                                <div className="case-payment-label">Balance</div>
                                                <div className="case-payment-value balance">{payment?.balance !== null && payment?.balance !== undefined ? payment.balance : (activeSet.set_cost !== null && activeSet.set_cost !== undefined ? activeSet.set_cost : 0)} {activeSet.currency || 'USD'}</div>
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
            )}
            </main>
        </div>
    );
};

export default Dashboard;
