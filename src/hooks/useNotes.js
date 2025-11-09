/**
 * Custom Hook: useNotes
 * Manages notes state with loading and error handling
 */

import { useState, useCallback } from 'react';
import { fetchNotes, createNote } from '../lib/api';

export function useNotes() {
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});

  const loadNotes = useCallback(async (setId) => {
    if (!setId) return;

    try {
      setLoading(prev => ({ ...prev, [setId]: true }));
      setError(prev => ({ ...prev, [setId]: null }));

      const data = await fetchNotes(setId);
      setNotes(prev => ({ ...prev, [setId]: data }));

      return data;
    } catch (err) {
      setError(prev => ({ ...prev, [setId]: err.message }));
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, [setId]: false }));
    }
  }, []);

  const addNote = useCallback(async (setId, noteText, noteType = 'Doctor') => {
    if (!setId || !noteText?.trim()) {
      throw new Error('Set ID and note text are required');
    }

    try {
      const newNote = await createNote(setId, noteText, noteType);

      // Reload notes for this set
      await loadNotes(setId);

      return newNote;
    } catch (err) {
      throw err;
    }
  }, [loadNotes]);

  return {
    notes,
    loading,
    error,
    loadNotes,
    addNote
  };
}
