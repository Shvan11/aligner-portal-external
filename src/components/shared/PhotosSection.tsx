/**
 * PhotosSection - Case-photo panel inside an expanded SetCard: section header
 * with the upload button, thumbnail grid, and the fullscreen viewer state.
 */

import React, { useState, useCallback } from 'react';
import SetPhotoUpload from './SetPhotoUpload';
import SetPhotoGrid from './SetPhotoGrid';
import FullscreenImageViewer from './FullscreenImageViewer';
import type { PhotosSectionProps, AlignerSetPhoto } from '../../types';

const PhotosSection: React.FC<PhotosSectionProps> = ({ setId, photos, onRefresh, onDeletePhoto }) => {
  const [viewerPhoto, setViewerPhoto] = useState<AlignerSetPhoto | null>(null);

  const handleUploadComplete = useCallback((): Promise<void> => onRefresh(setId), [onRefresh, setId]);

  const handleDelete = useCallback(
    (photo: AlignerSetPhoto): Promise<void> => onDeletePhoto(setId, photo),
    [onDeletePhoto, setId]
  );

  const closeViewer = useCallback((): void => setViewerPhoto(null), []);

  // Separate attachments based on subfolder in path (fallback to photos section for backward compatibility)
  const imagePhotos = photos.filter(p => p.path.includes('/photos/') || !p.path.includes('/files/'));
  const fileAttachments = photos.filter(p => p.path.includes('/files/'));

  return (
    <div className="attachments-sections">
      {/* 1. Clinical Photos Section */}
      <div className="photos-section" style={{ marginBottom: '2.5rem' }}>
        <div className="photos-header">
          <h3>
            <i className="fas fa-camera" aria-hidden="true"></i> Clinical Photos
            {imagePhotos.length > 0 && <span className="photos-count">{imagePhotos.length}</span>}
          </h3>
          <SetPhotoUpload setId={setId} category="photos" onUploadComplete={handleUploadComplete} />
        </div>

        <SetPhotoGrid photos={imagePhotos} onPhotoClick={setViewerPhoto} onPhotoDelete={handleDelete} />
      </div>

      {/* 2. Scan Files Section */}
      <div className="photos-section">
        <div className="photos-header">
          <h3>
            <i className="fas fa-cube" aria-hidden="true"></i> Scan Files (STL/PLY/ZIP)
            {fileAttachments.length > 0 && <span className="photos-count">{fileAttachments.length}</span>}
          </h3>
          <SetPhotoUpload setId={setId} category="files" onUploadComplete={handleUploadComplete} />
        </div>

        <SetPhotoGrid photos={fileAttachments} onPhotoClick={setViewerPhoto} onPhotoDelete={handleDelete} />
      </div>

      {viewerPhoto && <FullscreenImageViewer photo={viewerPhoto} onClose={closeViewer} />}
    </div>
  );
};

export default PhotosSection;
