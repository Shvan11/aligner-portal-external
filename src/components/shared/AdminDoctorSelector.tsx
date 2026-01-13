/**
 * AdminDoctorSelector - Admin doctor impersonation selector
 */

import React, { useState, useEffect, type ChangeEvent } from 'react';
import { supabase } from '../../lib/supabase';
import type { AdminDoctorSelectorProps, AlignerDoctorMinimal } from '../../types';

const AdminDoctorSelector: React.FC<AdminDoctorSelectorProps> = ({ onDoctorSelect }) => {
  const [doctors, setDoctors] = useState<AlignerDoctorMinimal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);

  useEffect(() => {
    loadDoctors();
    // Check for previously selected doctor in sessionStorage
    const savedDoctorId = sessionStorage.getItem('admin_impersonated_doctor_id');
    if (savedDoctorId) {
      setSelectedDoctorId(parseInt(savedDoctorId, 10));
    }
  }, []);

  const loadDoctors = async (): Promise<void> => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('aligner_doctors')
        .select('dr_id, doctor_name, doctor_email')
        .neq('doctor_email', 'shwan.orthodontics@gmail.com') // Exclude admin
        .order('doctor_name');

      if (error) throw error;
      setDoctors((data as AlignerDoctorMinimal[]) || []);
    } catch {
      // Error loading doctors
    } finally {
      setLoading(false);
    }
  };

  const handleDoctorChange = (e: ChangeEvent<HTMLSelectElement>): void => {
    const drId = parseInt(e.target.value, 10);
    if (!drId) {
      setSelectedDoctorId(null);
      sessionStorage.removeItem('admin_impersonated_doctor_id');
      onDoctorSelect(null);
      return;
    }

    const doctor = doctors.find(d => d.dr_id === drId);
    setSelectedDoctorId(drId);
    sessionStorage.setItem('admin_impersonated_doctor_id', drId.toString());
    onDoctorSelect(doctor || null);
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
