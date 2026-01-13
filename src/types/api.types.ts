/**
 * API Types
 * Types for API responses, request payloads, and derived data structures
 */

import type {
  AlignerSet,
  AlignerBatch,
  AlignerNote,
  AlignerSetPhoto,
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
 * Photo upload URL response from Edge Function
 */
export interface PhotoUploadUrlResponse {
  uploadUrl: string;
  fileKey: string;
}

/**
 * Photo URLs response from Edge Function
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
