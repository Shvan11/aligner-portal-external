/**
 * NotesSection - Communication timeline + add-note form (Phase 2)
 *
 * A doctor can add a note to the set. The note is written to the Supabase mirror
 * as a 'Doctor' note (RLS-enforced) and reverse-synced to the clinic's local DB,
 * where it surfaces to the lab as an unread message.
 */

import React, { useState, useCallback } from 'react';
import { formatDateTime } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { NotesSectionProps } from '../../types';

const NotesSection: React.FC<NotesSectionProps> = ({ notes, doctorName, onAddNote }) => {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const closeForm = useCallback((): void => {
    setShowForm(false);
    setNoteText('');
  }, []);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const text = noteText.trim();
    if (!text) return;

    setSubmitting(true);
    try {
      await onAddNote(text);
      toast.success('Note sent to the lab');
      closeForm();
    } catch {
      toast.error('Could not send the note. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [noteText, onAddNote, toast, closeForm]);

  return (
    <div className="notes-section">
      <div className="notes-header">
        <h3>Communication</h3>
        {!showForm && (
          <button className="btn-add-note" onClick={() => setShowForm(true)}>
            <i className="fas fa-plus"></i>
            Add Note
          </button>
        )}
      </div>

      <div className="notes-timeline">
        {notes.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <i className="fas fa-comments"></i>
            <p>No messages yet</p>
          </div>
        ) : (
          notes.map(note => (
            <div
              key={note.note_id}
              className={`note-item ${note.note_type === 'Lab' ? 'lab-note' : ''}`}
            >
              <div className="note-header-row">
                <div className={`note-author ${note.note_type === 'Lab' ? 'lab' : ''}`}>
                  <i className={note.note_type === 'Lab' ? 'fas fa-flask' : 'fas fa-user-md'}></i>
                  {note.note_type === 'Lab' ? 'Shwan Lab' : `Dr. ${doctorName}`}
                </div>
                <div className="note-date">
                  {formatDateTime(note.created_at)}
                  {note.is_edited && ' (edited)'}
                </div>
              </div>
              <p className="note-text">{note.note_text}</p>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="add-note-form">
          <textarea
            className="note-textarea"
            placeholder="Write a note to the lab..."
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            disabled={submitting}
            autoFocus
          />
          <div className="note-form-actions">
            <button className="btn-cancel" onClick={closeForm} disabled={submitting}>
              Cancel
            </button>
            <button
              className="btn-submit"
              onClick={handleSubmit}
              disabled={submitting || !noteText.trim()}
            >
              <i className="fas fa-paper-plane"></i>
              {submitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesSection;
