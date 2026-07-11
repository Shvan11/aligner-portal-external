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

  return (
    <div className="photos-section">
      <div className="photos-header">
        <h3>
          <i className="fas fa-folder-open" aria-hidden="true"></i> Photos & Scans
          {photos.length > 0 && <span className="photos-count">{photos.length}</span>}
        </h3>
        <SetPhotoUpload setId={setId} onUploadComplete={handleUploadComplete} />
      </div>

      <SetPhotoGrid photos={photos} onPhotoClick={setViewerPhoto} onPhotoDelete={handleDelete} />

      {viewerPhoto && <FullscreenImageViewer photo={viewerPhoto} onClose={closeViewer} />}
    </div>
  );
};

export default PhotosSection;
