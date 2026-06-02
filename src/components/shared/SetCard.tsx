/**
 * SetCard - Memoized set card component for CaseDetail
 * Displays aligner set info, progress, batches, and notes (read-only, Phase 1).
 */

import { memo, useMemo, useCallback } from 'react';
import { formatDate } from '../../lib/supabase';
import BatchesSection from './BatchesSection';
import NotesSection from './NotesSection';
import YouTubeVideoDisplay from './YouTubeVideoDisplay';
import type { SetCardProps } from '../../types';

const SetCard = memo(function SetCard({
  set,
  doctor,
  isExpanded,
  batches,
  notes,
  onToggleExpand,
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
          {batches && batches.length > 0 && <BatchesSection batches={batches} />}

          {/* Notes (read-only timeline) */}
          <NotesSection notes={notes || []} doctorName={doctor.doctor_name} />
        </>
      )}
    </div>
  );
});

export default SetCard;
