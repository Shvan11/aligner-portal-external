import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const AdminDoctorSelector = ({ onDoctorSelect }) => {
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDoctorId, setSelectedDoctorId] = useState(null);

    useEffect(() => {
        loadDoctors();
        // Check for previously selected doctor in sessionStorage
        const savedDoctorId = sessionStorage.getItem('admin_impersonated_doctor_id');
        if (savedDoctorId) {
            setSelectedDoctorId(parseInt(savedDoctorId));
        }
    }, []);

    const loadDoctors = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('aligner_doctors')
                .select('dr_id, doctor_name, doctor_email')
                .neq('doctor_email', 'shwan.orthodontics@gmail.com') // Exclude admin
                .order('doctor_name');

            if (error) throw error;
            setDoctors(data || []);
        } catch (error) {
            // Error loading doctors
        } finally {
            setLoading(false);
        }
    };

    const handleDoctorChange = (e) => {
        const drId = parseInt(e.target.value);
        if (!drId) {
            setSelectedDoctorId(null);
            sessionStorage.removeItem('admin_impersonated_doctor_id');
            onDoctorSelect(null);
            return;
        }

        const doctor = doctors.find(d => d.dr_id === drId);
        setSelectedDoctorId(drId);
        sessionStorage.setItem('admin_impersonated_doctor_id', drId.toString());
        onDoctorSelect(doctor);
    };

    if (loading) {
        return (
            <div className="admin-selector-loading">
                <div className="spinner"></div>
                <p>Loading doctors...</p>
            </div>
        );
    }

    return (
        <div className="admin-doctor-selector">
            <div className="admin-header">
                <div className="admin-title">
                    <i className="fas fa-user-shield"></i>
                    <h2>Admin Mode</h2>
                </div>
                <p className="admin-description">
                    Select a doctor to view their aligner cases and portal access
                </p>
            </div>

            <div className="doctor-selector-container">
                <label htmlFor="doctor-select" className="selector-label">
                    <i className="fas fa-user-md"></i>
                    Select Doctor:
                </label>
                <select
                    id="doctor-select"
                    className="doctor-select"
                    value={selectedDoctorId || ''}
                    onChange={handleDoctorChange}
                >
                    <option value="">-- Choose a doctor --</option>
                    {doctors.map(doctor => (
                        <option key={doctor.dr_id} value={doctor.dr_id}>
                            {doctor.doctor_name} ({doctor.doctor_email || 'No email'})
                        </option>
                    ))}
                </select>
            </div>

            {doctors.length === 0 && (
                <div className="empty-state" style={{ marginTop: '2rem' }}>
                    <i className="fas fa-users"></i>
                    <p>No doctors found in the system</p>
                </div>
            )}
        </div>
    );
};

export default AdminDoctorSelector;
