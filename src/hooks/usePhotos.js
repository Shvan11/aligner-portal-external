/**
 * Custom Hook: usePhotos
 * Manages photos state with loading and error handling
 */

import { useState, useCallback } from 'react';
import { fetchPhotos } from '../lib/api';

export function usePhotos() {
  const [photos, setPhotos] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});

  const loadPhotos = useCallback(async (setId) => {
    if (!setId) return;

    try {
      setLoading(prev => ({ ...prev, [setId]: true }));
      setError(prev => ({ ...prev, [setId]: null }));

      const data = await fetchPhotos(setId);
      setPhotos(prev => ({ ...prev, [setId]: data }));

      return data;
    } catch (err) {
      setError(prev => ({ ...prev, [setId]: err.message }));
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, [setId]: false }));
    }
  }, []);

  return {
    photos,
    loading,
    error,
    loadPhotos
  };
}
