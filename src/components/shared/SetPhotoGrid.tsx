/**
 * SetPhotoGrid - Thumbnail grid of a set's case photos with per-photo delete.
 * Thumbnails render the signed view URL directly (no separate thumbnail
 * pipeline); the grid crops via object-fit.
 */

import React, { useState, type MouseEvent, type KeyboardEvent } from 'react';
import { formatDateTime } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { SetPhotoGridProps, AlignerSetPhoto } from '../../types';

const isImage = (photo: AlignerSetPhoto): boolean => {
  if (photo.mime_type) {
    return photo.mime_type.startsWith('image/');
  }
  const ext = photo.file_name.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext || '');
};

const getFileIconClass = (photo: AlignerSetPhoto): string => {
  const ext = photo.file_name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return 'fas fa-file-archive';
    case 'stl':
    case 'ply':
    case 'obj':
    case '3ds':
    case 'fbx':
      return 'fas fa-cube';
    case 'pdf':
      return 'fas fa-file-pdf';
    case 'doc':
    case 'docx':
      return 'fas fa-file-word';
    default:
      return 'fas fa-file';
  }
};

const SetPhotoGrid: React.FC<SetPhotoGridProps> = ({ photos, onPhotoClick, onPhotoDelete }) => {
  const toast = useToast();
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const handleDelete = async (photo: AlignerSetPhoto, e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.stopPropagation(); // don't open the viewer or trigger download

    if (!window.confirm(`Delete ${photo.file_name}?`)) {
      return;
    }

    setDeletingPath(photo.path);
    try {
      await onPhotoDelete(photo);
      toast.success('File deleted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Delete failed: ${message}`);
    } finally {
      setDeletingPath(null);
    }
  };

  const handlePhotoClick = (photo: AlignerSetPhoto): void => {
    if (isImage(photo)) {
      onPhotoClick(photo);
    } else {
      window.open(photo.view_url, '_blank');
    }
  };

  const handleThumbKeyDown = (photo: AlignerSetPhoto, e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handlePhotoClick(photo);
    }
  };

  if (!photos || photos.length === 0) {
    return (
      <div className="empty-photos">
        <i className="fas fa-file-upload"></i>
        <p>No files yet</p>
        <p className="empty-photos-hint">Upload photos or 3D scan files (ZIP, STL, PLY) for the lab</p>
      </div>
    );
  }

  return (
    <div className="photo-grid">
      {photos.map(photo => (
        <div
          key={photo.path}
          className="photo-thumbnail"
          onClick={() => handlePhotoClick(photo)}
          onKeyDown={e => handleThumbKeyDown(photo, e)}
          role="button"
          tabIndex={0}
          aria-label={`View or download ${photo.file_name}`}
        >
          {isImage(photo) ? (
            <img src={photo.view_url} alt={photo.file_name} loading="lazy" />
          ) : (
            <div className="file-icon-placeholder">
              <i className={getFileIconClass(photo)}></i>
            </div>
          )}
          <div className="photo-overlay" aria-hidden="true">
            <i className={isImage(photo) ? 'fas fa-search-plus' : 'fas fa-download'}></i>
          </div>
          <button
            className="photo-delete-btn"
            onClick={e => handleDelete(photo, e)}
            disabled={deletingPath === photo.path}
            title="Delete file"
            aria-label={`Delete ${photo.file_name}`}
          >
            <i className={deletingPath === photo.path ? 'fas fa-spinner fa-spin' : 'fas fa-trash'}></i>
          </button>
          <div className="photo-caption">
            <span className="photo-caption-name">{photo.file_name}</span>
            <span className="photo-caption-date">{formatDateTime(photo.uploaded_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SetPhotoGrid;
