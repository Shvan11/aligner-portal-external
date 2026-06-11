/**
 * Custom Hook: useBatches
 * Manages batches state with loading and error handling
 */

import { useState, useCallback } from 'react';
import { fetchBatches, updateBatchDays } from '../lib/api';
import type { AlignerBatch, BatchesState, LoadingState, ErrorState } from '../types';

/**
 * Hook return type
 */
export interface UseBatchesReturn {
  batches: BatchesState;
  loading: LoadingState;
  error: ErrorState;
  loadBatches: (setId: number) => Promise<AlignerBatch[] | undefined>;
  setBatchesData: (setId: number, data: AlignerBatch[]) => void;
  updateDays: (setId: number, batchId: number, days: number) => Promise<void>;
}

export function useBatches(): UseBatchesReturn {
  const [batches, setBatches] = useState<BatchesState>({});
  const [loading, setLoading] = useState<LoadingState>({});
  const [error, setError] = useState<ErrorState>({});

  const loadBatches = useCallback(async (setId: number): Promise<AlignerBatch[] | undefined> => {
    if (!setId) return;

    try {
      setLoading(prev => ({ ...prev, [setId]: true }));
      setError(prev => ({ ...prev, [setId]: null }));

      const data = await fetchBatches(setId);
      setBatches(prev => ({ ...prev, [setId]: data }));

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(prev => ({ ...prev, [setId]: message }));
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, [setId]: false }));
    }
  }, []);

  // Pre-populate batches data (for optimized queries that include batches)
  const setBatchesData = useCallback((setId: number, data: AlignerBatch[]): void => {
    setBatches(prev => ({ ...prev, [setId]: data }));
  }, []);

  // Update "days per aligner" for one batch, then refresh the set's batches so the
  // UI reflects the saved value (and any server-side recompute) from the mirror.
  const updateDays = useCallback(
    async (setId: number, batchId: number, days: number): Promise<void> => {
      await updateBatchDays(batchId, days);
      await loadBatches(setId);
    },
    [loadBatches]
  );

  return {
    batches,
    loading,
    error,
    loadBatches,
    setBatchesData,
    updateDays,
  };
}
