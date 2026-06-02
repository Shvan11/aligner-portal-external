/**
 * BatchesSection - Batches display (read-only, Phase 1)
 *
 * Editing "days per aligner" writes to the source-of-truth DB, which the portal
 * cannot do against the read-only mirror; the editor returns in Phase 2.
 */

import React from 'react';
import { formatDate } from '../../lib/supabase';
import type { BatchesSectionProps } from '../../types';

const BatchesSection: React.FC<BatchesSectionProps> = ({ batches }) => {
  return (
    <div className="batches-section">
      <h4>Batches</h4>
      {batches.map(batch => {
        const isDelivered = batch.delivered_to_patient_date !== null;

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
                <strong>{batch.days || 'N/A'}</strong>
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
