/**
 * Centralized Type Definitions for Aligner Portal External
 * All types should be imported from this file
 */

// Re-export all database types
export type {
  AlignerDoctor,
  AlignerDoctorMinimal,
  Patient,
  Work,
  WorkWithPatient,
  PaymentStatus,
  AlignerSetPayment,
  AlignerBatchCount,
  AlignerSet,
  AlignerBatch,
  NoteType,
  AlignerNote,
  AlignerSetPhoto,
  AnnouncementType,
  AnnouncementRead,
  DoctorAnnouncement,
  AnnouncementWithToastId,
} from './database.types';

// Re-export all API types
export type {
  WorkDataMap,
  PhotoUploadUrlResponse,
  PhotoGetUrlsResponse,
  CaseData,
  SelectedCase,
  SetIdRecord,
  LoadingState,
  ErrorState,
  BatchesState,
  NotesState,
  PhotosState,
  ExpandedState,
  ShowAddNoteState,
  NoteTextState,
} from './api.types';

// Re-export all component types
export type {
  PortalHeaderProps,
  AnnouncementBannerProps,
  AdminDoctorSelectorProps,
  CaseCardProps,
  SetCardProps,
  BatchesSectionProps,
  NotesSectionProps,
  SetPhotoUploadProps,
  SetPhotoGridProps,
  FullscreenImageViewerProps,
  YouTubeVideoDisplayProps,
  ToastType,
  ToastData,
  ToastContextValue,
  ToastContainerProps,
  ToastProps,
} from './components.types';
