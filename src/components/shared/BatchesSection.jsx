// BatchesSection.jsx - Batches display and editing (EDITABLE)
import React, { useState } from 'react';
import { formatDate } from '../../lib/supabase';

const BatchesSection = ({ batches, onUpdateDays }) => {
    const [editingDays, setEditingDays] = useState({});
    const [daysValues, setDaysValues] = useState({});

    const handleStartEdit = (batchId, currentDays) => {
        setEditingDays(prev => ({ ...prev, [batchId]: true }));
        setDaysValues(prev => ({ ...prev, [batchId]: currentDays || '' }));
    };

    const handleSave = async (batchId) => {
        const newDays = parseInt(daysValues[batchId]);
        if (isNaN(newDays) || newDays < 1) {
            alert('Please enter a valid number of days (minimum 1)');
            return;
        }

        await onUpdateDays(batchId, newDays);
        setEditingDays(prev => ({ ...prev, [batchId]: false }));
    };

    const handleCancel = (batchId) => {
        setEditingDays(prev => ({ ...prev, [batchId]: false }));
        setDaysValues(prev => ({ ...prev, [batchId]: '' }));
    };

    return (
        <div className="batches-section">
            <h4>Batches</h4>
            {batches.map((batch) => {
                const isDelivered = batch.delivered_to_patient_date !== null;

                return (
                    <div key={batch.aligner_batch_id} className={`batch-card ${isDelivered ? 'delivered' : ''}`}>
                        <div className="batch-header">
                            <div className="batch-title">Batch #{batch.batch_sequence}</div>
                            <span className={`batch-status ${isDelivered ? 'delivered' : 'pending'}`}>
                                {isDelivered ? 'Delivered' : 'Pending'}
                            </span>
                        </div>

                        <div className="batch-info-grid">
                            <div className="batch-info-item">
                                <i className="fas fa-teeth"></i>
                                Upper: {batch.upper_aligner_start_sequence}-{batch.upper_aligner_end_sequence} ({batch.upper_aligner_count})
                            </div>
                            <div className="batch-info-item">
                                <i className="fas fa-teeth"></i>
                                Lower: {batch.lower_aligner_start_sequence}-{batch.lower_aligner_end_sequence} ({batch.lower_aligner_count})
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
                                {editingDays[batch.aligner_batch_id] ? (
                                    <div className="days-editor">
                                        <input
                                            type="number"
                                            className="days-input"
                                            value={daysValues[batch.aligner_batch_id]}
                                            onChange={(e) => setDaysValues(prev => ({
                                                ...prev,
                                                [batch.aligner_batch_id]: e.target.value
                                            }))}
                                            min="1"
                                        />
                                        <button
                                            className="days-save-btn"
                                            onClick={() => handleSave(batch.aligner_batch_id)}
                                        >
                                            Save
                                        </button>
                                        <button
                                            className="btn-cancel"
                                            onClick={() => handleCancel(batch.aligner_batch_id)}
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <strong>{batch.days || 'N/A'}</strong>
                                        <button
                                            onClick={() => handleStartEdit(batch.aligner_batch_id, batch.days)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--portal-primary)',
                                                cursor: 'pointer',
                                                marginLeft: '0.5rem'
                                            }}
                                        >
                                            <i className="fas fa-edit"></i>
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
                            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--portal-grey)' }}>
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
