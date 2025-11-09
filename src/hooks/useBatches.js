/**
 * Custom Hook: useBatches
 * Manages batches state with loading and error handling
 */

import { useState, useCallback } from 'react';
import { fetchBatches } from '../lib/api';

export function useBatches() {
  const [batches, setBatches] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});

  const loadBatches = useCallback(async (setId) => {
    if (!setId) return;

    try {
      setLoading(prev => ({ ...prev, [setId]: true }));
      setError(prev => ({ ...prev, [setId]: null }));

      const data = await fetchBatches(setId);
      setBatches(prev => ({ ...prev, [setId]: data }));

      return data;
    } catch (err) {
      setError(prev => ({ ...prev, [setId]: err.message }));
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, [setId]: false }));
    }
  }, []);

  return {
    batches,
    loading,
    error,
    loadBatches
  };
}
