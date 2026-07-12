/**
 * SetPhotoUpload - Photo upload button with real byte-level progress.
 * Flow: Edge Function issues a signed upload URL (validating type/size and set
 * ownership server-side), then the browser PUTs the file straight to storage.
 */

import React, { useState, type ChangeEvent } from 'react';
import { uploadPhoto, tryCreateActivityFlag } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import type { SetPhotoUploadProps } from '../../types';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // mirrors the Edge Function / bucket limit

const SetPhotoUpload: React.FC<SetPhotoUploadProps> = ({ setId, category, onUploadComplete }) => {
  const toast = useToast();
  const [uploading, setUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so re-picking the same file fires onChange again
    e.target.value = '';

    // Client-side validation (the Edge Function + bucket re-enforce both)
    if (category === 'photos') {
      if (!file.type.startsWith('image/')) {
        toast.warning('Please select an image file (JPEG, PNG, WEBP, GIF, HEIC)');
        return;
      }
    } else {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['zip', 'stl', 'ply'].includes(ext || '')) {
        toast.warning('Please select a scan file (ZIP, STL, PLY)');
        return;
      }
    }

    if (file.size > MAX_FILE_BYTES) {
      toast.warning('File too large. Maximum size is 100MB');
      return;
    }

    setUploading(true);
    setProgress(5);

    try {
      // 5% = signed URL requested; the PUT's byte progress fills 10→95%
      await uploadPhoto(setId, file, category, fraction => {
        setProgress(10 + Math.round(fraction * 85));
      });
      setProgress(100);

      // Flag the staff bell (best-effort, never throws — the file is already in
      // R2 and visible in PhotosSection; a lost flag must not flip the success UX).
      await tryCreateActivityFlag(
        setId,
        category === 'photos' ? 'PhotoUploaded' : 'FileUploaded',
        `uploaded ${file.name}`
      );

      await onUploadComplete();
      toast.success(`${category === 'photos' ? 'Photo' : 'File'} uploaded successfully`);

      setTimeout(() => setProgress(0), 800);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Upload failed: ${message}`);
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="photo-upload">
      <label className={`photo-upload-btn ${uploading ? 'uploading' : ''}`}>
        <input
          type="file"
          accept={category === 'photos' ? 'image/*' : '.zip,.stl,.ply'}
          onChange={handleFileSelect}
          disabled={uploading}
        />
        {uploading ? (
          <>
            <i className="fas fa-spinner fa-spin"></i>
            <span>Uploading {progress}%</span>
          </>
        ) : (
          <>
            <i className={category === 'photos' ? 'fas fa-camera' : 'fas fa-upload'}></i>
            <span>{category === 'photos' ? 'Upload Photo' : 'Upload Scan'}</span>
          </>
        )}
      </label>
      {uploading && (
        <div className="photo-upload-progress">
          <div className="photo-upload-progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}
    </div>
  );
};

export default SetPhotoUpload;
