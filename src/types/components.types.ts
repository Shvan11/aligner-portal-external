/**
 * Component Props Types
 * Centralized props interfaces for all components
 */

import type {
  AlignerDoctor,
  AlignerSet,
  AlignerBatch,
  AlignerNote,
  AlignerSetPhoto,
} from './database.types';
import type { CaseData } from './api.types';

// =============================================================================
// HEADER COMPONENTS
// =============================================================================

export interface PortalHeaderProps {
  doctor: AlignerDoctor | null;
}

export interface AnnouncementBannerProps {
  doctorId: number | undefined;
}

export interface AdminDoctorSelectorProps {
  onDoctorSelect: (doctor: AlignerDoctor | null) => void;
}

// =============================================================================
// CASE COMPONENTS
// =============================================================================

export interface CaseCardProps {
  caseData: CaseData;
  onSelect: (caseData: CaseData) => void;
}

// =============================================================================
// SET COMPONENTS
// =============================================================================

// Phase 2 re-enables the two doctor writes (add note, change batch days); both flow
// to the mirror and reverse-sync home. The photo prop interfaces below are kept only
// as type definitions for the future Phase 3 photo feature (not wired up).
export interface SetCardProps {
  set: AlignerSet;
  doctor: AlignerDoctor;
  isExpanded: boolean;
  batches: AlignerBatch[] | undefined;
  notes: AlignerNote[] | undefined;
  onToggleExpand: (setId: number) => void;
  onAddNote: (setId: number, noteText: string) => Promise<void>;
  onUpdateDays: (setId: number, batchId: number, days: number) => Promise<void>;
}

// =============================================================================
// BATCH COMPONENTS
// =============================================================================

export interface BatchesSectionProps {
  batches: AlignerBatch[];
  onUpdateDays: (batchId: number, days: number) => Promise<void>;
}

// =============================================================================
// NOTE COMPONENTS
// =============================================================================

export interface NotesSectionProps {
  notes: AlignerNote[];
  doctorName: string;
  onAddNote: (noteText: string) => Promise<void>;
}

// =============================================================================
// PHOTO COMPONENTS
// =============================================================================

export interface SetPhotoUploadProps {
  setId: number;
  doctorId: number;
  onUploadComplete: () => void;
}

export interface SetPhotoGridProps {
  photos: AlignerSetPhoto[];
  onPhotoClick: (photo: AlignerSetPhoto) => void;
  onPhotoDelete: (photoId: number) => void;
  doctorId: number;
}

export interface FullscreenImageViewerProps {
  photo: AlignerSetPhoto | null;
  onClose: () => void;
}

// =============================================================================
// VIDEO COMPONENTS
// =============================================================================

export interface YouTubeVideoDisplayProps {
  videoUrl: string | null | undefined;
}

// =============================================================================
// TOAST COMPONENTS
// =============================================================================

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
}

export interface ToastContextValue {
  toasts: ToastData[];
  addToast: (message: string, type?: ToastType, duration?: number) => number;
  removeToast: (id: number) => void;
  success: (message: string, duration?: number) => number;
  error: (message: string, duration?: number) => number;
  warning: (message: string, duration?: number) => number;
  info: (message: string, duration?: number) => number;
}

export interface ToastContainerProps {
  toasts: ToastData[];
  onRemove: (id: number) => void;
}

export interface ToastProps {
  toast: ToastData;
  onRemove: (id: number) => void;
}
