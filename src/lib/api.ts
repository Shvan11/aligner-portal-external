/**
 * API Utility Functions
 * Shared data loading functions with proper TypeScript types
 *
 * Reads target the RAW Supabase mirror (snake_case clinic schema) under RLS,
 * scoped to the doctor by the minted JWT (see lib/supabase.ts). PostgREST
 * resource-embedding is intentionally NOT used — the mirror has no FK
 * constraints (the failover sink upserts coalesced changes without guaranteeing
 * parent-before-child order), so we fetch related tables separately and join in
 * JS. Writes are disabled in Phase 1 (the mirror is read-only for the portal).
 */

import { supabase } from './supabase';
import type {
  AlignerSet,
  AlignerSetWithDetails,
  AlignerBatch,
  AlignerNote,
  Work,
  Patient,
  WorkDataMap,
  NoteType,
} from '../types';

// =============================================================================
// CACHE UTILITIES
// =============================================================================

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

function getCached<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    const entry: CacheEntry<T> = JSON.parse(cached);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Storage full or unavailable - ignore
  }
}

export function clearDashboardCache(drId?: number): void {
  if (drId) {
    sessionStorage.removeItem(`dashboard_cases_${drId}`);
  } else {
    // Clear all dashboard caches
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith('dashboard_cases_')) {
        sessionStorage.removeItem(key);
      }
    }
  }
}

// =============================================================================
// SHARED HELPERS
// =============================================================================

/**
 * Fetch all batches for a list of set ids and group them by aligner_set_id.
 * One query replaces the old per-set embedded `aligner_batches(...)` select.
 */
async function fetchBatchesForSets(
  setIds: number[]
): Promise<Record<number, AlignerBatch[]>> {
  const map: Record<number, AlignerBatch[]> = {};
  if (setIds.length === 0) return map;

  const { data, error } = await supabase
    .from('aligner_batches')
    .select('*')
    .in('aligner_set_id', setIds)
    .order('batch_sequence', { ascending: true });

  if (error) throw error;

  (data as AlignerBatch[] | null)?.forEach((batch) => {
    (map[batch.aligner_set_id] ||= []).push(batch);
  });
  return map;
}

// =============================================================================
// WORK + PATIENT LOOKUPS
// =============================================================================

/**
 * Fetch work records by work IDs
 */
export async function fetchWorkRecords(workIds: number[]): Promise<Work[]> {
  if (!workIds || workIds.length === 0) return [];

  const { data, error } = await supabase
    .from('works')
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
  const personIds = [...new Set(workRecords.map((w) => w.person_id))];

  // Get patient records
  const patientRecords = await fetchPatients(personIds);

  // Create patient lookup map
  const patientMap: Record<number, Patient> = {};
  patientRecords.forEach((p) => {
    patientMap[p.person_id] = p;
  });

  // Combine work and patient data
  const workData: WorkDataMap = {};
  workRecords.forEach((w) => {
    workData[w.work_id] = {
      ...w,
      patients: patientMap[w.person_id] || null,
    };
  });

  return workData;
}

/**
 * Fetch work data by work ID
 */
export async function fetchWork(workId: number): Promise<Work | null> {
  const { data, error } = await supabase
    .from('works')
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

// =============================================================================
// DASHBOARD API
// =============================================================================

/**
 * Fetch all aligner sets for a doctor with work + patient + batches attached.
 * Sets are read by aligner_dr_id; related works/patients/batches are fetched
 * separately and joined in JS (no PostgREST embedding).
 */
export async function fetchAlignerSetsWithDetails(
  drId: number,
  useCache = true
): Promise<AlignerSetWithDetails[]> {
  const cacheKey = `dashboard_cases_${drId}`;

  if (useCache) {
    const cached = getCached<AlignerSetWithDetails[]>(cacheKey);
    if (cached) return cached;
  }

  const { data, error } = await supabase
    .from('aligner_sets')
    .select('*')
    .eq('aligner_dr_id', drId)
    .order('creation_date', { ascending: false });

  if (error) throw error;
  const sets = (data as AlignerSet[]) || [];

  const workIds = [...new Set(sets.map((s) => s.work_id))];
  const setIds = sets.map((s) => s.aligner_set_id);
  const [workMap, batchMap] = await Promise.all([
    fetchWorkWithPatients(workIds),
    fetchBatchesForSets(setIds),
  ]);

  const result: AlignerSetWithDetails[] = sets.map((set) => {
    const work = workMap[set.work_id];
    return {
      ...set,
      aligner_batches: batchMap[set.aligner_set_id] || [],
      work: {
        work_id: set.work_id,
        type_of_work: work?.type_of_work ?? null,
        patients: work?.patients ?? null,
      },
    };
  });

  setCache(cacheKey, result);
  return result;
}

/**
 * Fetch all aligner sets for a doctor with batches attached.
 * @deprecated Use fetchAlignerSetsWithDetails for Dashboard
 */
export async function fetchAlignerSets(drId: number): Promise<AlignerSet[]> {
  const { data, error } = await supabase
    .from('aligner_sets')
    .select('*')
    .eq('aligner_dr_id', drId)
    .order('creation_date', { ascending: false });

  if (error) throw error;
  const sets = (data as AlignerSet[]) || [];

  const batchMap = await fetchBatchesForSets(sets.map((s) => s.aligner_set_id));
  return sets.map((set) => ({
    ...set,
    aligner_batches: batchMap[set.aligner_set_id] || [],
  }));
}

/**
 * Fetch sets for a specific work ID and doctor, with batches attached.
 */
export async function fetchSetsForWork(
  workId: number,
  drId: number
): Promise<AlignerSet[]> {
  const { data, error } = await supabase
    .from('aligner_sets')
    .select('*')
    .eq('work_id', workId)
    .eq('aligner_dr_id', drId)
    .order('set_sequence', { ascending: true });

  if (error) throw error;
  const sets = (data as AlignerSet[]) || [];

  const batchMap = await fetchBatchesForSets(sets.map((s) => s.aligner_set_id));
  return sets.map((set) => ({
    ...set,
    aligner_batches: batchMap[set.aligner_set_id] || [],
  }));
}

// =============================================================================
// BATCHES / NOTES
// =============================================================================

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

// =============================================================================
// WRITES — disabled in Phase 1
//
// The portal reads a read-only RLS mirror; direct writes would be overwritten by
// the next forward sync and never reach the source of truth. Doctor-scoped write
// endpoints on the main app land in Phase 2. These throw if invoked so a stray
// call surfaces loudly rather than silently no-op'ing.
// =============================================================================

const WRITES_DISABLED_MESSAGE =
  'Editing is temporarily unavailable while the portal is being updated.';

/**
 * Add a note to an aligner set (Phase 2).
 */
export async function createNote(
  _setId: number,
  _noteText: string,
  _noteType: NoteType = 'Doctor'
): Promise<AlignerNote | null> {
  throw new Error(WRITES_DISABLED_MESSAGE);
}

/**
 * Update days per aligner for a batch (Phase 2).
 */
export async function updateBatchDays(_batchId: number, _days: number): Promise<void> {
  throw new Error(WRITES_DISABLED_MESSAGE);
}

// =============================================================================
// CASE DETAIL API
// =============================================================================

/**
 * Combined case detail response type
 */
export interface CaseDetailData {
  work: Work & { patients: Patient | null };
  sets: AlignerSetWithBatches[];
}

/**
 * Aligner set with full batches data
 */
export interface AlignerSetWithBatches extends AlignerSet {
  aligner_batches: AlignerBatch[];
}

/**
 * Fetch complete case detail: work + patient + sets + batches for a doctor.
 * Sets are read by work_id + aligner_dr_id; work/patient/batches are fetched
 * separately and joined in JS.
 */
export async function fetchCaseDetail(
  workId: number,
  drId: number
): Promise<CaseDetailData | null> {
  const { data, error } = await supabase
    .from('aligner_sets')
    .select('*')
    .eq('work_id', workId)
    .eq('aligner_dr_id', drId)
    .order('set_sequence', { ascending: true });

  if (error) throw error;
  const sets = (data as AlignerSet[]) || [];
  if (sets.length === 0) return null;

  const workMap = await fetchWorkWithPatients([workId]);
  const work = workMap[workId];
  if (!work) return null; // preserves the old INNER-join behaviour

  const batchMap = await fetchBatchesForSets(sets.map((s) => s.aligner_set_id));
  const setsWithBatches: AlignerSetWithBatches[] = sets.map((set) => ({
    ...set,
    aligner_batches: batchMap[set.aligner_set_id] || [],
  }));

  return {
    work: { ...work, patients: work.patients ?? null },
    sets: setsWithBatches,
  };
}
