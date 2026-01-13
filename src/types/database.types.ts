/**
 * Database Entity Types
 * Maps to Supabase tables used in the external portal
 * Uses snake_case to match PostgreSQL/Supabase conventions
 */

// =============================================================================
// DOCTOR TYPES
// =============================================================================

/**
 * AlignerDoctor from aligner_doctors table
 */
export interface AlignerDoctor {
  dr_id: number;
  doctor_name: string;
  doctor_email: string | null;
  logo_path?: string | null;
  created_at?: string;
}

/**
 * Minimal doctor for dropdown selectors
 */
export type AlignerDoctorMinimal = Pick<AlignerDoctor, 'dr_id' | 'doctor_name' | 'doctor_email'>;

// =============================================================================
// PATIENT TYPES
// =============================================================================

/**
 * Patient from patients table
 */
export interface Patient {
  person_id: number;
  patient_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

// =============================================================================
// WORK TYPES
// =============================================================================

/**
 * Work record from work table
 */
export interface Work {
  work_id: number;
  person_id: number;
  type_of_work: string | null;
}

/**
 * Work with joined patient data
 */
export interface WorkWithPatient extends Work {
  patients?: Patient | null;
}

// =============================================================================
// ALIGNER SET TYPES
// =============================================================================

/**
 * Payment status values
 */
export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Overpaid';

/**
 * Aligner set payment from aligner_set_payments table
 */
export interface AlignerSetPayment {
  total_paid: number | null;
  balance: number | null;
  payment_status: PaymentStatus | string | null;
}

/**
 * Aligner batch summary (count only)
 */
export interface AlignerBatchCount {
  count: number;
}

/**
 * Full AlignerSet from aligner_sets table with relations
 */
export interface AlignerSet {
  aligner_set_id: number;
  work_id: number;
  aligner_dr_id: number;
  set_sequence: number;
  type?: string | null;
  upper_aligners_count: number;
  lower_aligners_count: number;
  remaining_upper_aligners: number;
  remaining_lower_aligners: number;
  days?: number | null;
  set_url?: string | null;
  set_pdf_url?: string | null;
  set_video?: string | null;
  set_cost?: number | null;
  currency?: string | null;
  notes?: string | null;
  is_active: boolean;
  creation_date?: string | null;
  // Nested relations from Supabase
  aligner_batches?: AlignerBatch[] | AlignerBatchCount[];
  aligner_set_payments?: AlignerSetPayment[];
}

// =============================================================================
// ALIGNER BATCH TYPES
// =============================================================================

/**
 * Full AlignerBatch from aligner_batches table
 */
export interface AlignerBatch {
  aligner_batch_id: number;
  aligner_set_id: number;
  batch_sequence: number;
  upper_aligner_count: number;
  lower_aligner_count: number;
  upper_aligner_start_sequence?: number | null;
  upper_aligner_end_sequence?: number | null;
  lower_aligner_start_sequence?: number | null;
  lower_aligner_end_sequence?: number | null;
  days?: number | null;
  validity_period?: number | null;
  manufacture_date?: string | null;
  delivered_to_patient_date?: string | null;
  next_batch_ready_date?: string | null;
  notes?: string | null;
  creation_date?: string | null;
}

// =============================================================================
// NOTE TYPES
// =============================================================================

/**
 * Note type values
 */
export type NoteType = 'Doctor' | 'Lab';

/**
 * Aligner note from aligner_notes table
 */
export interface AlignerNote {
  note_id: number;
  aligner_set_id: number;
  note_type: NoteType;
  note_text: string;
  created_at: string;
  is_read: boolean;
  is_edited?: boolean;
}

// =============================================================================
// PHOTO TYPES
// =============================================================================

/**
 * Aligner set photo from aligner_set_photos table
 */
export interface AlignerSetPhoto {
  photo_id: number;
  aligner_set_id: number;
  file_key: string;
  file_name: string;
  file_size?: number | null;
  mime_type?: string | null;
  uploaded_by?: number | null;
  uploaded_at: string;
  // Presigned URLs added by Edge Function
  view_url?: string;
  thumbnail_url?: string;
  url?: string; // Alternative URL property
}

// =============================================================================
// ANNOUNCEMENT TYPES
// =============================================================================

/**
 * Announcement type values
 */
export type AnnouncementType = 'success' | 'info' | 'warning' | 'urgent';

/**
 * Announcement read record
 */
export interface AnnouncementRead {
  read_at: string;
}

/**
 * Doctor announcement from doctor_announcements table
 */
export interface DoctorAnnouncement {
  announcement_id: number;
  title: string;
  message: string;
  announcement_type: AnnouncementType;
  target_doctor_id?: number | null;
  is_dismissible: boolean;
  link_url?: string | null;
  link_text?: string | null;
  expires_at?: string | null;
  created_at: string;
  // Nested relations from Supabase
  doctor_announcement_reads?: AnnouncementRead[];
}

/**
 * Announcement with toast ID for UI
 */
export interface AnnouncementWithToastId extends DoctorAnnouncement {
  toastId: number;
}
