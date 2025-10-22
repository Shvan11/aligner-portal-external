// NotesSection.jsx - Notes display and editing (EDITABLE)
import React from 'react';
import { formatDateTime } from '../../lib/supabase';

const NotesSection = ({
    setId,
    notes,
    showAddNote,
    noteText,
    doctorName,
    onToggleAddNote,
    onNoteTextChange,
    onAddNote
}) => {
    return (
        <div className="notes-section">
            <div className="notes-header">
                <h3>Communication</h3>
                {!showAddNote && (
                    <button className="btn-add-note" onClick={() => onToggleAddNote(true)}>
                        <i className="fas fa-plus"></i>
                        Add Note
                    </button>
                )}
            </div>

            {showAddNote && (
                <div className="add-note-form">
                    <textarea
                        className="note-textarea"
                        placeholder="Type your message to the lab..."
                        value={noteText}
                        onChange={(e) => onNoteTextChange(e.target.value)}
                    />
                    <div className="note-form-actions">
                        <button className="btn-cancel" onClick={() => onToggleAddNote(false)}>
                            Cancel
                        </button>
                        <button className="btn-submit" onClick={() => onAddNote(setId)}>
                            <i className="fas fa-paper-plane"></i>
                            Send Note
                        </button>
                    </div>
                </div>
            )}

            <div className="notes-timeline">
                {notes.length === 0 ? (
                    <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                        <i className="fas fa-comments"></i>
                        <p>No messages yet</p>
                    </div>
                ) : (
                    notes.map((note) => (
                        <div key={note.note_id} className={`note-item ${note.note_type === 'Lab' ? 'lab-note' : ''}`}>
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
