/**
 * API Utility Functions
 * Shared data loading functions to eliminate code duplication
 */

import { supabase } from './supabase';

/**
 * Fetch all aligner sets for a doctor with related data
 * @param {number} drId - Doctor ID
 * @returns {Promise<Array>} Array of aligner sets
 */
export async function fetchAlignerSets(drId) {
  const { data, error } = await supabase
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

  if (error) throw error;
  return data || [];
}

/**
 * Fetch work records by work IDs
 * @param {Array<number>} workIds - Array of work IDs
 * @returns {Promise<Array>} Array of work records
 */
export async function fetchWorkRecords(workIds) {
  if (!workIds || workIds.length === 0) return [];

  const { data, error } = await supabase
    .from('work')
    .select('work_id, person_id, type_of_work')
    .in('work_id', workIds);

  if (error) throw error;
  return data || [];
}

/**
 * Fetch patient records by person IDs
 * @param {Array<number>} personIds - Array of person IDs
 * @returns {Promise<Array>} Array of patient records
 */
export async function fetchPatients(personIds) {
  if (!personIds || personIds.length === 0) return [];

  const { data, error } = await supabase
    .from('patients')
    .select('person_id, patient_id, patient_name, first_name, last_name, phone')
    .in('person_id', personIds);

  if (error) throw error;
  return data || [];
}

/**
 * Fetch work and patient data for given work IDs
 * Returns combined work + patient data
 * @param {Array<number>} workIds - Array of work IDs
 * @returns {Promise<Object>} Object keyed by work_id with combined work/patient data
 */
export async function fetchWorkWithPatients(workIds) {
  if (!workIds || workIds.length === 0) return {};

  // Get work records
  const workRecords = await fetchWorkRecords(workIds);

  // Get unique person_ids from work records
  const personIds = [...new Set(workRecords.map(w => w.person_id))];

  // Get patient records
  const patientRecords = await fetchPatients(personIds);

  // Create patient lookup map
  const patientMap = {};
  patientRecords.forEach(p => {
    patientMap[p.person_id] = p;
  });

  // Combine work and patient data
  const workData = {};
  workRecords.forEach(w => {
    workData[w.work_id] = {
      ...w,
      patients: patientMap[w.person_id]
    };
  });

  return workData;
}

/**
 * Fetch batches for a specific aligner set
 * @param {number} setId - Aligner set ID
 * @returns {Promise<Array>} Array of batches
 */
export async function fetchBatches(setId) {
  const { data, error } = await supabase
    .from('aligner_batches')
    .select('*')
    .eq('aligner_set_id', setId)
    .order('batch_sequence', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch notes for a specific aligner set
 * @param {number} setId - Aligner set ID
 * @returns {Promise<Array>} Array of notes
 */
export async function fetchNotes(setId) {
  const { data, error } = await supabase
    .from('aligner_notes')
    .select('*')
    .eq('aligner_set_id', setId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Fetch photos for a specific aligner set (with presigned URLs from Edge Function)
 * @param {number} setId - Aligner set ID
 * @returns {Promise<Array>} Array of photos with presigned URLs
 */
export async function fetchPhotos(setId) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/aligner-photo-get-urls?setId=${setId}`, {
    headers: {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to load photos');
  }

  const result = await response.json();
  return result.photos || [];
}

/**
 * Add a note to an aligner set
 * @param {number} setId - Aligner set ID
 * @param {string} noteText - Note text content
 * @param {string} noteType - Note type (e.g., 'Doctor')
 * @returns {Promise<Object>} Created note object
 */
export async function createNote(setId, noteText, noteType = 'Doctor') {
  const { data, error } = await supabase
    .from('aligner_notes')
    .insert({
      aligner_set_id: setId,
      note_type: noteType,
      note_text: noteText.trim(),
      is_read: false
    })
    .select();

  if (error) throw error;
  return data?.[0];
}

/**
 * Update days per aligner for a batch
 * @param {number} batchId - Batch ID
 * @param {number} days - Number of days
 * @returns {Promise<void>}
 */
export async function updateBatchDays(batchId, days) {
  const { error } = await supabase
    .from('aligner_batches')
    .update({ days: parseInt(days) })
    .eq('aligner_batch_id', batchId);

  if (error) throw error;
}

/**
 * Fetch work data by work ID
 * @param {number} workId - Work ID
 * @returns {Promise<Object>} Work record
 */
export async function fetchWork(workId) {
  const { data, error } = await supabase
    .from('work')
    .select('work_id, person_id, type_of_work')
    .eq('work_id', workId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch patient data by person ID
 * @param {number} personId - Person ID
 * @returns {Promise<Object>} Patient record
 */
export async function fetchPatient(personId) {
  const { data, error } = await supabase
    .from('patients')
    .select('person_id, patient_id, patient_name, first_name, last_name, phone')
    .eq('person_id', personId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Fetch sets for a specific work ID and doctor
 * @param {number} workId - Work ID
 * @param {number} drId - Doctor ID
 * @returns {Promise<Array>} Array of aligner sets
 */
export async function fetchSetsForWork(workId, drId) {
  const { data, error } = await supabase
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
    .eq('aligner_dr_id', drId)
    .order('set_sequence', { ascending: true });

  if (error) throw error;
  return data || [];
}
