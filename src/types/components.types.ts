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

export interface SetCardProps {
  set: AlignerSet;
  doctor: AlignerDoctor;
  isExpanded: boolean;
  batches: AlignerBatch[] | undefined;
  notes: AlignerNote[] | undefined;
  photos: AlignerSetPhoto[] | undefined;
  showAddNote: boolean | undefined;
  noteText: string;
  onToggleExpand: (setId: number) => void;
  onUpdateDays: (batchId: number, days: number) => Promise<void>;
  onToggleAddNote: (setId: number, show: boolean) => void;
  onNoteTextChange: (text: string) => void;
  onAddNote: (setId: number) => Promise<void>;
  onLoadPhotos: (setId: number) => Promise<AlignerSetPhoto[] | undefined>;
  onPhotoClick: (photo: AlignerSetPhoto) => void;
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
  setId: number;
  notes: AlignerNote[];
  showAddNote: boolean | undefined;
  noteText: string;
  doctorName: string;
  onToggleAddNote: (show: boolean) => void;
  onNoteTextChange: (text: string) => void;
  onAddNote: (setId: number) => void;
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
