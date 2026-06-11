/**
 * CaseCard - Memoized case card component for Dashboard
 * Displays patient info, active set details, and URLs.
 *
 * Payment summary was dropped: the raw Supabase mirror has no aligner_set_payments
 * projection (paid/balance would need to be derived from invoice tables), so
 * showing it would render fabricated zeros. Re-add if/when payments are derived.
 */

import { memo, type MouseEvent } from 'react';
import type { CaseCardProps } from '../../types';

const CaseCard = memo(function CaseCard({ caseData, onSelect }: CaseCardProps) {
  const activeSet = caseData.active_set;

  const handleClick = (): void => {
    onSelect(caseData);
  };

  const handleLinkClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    e.stopPropagation();
  };

  return (
    <div className="case-card" onClick={handleClick}>
      {/* Header */}
      <div className="case-header">
        <div className="case-patient-info">
          <h3>{caseData.patient?.patient_name || `Work #${caseData.work_id}`}</h3>
        </div>
        {caseData.active_sets > 0 ? (
          <span className="case-active-badge">Active</span>
        ) : (
          <span className="case-inactive-badge">Completed</span>
        )}
      </div>

      {/* Active Set Info */}
      {activeSet && (
        <div className="case-active-set-info">
          <div className="active-set-header">
            <i className="fas fa-layer-group"></i>
            <strong>Active Set Info</strong>
          </div>
          <div className="active-set-details">
            <span>
              <i className="fas fa-hashtag"></i> Set #{activeSet.set_sequence || '?'}
            </span>
            <span>
              <i className="fas fa-teeth"></i> {activeSet.upper_aligners_count || 0}U /{' '}
              {activeSet.lower_aligners_count || 0}L
            </span>
            <span>
              <i className="fas fa-box-open"></i> Remaining:{' '}
              {activeSet.remaining_upper_aligners || 0}U /{' '}
              {activeSet.remaining_lower_aligners || 0}L
            </span>
          </div>
        </div>
      )}

      {/* URLs for Active Set */}
      {(activeSet?.set_url || activeSet?.set_pdf_url || activeSet?.set_video) && (
        <div className="case-urls">
          {activeSet.set_url && (
            <a
              href={activeSet.set_url}
              target="_blank"
              rel="noopener noreferrer"
              className="case-url-btn"
              onClick={handleLinkClick}
            >
              <i className="fas fa-link"></i>
              Setup URL
            </a>
          )}
          {activeSet.set_pdf_url && (
            <a
              href={activeSet.set_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="case-url-btn pdf"
              onClick={handleLinkClick}
            >
              <i className="fas fa-file-pdf"></i>
              View PDF
            </a>
          )}
          {activeSet.set_video && (
            <a
              href={activeSet.set_video}
              target="_blank"
              rel="noopener noreferrer"
              className="case-url-btn video"
              onClick={handleLinkClick}
            >
              <i className="fab fa-youtube"></i>
              Setup Video
            </a>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="case-stats">
        <div className="case-stat">
          <div className="case-stat-value">{caseData.total_sets}</div>
          <div className="case-stat-label">Sets</div>
        </div>
        <div className="case-stat">
          <div className="case-stat-value" style={{ color: 'var(--portal-success)' }}>
            {caseData.active_sets}
          </div>
          <div className="case-stat-label">Active</div>
        </div>
      </div>
    </div>
  );
});

export default CaseCard;
