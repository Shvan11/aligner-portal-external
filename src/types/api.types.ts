/**
 * API Types
 * Types for API responses, request payloads, and derived data structures
 */

import type {
  AlignerSet,
  AlignerBatch,
  AlignerNote,
  WorkWithPatient,
  Patient,
} from './database.types';

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

/**
 * Work data keyed by work_id
 */
export interface WorkDataMap {
  [workId: number]: WorkWithPatient;
}

/**
 * A case photo, as returned by the aligner-portal-photos Edge Function. Not a
 * database row: photos live only in the private Cloudflare R2 bucket and the
 * object list is the source of truth. `path` (sets/{setId}/{ts}-{name}) is the
 * photo's identity; `view_url` is a short-lived presigned URL minted per list.
 */
export interface AlignerSetPhoto {
  path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string | null;
  view_url: string;
}

/**
 * Presigned-upload-URL response from the aligner-portal-photos Edge Function.
 * The client PUTs the file body straight to `signedUrl` (R2).
 */
export interface PhotoUploadUrlResponse {
  path: string;
  signedUrl: string;
}

/**
 * Photo list response from the aligner-portal-photos Edge Function
 */
export interface PhotoGetUrlsResponse {
  photos: AlignerSetPhoto[];
}

// =============================================================================
// CASE TYPES (DERIVED FOR UI)
// =============================================================================

/**
 * Case data structure for Dashboard
 * Groups sets by work_id with patient info
 */
export interface CaseData {
  work_id: number;
  patient: Patient | null | undefined;
  type_of_work: string | null | undefined;
  sets: AlignerSet[];
  total_sets: number;
  active_sets: number;
  active_set: AlignerSet | null;
}

/**
 * Selected case for CaseDetail page
 */
export interface SelectedCase {
  work_id: number;
  type_of_work: string | null | undefined;
  patient: Patient | null | undefined;
}

// =============================================================================
// HOOK STATE TYPES
// =============================================================================

/**
 * Generic record keyed by set ID
 */
export type SetIdRecord<T> = Record<number, T>;

/**
 * Loading state per set ID
 */
export type LoadingState = SetIdRecord<boolean>;

/**
 * Error state per set ID
 */
export type ErrorState = SetIdRecord<string | null>;

/**
 * Batches state per set ID
 */
export type BatchesState = SetIdRecord<AlignerBatch[]>;

/**
 * Notes state per set ID
 */
export type NotesState = SetIdRecord<AlignerNote[]>;

/**
 * Photos state per set ID
 */
export type PhotosState = SetIdRecord<AlignerSetPhoto[]>;

// =============================================================================
// EXPANDED STATE TYPES
// =============================================================================

/**
 * Expanded state for sets
 */
export type ExpandedState = SetIdRecord<boolean>;

/**
 * Show add note state for sets
 */
export type ShowAddNoteState = SetIdRecord<boolean>;

/**
 * Note text state for sets
 */
export type NoteTextState = SetIdRecord<string>;
