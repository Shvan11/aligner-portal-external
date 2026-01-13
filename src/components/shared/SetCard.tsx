/**
 * SetCard - Memoized set card component for CaseDetail
 * Displays aligner set info, payment, progress, batches, photos, and notes
 */

import { memo, useMemo, useCallback } from 'react';
import { formatDate } from '../../lib/supabase';
import BatchesSection from './BatchesSection';
import NotesSection from './NotesSection';
import SetPhotoUpload from './SetPhotoUpload';
import SetPhotoGrid from './SetPhotoGrid';
import YouTubeVideoDisplay from './YouTubeVideoDisplay';
import type { SetCardProps } from '../../types';

const SetCard = memo(function SetCard({
  set,
  doctor,
  isExpanded,
  batches,
  notes,
  photos,
  showAddNote,
  noteText,
  onToggleExpand,
  onUpdateDays,
  onToggleAddNote,
  onNoteTextChange,
  onAddNote,
  onLoadPhotos,
  onPhotoClick,
}: SetCardProps) {
  // Calculate progress
  const { progress, delivered, total } = useMemo(() => {
    const deliveredCount =
      (set.upper_aligners_count || 0) +
      (set.lower_aligners_count || 0) -
      (set.remaining_upper_aligners || 0) -
      (set.remaining_lower_aligners || 0);
    const totalCount = (set.upper_aligners_count || 0) + (set.lower_aligners_count || 0);
    const progressPercent = totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 0;

    return {
      progress: progressPercent,
      delivered: deliveredCount,
      total: totalCount,
    };
  }, [
    set.upper_aligners_count,
    set.lower_aligners_count,
    set.remaining_upper_aligners,
    set.remaining_lower_aligners,
  ]);

  const payment = set.aligner_set_payments?.[0];
  const setId = set.aligner_set_id;

  const handleToggle = useCallback((): void => {
    onToggleExpand(setId);
  }, [setId, onToggleExpand]);

  const handleToggleAddNoteClick = useCallback(
    (show: boolean): void => {
      onToggleAddNote(setId, show);
    },
    [setId, onToggleAddNote]
  );

  const handleAddNoteClick = useCallback(async (): Promise<void> => {
    await onAddNote(setId);
  }, [setId, onAddNote]);

  const handlePhotoUploadComplete = useCallback(async (): Promise<void> => {
    await onLoadPhotos(setId);
  }, [setId, onLoadPhotos]);

  const handlePhotoDelete = useCallback(async (): Promise<void> => {
    await onLoadPhotos(setId);
  }, [setId, onLoadPhotos]);

  return (
    <div className={`set-card ${set.is_active ? '' : 'inactive'}`}>
      {/* Header */}
      <div className="set-header" onClick={handleToggle}>
        <div className="set-title-row">
          <h3>Set #{set.set_sequence}</h3>
          {set.type && <span className="set-type-badge">{set.type}</span>}
          <span className={set.is_active ? 'case-active-badge' : 'case-inactive-badge'}>
            {set.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <button className={`set-expand-btn ${isExpanded ? 'expanded' : ''}`}>
          <i className="fas fa-chevron-down"></i>
        </button>
      </div>

      {/* Info Grid */}
      <div className="set-info-grid">
        <div className="set-info-item">
          <i className="fas fa-teeth"></i>
          <span>
            Upper: <strong>{set.upper_aligners_count || 0}</strong>
          </span>
        </div>
        <div className="set-info-item">
          <i className="fas fa-teeth"></i>
          <span>
            Lower: <strong>{set.lower_aligners_count || 0}</strong>
          </span>
        </div>
        <div className="set-info-item">
          <i className="fas fa-calendar"></i>
          <span>
            Created: <strong>{formatDate(set.creation_date)}</strong>
          </span>
        </div>
      </div>

      {/* Payment Summary */}
      {payment && (
        <div className="set-payment-summary">
          <div className="payment-summary-item">
            <div className="payment-summary-label">Total Required</div>
            <div className="payment-summary-value">
              {set.set_cost ?? 0} {set.currency || 'USD'}
            </div>
          </div>
          <div className="payment-summary-divider"></div>
          <div className="payment-summary-item">
            <div className="payment-summary-label">Total Paid</div>
            <div className="payment-summary-value paid">
              {payment.total_paid ?? 0} {set.currency || 'USD'}
            </div>
          </div>
          <div className="payment-summary-divider"></div>
          <div className="payment-summary-item">
            <div className="payment-summary-label">Balance</div>
            <div className="payment-summary-value balance">
              {payment.balance ?? 0} {set.currency || 'USD'}
            </div>
          </div>
          <div className="payment-summary-status">
            <span
              className={`payment-status-badge ${payment.payment_status?.toLowerCase().replace(/\s+/g, '-') || 'unpaid'}`}
            >
              {payment.payment_status || 'Unpaid'}
            </span>
          </div>
        </div>
      )}

      {/* URLs */}
      <div className="set-urls">
        {set.set_url && (
          <a href={set.set_url} target="_blank" rel="noopener noreferrer" className="url-btn">
            <i className="fas fa-link"></i>
            Setup URL
          </a>
        )}
        {set.set_pdf_url && (
          <a
            href={set.set_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="url-btn pdf"
          >
            <i className="fas fa-file-pdf"></i>
            View PDF
          </a>
        )}
      </div>

      {/* Setup Video */}
      {set.set_video && (
        <div className="set-video-section">
          <YouTubeVideoDisplay videoUrl={set.set_video} />
        </div>
      )}

      {/* Progress */}
      <div className="set-progress">
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="progress-text">
          <span>
            {delivered} of {total} aligners delivered
          </span>
          <span>{progress}%</span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <>
          {/* Batches */}
          {batches && batches.length > 0 && (
            <BatchesSection batches={batches} onUpdateDays={onUpdateDays} />
          )}

          {/* Photos Section */}
          <div className="set-section">
            <div className="section-header-row">
              <h4>
                <i className="fas fa-images"></i>
                Photos
              </h4>
              <SetPhotoUpload
                setId={setId}
                doctorId={doctor.dr_id}
                onUploadComplete={handlePhotoUploadComplete}
              />
            </div>
            <SetPhotoGrid
              photos={photos || []}
              onPhotoClick={onPhotoClick}
              onPhotoDelete={handlePhotoDelete}
              doctorId={doctor.dr_id}
            />
          </div>

          {/* Notes */}
          <NotesSection
            setId={setId}
            notes={notes || []}
            showAddNote={showAddNote}
            noteText={noteText}
            doctorName={doctor.doctor_name}
            onToggleAddNote={handleToggleAddNoteClick}
            onNoteTextChange={onNoteTextChange}
            onAddNote={handleAddNoteClick}
          />
        </>
      )}
    </div>
  );
});

export default SetCard;
