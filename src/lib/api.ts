/**
 * API Utility Functions
 * Shared data loading functions with proper TypeScript types
 *
 * Reads target the RAW Supabase mirror (snake_case clinic schema) under RLS,
 * scoped to the doctor by the minted JWT (see lib/supabase.ts). PostgREST
 * resource-embedding is intentionally NOT used — the mirror has no FK
 * constraints (the failover sink upserts coalesced changes without guaranteeing
 * parent-before-child order), so we fetch related tables separately and join in
 * JS. Phase 2 enables two doctor writes (add note, change batch days) directly on
 * the mirror; reverse-sync CDC carries them home to local Postgres (see the WRITES
 * section below and sql/phase2-writes.sql).
 */

import { supabase, supabaseAnonKey, getPortalToken } from './supabase';
import type {
  AlignerSet,
  AlignerSetWithDetails,
  AlignerBatch,
  AlignerNote,
  AlignerSetPhoto,
  PhotoUploadUrlResponse,
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
// WRITES — Phase 2 (mirror writes carried back to local by reverse-sync CDC)
//
// aligner_notes and aligner_batches both carry `updated_at`, so they are in the
// reverse-sync set: a doctor's edit here is captured into change_log('reverse') on
// Supabase and applied to the clinic's local Postgres (the source of truth) under
// whole-row LWW. RLS + column-level grants (sql/phase2-writes.sql) constrain the
// portal to exactly two writes — adding a 'Doctor' note, and changing a batch's
// `days` — each scoped to the authenticated doctor's own rows. No clinic
// home-server round-trip: the write lands in Supabase and drains home when the
// reverse sink next runs (queued through an outage, never lost).
// =============================================================================

/**
 * Add a 'Doctor' note to an aligner set. Inserts under the dr_id-scoped JWT; RLS
 * forces note_type='Doctor', is_read=false, and the doctor's own set. is_read MUST
 * be sent explicitly: the column's DB default is TRUE, so omitting it would mark
 * the note pre-read and the lab's unread badge would never fire (the RLS policy
 * rejects anything but false, so this can't regress silently). Returns the
 * inserted row (with its mirror-side note_id).
 */
export async function createNote(
  setId: number,
  noteText: string,
  noteType: NoteType = 'Doctor'
): Promise<AlignerNote | null> {
  const text = noteText.trim();
  if (!setId || !text) {
    throw new Error('Set ID and note text are required');
  }

  const { data, error } = await supabase
    .from('aligner_notes')
    .insert({ aligner_set_id: setId, note_type: noteType, note_text: text, is_read: false })
    .select('*')
    .single();

  if (error) throw error;
  return (data as AlignerNote) ?? null;
}

/**
 * Update "days per aligner" for a batch. The column-level grant + RLS policy allow
 * the authenticated doctor to change ONLY `days`, and only on their own batches.
 */
export async function updateBatchDays(batchId: number, days: number): Promise<void> {
  if (!batchId) {
    throw new Error('Batch ID is required');
  }
  if (!Number.isFinite(days) || days < 0) {
    throw new Error('Days must be a non-negative number');
  }

  const { data, error } = await supabase
    .from('aligner_batches')
    .update({ days: Math.trunc(days) })
    .eq('aligner_batch_id', batchId)
    .select('aligner_batch_id');

  if (error) throw error;
  // An update matching zero rows (RLS filtered it out, or the id is stale) is
  // not an error from Supabase's perspective, so without checking `data` the
  // caller would show a false "Days updated" toast while nothing changed.
  if (!data || data.length === 0) {
    throw new Error('Batch not found or not updatable');
  }
}

// =============================================================================
// PHOTOS — Phase 3 (portal-owned; no sync involvement)
//
// Case photos live in a PRIVATE Cloudflare R2 bucket that only the
// aligner-portal-photos Edge Function can reach (it alone holds the R2
// credentials; no metadata table, nothing on the clinic mirror's public
// schema — so the CDC sync never sees them). The function verifies the same
// minted dr_id JWT the rest of the portal reads under (sent in the dedicated
// `x-portal-token` header; Authorization carries the anon key for the Supabase
// gateway) and checks set ownership before every operation. Uploads don't pass
// through the function: it returns a short-lived presigned URL and the browser
// PUTs the file straight into R2 (the bucket's CORS policy — r2-cors.json —
// allows PUT from the portal origins).
// =============================================================================

const photosFnUrl = '/api/photos';

/** Call the photos Edge Function; unwraps errors into a thrown message. */
async function photosFnFetch(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const token = await getPortalToken();
  if (!token) {
    throw new Error('Portal session not established');
  }
  const res = await fetch(`${photosFnUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'x-portal-token': token,
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    const message = typeof body.error === 'string' && body.error ? body.error : `Photo request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

/**
 * Fetch photos for an aligner set. Each photo carries a short-lived signed
 * view URL, so results must not be cached beyond the page's in-memory state.
 */
export async function fetchPhotos(setId: number): Promise<AlignerSetPhoto[]> {
  if (!setId) throw new Error('Set ID is required');
  const body = await photosFnFetch(`/photos?setId=${setId}`);
  return (body.photos as AlignerSetPhoto[]) || [];
}

/** PUT a file to a signed storage upload URL, reporting real upload progress. */
function putToSignedUrl(url: string, file: File, mimeType: string, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Upload failed (network error)'));
    xhr.send(file);
  });
}

/**
 * Upload a case photo/file: ask the Edge Function for a signed upload URL (it
 * validates type/size and set ownership), then PUT the file directly to
 * storage. `onProgress` reports the PUT's byte progress (0..1).
 */
export async function uploadPhoto(
  setId: number,
  file: File,
  category: 'photos' | 'files',
  onProgress?: (fraction: number) => void
): Promise<void> {
  if (!setId) throw new Error('Set ID is required');

  // Resolve mime type if empty (common for .stl / .ply on some OS/browsers)
  let mimeType = file.type;
  if (!mimeType) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      zip: 'application/zip',
      stl: 'model/stl',
      ply: 'model/ply',
    };
    mimeType = mimeMap[ext || ''] || 'application/octet-stream';
  }

  const grant = (await photosFnFetch('/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setId,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      category,
    }),
  })) as unknown as PhotoUploadUrlResponse;

  await putToSignedUrl(grant.signedUrl, file, mimeType, onProgress);
}

/** Delete a photo (the Edge Function re-derives the set from the path and re-checks ownership). */
export async function deletePhoto(path: string): Promise<void> {
  if (!path) throw new Error('Photo path is required');
  await photosFnFetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
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
