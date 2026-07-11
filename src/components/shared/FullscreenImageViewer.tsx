/**
 * FullscreenImageViewer - Fullscreen photo overlay with Escape-to-close and
 * body scroll lock. Click anywhere outside the image closes it.
 */

import React, { useEffect, type MouseEvent } from 'react';
import { formatDateTime } from '../../lib/supabase';
import type { FullscreenImageViewerProps } from '../../types';

const FullscreenImageViewer: React.FC<FullscreenImageViewerProps> = ({ photo, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll while the viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!photo) return null;

  const stopClick = (e: MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  return (
    <div className="fullscreen-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label={photo.file_name}>
      <button className="fullscreen-close-btn" onClick={onClose} title="Close (Esc)" aria-label="Close">
        <i className="fas fa-times"></i>
      </button>

      <div className="fullscreen-image-container" onClick={stopClick}>
        <img src={photo.view_url} alt={photo.file_name} className="fullscreen-image" />
      </div>

      <div className="fullscreen-photo-info" onClick={stopClick}>
        <div className="fullscreen-info-row">
          <i className="fas fa-file-image"></i>
          <span>{photo.file_name}</span>
        </div>
        <div className="fullscreen-info-row">
          <i className="fas fa-calendar"></i>
          <span>{formatDateTime(photo.uploaded_at)}</span>
        </div>
        {photo.file_size != null && photo.file_size > 0 && (
          <div className="fullscreen-info-row">
            <i className="fas fa-weight-hanging"></i>
            <span>{(photo.file_size / 1024 / 1024).toFixed(2)} MB</span>
          </div>
        )}
      </div>

      <div className="fullscreen-hint">Click anywhere or press ESC to close</div>
    </div>
  );
};

export default FullscreenImageViewer;
