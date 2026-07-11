/**
 * Custom Hook: usePhotos
 * Manages per-set case-photo state with loading and error handling.
 * Uploads are owned by SetPhotoUpload (it needs local progress state); this
 * hook covers list + delete, mirroring useNotes/useBatches.
 */

import { useState, useCallback } from 'react';
import { fetchPhotos, deletePhoto } from '../lib/api';
import type { AlignerSetPhoto, PhotosState, LoadingState, ErrorState } from '../types';

/**
 * Hook return type
 */
export interface UsePhotosReturn {
  photos: PhotosState;
  loading: LoadingState;
  error: ErrorState;
  loadPhotos: (setId: number) => Promise<AlignerSetPhoto[] | undefined>;
  removePhoto: (setId: number, photo: AlignerSetPhoto) => Promise<void>;
}

export function usePhotos(): UsePhotosReturn {
  const [photos, setPhotos] = useState<PhotosState>({});
  const [loading, setLoading] = useState<LoadingState>({});
  const [error, setError] = useState<ErrorState>({});

  const loadPhotos = useCallback(async (setId: number): Promise<AlignerSetPhoto[] | undefined> => {
    if (!setId) return;

    try {
      setLoading(prev => ({ ...prev, [setId]: true }));
      setError(prev => ({ ...prev, [setId]: null }));

      const data = await fetchPhotos(setId);
      setPhotos(prev => ({ ...prev, [setId]: data }));

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(prev => ({ ...prev, [setId]: message }));
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, [setId]: false }));
    }
  }, []);

  const removePhoto = useCallback(async (setId: number, photo: AlignerSetPhoto): Promise<void> => {
    await deletePhoto(photo.path);
    // Reload the set's photos so the grid reflects storage truth
    await loadPhotos(setId);
  }, [loadPhotos]);

  return {
    photos,
    loading,
    error,
    loadPhotos,
    removePhoto,
  };
}
