/**
 * NotesSection - Notes display (read-only timeline, Phase 1)
 *
 * Adding notes writes to the source-of-truth DB, which the portal cannot do
 * directly against the read-only mirror; the add-note form returns in Phase 2.
 */

import React from 'react';
import { formatDateTime } from '../../lib/supabase';
import type { NotesSectionProps } from '../../types';

const NotesSection: React.FC<NotesSectionProps> = ({ notes, doctorName }) => {
  return (
    <div className="notes-section">
      <div className="notes-header">
        <h3>Communication</h3>
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
    </div>
  );
};

export default NotesSection;
