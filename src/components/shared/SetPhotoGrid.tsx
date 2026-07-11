/**
 * SetPhotoGrid - Thumbnail grid of a set's case photos with per-photo delete.
 * Thumbnails render the signed view URL directly (no separate thumbnail
 * pipeline); the grid crops via object-fit.
 */

import React, { useState, type MouseEvent, type KeyboardEvent } from 'react';
import { formatDateTime } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { SetPhotoGridProps, AlignerSetPhoto } from '../../types';

const SetPhotoGrid: React.FC<SetPhotoGridProps> = ({ photos, onPhotoClick, onPhotoDelete }) => {
  const toast = useToast();
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const handleDelete = async (photo: AlignerSetPhoto, e: MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.stopPropagation(); // don't open the fullscreen viewer

    if (!window.confirm(`Delete ${photo.file_name}?`)) {
      return;
    }

    setDeletingPath(photo.path);
    try {
      await onPhotoDelete(photo);
      toast.success('Photo deleted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Delete failed: ${message}`);
    } finally {
      setDeletingPath(null);
    }
  };

  const handleThumbKeyDown = (photo: AlignerSetPhoto, e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onPhotoClick(photo);
    }
  };

  if (!photos || photos.length === 0) {
    return (
      <div className="empty-photos">
        <i className="fas fa-images"></i>
        <p>No photos yet</p>
        <p className="empty-photos-hint">Use “Add Photo” to attach case images for the lab</p>
      </div>
    );
  }

  return (
    <div className="photo-grid">
      {photos.map(photo => (
        <div
          key={photo.path}
          className="photo-thumbnail"
          onClick={() => onPhotoClick(photo)}
          onKeyDown={e => handleThumbKeyDown(photo, e)}
          role="button"
          tabIndex={0}
          aria-label={`View ${photo.file_name}`}
        >
          <img src={photo.view_url} alt={photo.file_name} loading="lazy" />
          <div className="photo-overlay" aria-hidden="true">
            <i className="fas fa-search-plus"></i>
          </div>
          <button
            className="photo-delete-btn"
            onClick={e => handleDelete(photo, e)}
            disabled={deletingPath === photo.path}
            title="Delete photo"
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
