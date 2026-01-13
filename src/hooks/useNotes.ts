/**
 * Custom Hook: useNotes
 * Manages notes state with loading and error handling
 */

import { useState, useCallback } from 'react';
import { fetchNotes, createNote } from '../lib/api';
import type { AlignerNote, NoteType, NotesState, LoadingState, ErrorState } from '../types';

/**
 * Hook return type
 */
export interface UseNotesReturn {
  notes: NotesState;
  loading: LoadingState;
  error: ErrorState;
  loadNotes: (setId: number) => Promise<AlignerNote[] | undefined>;
  addNote: (setId: number, noteText: string, noteType?: NoteType) => Promise<AlignerNote | null | undefined>;
}

export function useNotes(): UseNotesReturn {
  const [notes, setNotes] = useState<NotesState>({});
  const [loading, setLoading] = useState<LoadingState>({});
  const [error, setError] = useState<ErrorState>({});

  const loadNotes = useCallback(async (setId: number): Promise<AlignerNote[] | undefined> => {
    if (!setId) return;

    try {
      setLoading(prev => ({ ...prev, [setId]: true }));
      setError(prev => ({ ...prev, [setId]: null }));

      const data = await fetchNotes(setId);
      setNotes(prev => ({ ...prev, [setId]: data }));

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(prev => ({ ...prev, [setId]: message }));
      throw err;
    } finally {
      setLoading(prev => ({ ...prev, [setId]: false }));
    }
  }, []);

  const addNote = useCallback(async (
    setId: number,
    noteText: string,
    noteType: NoteType = 'Doctor'
  ): Promise<AlignerNote | null | undefined> => {
    if (!setId || !noteText?.trim()) {
      throw new Error('Set ID and note text are required');
    }

    const newNote = await createNote(setId, noteText, noteType);

    // Reload notes for this set
    await loadNotes(setId);

    return newNote;
  }, [loadNotes]);

  return {
    notes,
    loading,
    error,
    loadNotes,
    addNote,
  };
}
