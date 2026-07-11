/**
 * SetCard - Memoized set card component for CaseDetail
 * Displays aligner set info, progress, batches (with days editor), and notes
 * (timeline + add-note form).
 */

import { memo, useMemo, useCallback, type KeyboardEvent } from 'react';
import { formatDate } from '../../lib/supabase';
import BatchesSection from './BatchesSection';
import NotesSection from './NotesSection';
import PhotosSection from './PhotosSection';
import YouTubeVideoDisplay from './YouTubeVideoDisplay';
import type { SetCardProps } from '../../types';

const SetCard = memo(function SetCard({
  set,
  doctor,
  isExpanded,
  batches,
  notes,
  photos,
  onToggleExpand,
  onAddNote,
  onUpdateDays,
  onRefreshPhotos,
  onDeletePhoto,
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

  const setId = set.aligner_set_id;

  const handleToggle = useCallback((): void => {
    onToggleExpand(setId);
  }, [setId, onToggleExpand]);

  const handleHeaderKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggleExpand(setId);
      }
    },
    [setId, onToggleExpand]
  );

  const handleAddNote = useCallback(
    (noteText: string): Promise<void> => onAddNote(setId, noteText),
    [setId, onAddNote]
  );

  const handleUpdateDays = useCallback(
    (batchId: number, days: number): Promise<void> => onUpdateDays(setId, batchId, days),
    [setId, onUpdateDays]
  );

  return (
    <div className={`set-card ${set.is_active ? '' : 'inactive'}`}>
      {/* Header */}
      <div
        className="set-header"
        onClick={handleToggle}
        onKeyDown={handleHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
      >
        <div className="set-title-row">
          <h3>Set #{set.set_sequence}</h3>
          {set.type && <span className="set-type-badge">{set.type}</span>}
          <span className={set.is_active ? 'case-active-badge' : 'case-inactive-badge'}>
            {set.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        {/* Decorative only — the header div above owns the click/keyboard
            interaction. This used to be a real <button> with no handler of
            its own, relying on event bubbling to the parent div; that made it
            a natively-focusable dead end for keyboard users (Tab landed here,
            not on the header), so it's now a plain span. */}
        <span className={`set-expand-btn ${isExpanded ? 'expanded' : ''}`} aria-hidden="true">
          <i className="fas fa-chevron-down"></i>
        </span>
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
          {/* Batches (with days editor) */}
          {batches && batches.length > 0 && (
            <BatchesSection batches={batches} onUpdateDays={handleUpdateDays} />
          )}

          {/* Case photos (upload + grid + fullscreen viewer) */}
          <PhotosSection
            setId={setId}
            photos={photos || []}
            onRefresh={onRefreshPhotos}
            onDeletePhoto={onDeletePhoto}
          />

          {/* Notes timeline + add-note form */}
          <NotesSection
            notes={notes || []}
            doctorName={doctor.doctor_name}
            onAddNote={handleAddNote}
          />
        </>
      )}
    </div>
  );
});

export default SetCard;
