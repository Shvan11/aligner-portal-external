/**
 * API Utility Functions
 * Shared data loading functions with proper TypeScript types
 */

import { supabase } from './supabase';
import type {
  AlignerSet,
  AlignerBatch,
  AlignerNote,
  AlignerSetPhoto,
  Work,
  Patient,
  WorkDataMap,
  NoteType,
} from '../types';

/**
 * Fetch all aligner sets for a doctor with related data
 */
export async function fetchAlignerSets(drId: number): Promise<AlignerSet[]> {
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
  return (data as AlignerSet[]) || [];
}

/**
 * Fetch work records by work IDs
 */
export async function fetchWorkRecords(workIds: number[]): Promise<Work[]> {
  if (!workIds || workIds.length === 0) return [];

  const { data, error } = await supabase
    .from('work')
    .select('work_id, person_id, type_of_work')
    .in('work_id', workIds);

  if (error) throw error;
  return (data as Work[]) || [];
}

/**
 * Fetch patient records by person IDs
 */
export async function fetchPatients(personIds: number[]): Promise<Patient[]> {
  if (!personIds || personIds.length === 0) return [];

  const { data, error } = await supabase
    .from('patients')
    .select('person_id, patient_name, first_name, last_name, phone')
    .in('person_id', personIds);

  if (error) throw error;
  return (data as Patient[]) || [];
}

/**
 * Fetch work and patient data for given work IDs
 * Returns combined work + patient data
 */
export async function fetchWorkWithPatients(workIds: number[]): Promise<WorkDataMap> {
  if (!workIds || workIds.length === 0) return {};

  // Get work records
  const workRecords = await fetchWorkRecords(workIds);

  // Get unique person_ids from work records
  const personIds = [...new Set(workRecords.map(w => w.person_id))];

  // Get patient records
  const patientRecords = await fetchPatients(personIds);

  // Create patient lookup map
  const patientMap: Record<number, Patient> = {};
  patientRecords.forEach(p => {
    patientMap[p.person_id] = p;
  });

  // Combine work and patient data
  const workData: WorkDataMap = {};
  workRecords.forEach(w => {
    workData[w.work_id] = {
      ...w,
      patients: patientMap[w.person_id] || null,
    };
  });

  return workData;
}

/**
 * Fetch batches for a specific aligner set
 */
export async function fetchBatches(setId: number): Promise<AlignerBatch[]> {
  const { data, error } = await supabase
    .from('aligner_batches')
    .select('*')
    .eq('aligner_set_id', setId)
    .order('batch_sequence', { ascending: true });

  if (error) throw error;
  return (data as AlignerBatch[]) || [];
}

/**
 * Fetch notes for a specific aligner set
 */
export async function fetchNotes(setId: number): Promise<AlignerNote[]> {
  const { data, error } = await supabase
    .from('aligner_notes')
    .select('*')
    .eq('aligner_set_id', setId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as AlignerNote[]) || [];
}

/**
 * Fetch photos for a specific aligner set (with presigned URLs from Edge Function)
 */
export async function fetchPhotos(setId: number): Promise<AlignerSetPhoto[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(
    `${supabaseUrl}/functions/v1/aligner-photo-get-urls?setId=${setId}`,
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to load photos');
  }

  const result = await response.json();
  return (result.photos as AlignerSetPhoto[]) || [];
}

/**
 * Add a note to an aligner set
 */
export async function createNote(
  setId: number,
  noteText: string,
  noteType: NoteType = 'Doctor'
): Promise<AlignerNote | null> {
  const { data, error } = await supabase
    .from('aligner_notes')
    .insert({
      aligner_set_id: setId,
      note_type: noteType,
      note_text: noteText.trim(),
      is_read: false,
    })
    .select();

  if (error) throw error;
  return (data?.[0] as AlignerNote) ?? null;
}

/**
 * Update days per aligner for a batch
 */
export async function updateBatchDays(batchId: number, days: number): Promise<void> {
  const { error } = await supabase
    .from('aligner_batches')
    .update({ days: parseInt(String(days), 10) })
    .eq('aligner_batch_id', batchId);

  if (error) throw error;
}

/**
 * Fetch work data by work ID
 */
export async function fetchWork(workId: number): Promise<Work | null> {
  const { data, error } = await supabase
    .from('work')
    .select('work_id, person_id, type_of_work')
    .eq('work_id', workId)
    .single();

  if (error) throw error;
  return data as Work | null;
}

/**
 * Fetch patient data by person ID
 */
export async function fetchPatient(personId: number): Promise<Patient | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('person_id, patient_name, first_name, last_name, phone')
    .eq('person_id', personId)
    .single();

  if (error) throw error;
  return data as Patient | null;
}

/**
 * Fetch sets for a specific work ID and doctor
 */
export async function fetchSetsForWork(
  workId: number,
  drId: number
): Promise<AlignerSet[]> {
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
  return (data as AlignerSet[]) || [];
}
