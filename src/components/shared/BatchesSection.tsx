/**
 * BatchesSection - Batch list with an inline "days per aligner" editor (Phase 2)
 *
 * A doctor can change a batch's `days`. The update writes the `days` column on the
 * Supabase mirror (RLS- and column-scoped) and reverse-syncs to the clinic's local
 * DB, the source of truth.
 */

import React, { useState, useCallback } from 'react';
import { formatDate } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { BatchesSectionProps } from '../../types';

const BatchesSection: React.FC<BatchesSectionProps> = ({ batches, onUpdateDays }) => {
  const toast = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [daysValue, setDaysValue] = useState('');
  const [saving, setSaving] = useState(false);

  const startEdit = useCallback((batchId: number, current: number | null | undefined): void => {
    setEditingId(batchId);
    setDaysValue(current != null ? String(current) : '');
  }, []);

  const cancelEdit = useCallback((): void => {
    setEditingId(null);
    setDaysValue('');
  }, []);

  const saveEdit = useCallback(
    async (batchId: number): Promise<void> => {
      // Number(), not parseInt(): parseInt("12.7") silently truncates to 12
      // with no warning, saving a value the doctor never typed. Number("12.7")
      // correctly fails Number.isInteger below. Number("") is 0 (not NaN), so
      // blank input needs its own explicit guard.
      const trimmed = daysValue.trim();
      const days = Number(trimmed);
      if (!trimmed || !Number.isFinite(days) || !Number.isInteger(days) || days < 0) {
        toast.warning('Enter a valid whole number of days');
        return;
      }

      setSaving(true);
      try {
        await onUpdateDays(batchId, days);
        toast.success('Days updated');
        cancelEdit();
      } catch {
        toast.error('Could not update days. Please try again.');
      } finally {
        setSaving(false);
      }
    },
    [daysValue, onUpdateDays, toast, cancelEdit]
  );

  return (
    <div className="batches-section">
      <h4>Batches</h4>
      {batches.map(batch => {
        const isDelivered = batch.delivered_to_patient_date !== null;
        const isEditing = editingId === batch.aligner_batch_id;

        return (
          <div
            key={batch.aligner_batch_id}
            className={`batch-card ${isDelivered ? 'delivered' : ''}`}
          >
            <div className="batch-header">
              <div className="batch-title">Batch #{batch.batch_sequence}</div>
              <span className={`batch-status ${isDelivered ? 'delivered' : 'pending'}`}>
                {isDelivered ? 'Delivered' : 'Pending'}
              </span>
            </div>

            <div className="batch-info-grid">
              <div className="batch-info-item">
                <i className="fas fa-teeth"></i>
                Upper: {batch.upper_aligner_start_sequence}-{batch.upper_aligner_end_sequence} (
                {batch.upper_aligner_count})
              </div>
              <div className="batch-info-item">
                <i className="fas fa-teeth"></i>
                Lower: {batch.lower_aligner_start_sequence}-{batch.lower_aligner_end_sequence} (
                {batch.lower_aligner_count})
              </div>
              <div className="batch-info-item">
                <i className="fas fa-industry"></i>
                Manufactured: {formatDate(batch.manufacture_date)}
              </div>
              {isDelivered && (
                <div className="batch-info-item">
                  <i className="fas fa-truck"></i>
                  Delivered: {formatDate(batch.delivered_to_patient_date)}
                </div>
              )}
              <div className="batch-info-item">
                <i className="fas fa-clock"></i>
                <span>Days per Aligner: </span>
                {isEditing ? (
                  <span className="days-editor">
                    <input
                      type="number"
                      min="0"
                      className="days-input"
                      value={daysValue}
                      onChange={e => setDaysValue(e.target.value)}
                      disabled={saving}
                      autoFocus
                    />
                    <button
                      className="days-save-btn"
                      onClick={() => saveEdit(batch.aligner_batch_id)}
                      disabled={saving}
                    >
                      {saving ? '...' : 'Save'}
                    </button>
                    <button className="btn-cancel" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <>
                    <strong>{batch.days ?? 'N/A'}</strong>
                    <button
                      className="days-edit-btn"
                      title="Edit days per aligner"
                      onClick={() => startEdit(batch.aligner_batch_id, batch.days)}
                    >
                      <i className="fas fa-pen"></i>
                    </button>
                  </>
                )}
              </div>
              <div className="batch-info-item">
                <i className="fas fa-hourglass-half"></i>
                Validity: {batch.validity_period || 'N/A'} days
              </div>
              {batch.next_batch_ready_date && (
                <div className="batch-info-item">
                  <i className="fas fa-calendar-check"></i>
                  Next Batch: {formatDate(batch.next_batch_ready_date)}
                </div>
              )}
            </div>

            {batch.notes && (
              <div
                style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--portal-grey)' }}
              >
                <i className="fas fa-sticky-note"></i> {batch.notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BatchesSection;
