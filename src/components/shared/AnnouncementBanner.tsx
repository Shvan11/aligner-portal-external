/**
 * AnnouncementBanner — clinic → doctor announcements (Phase 3b).
 *
 * Shows the doctor's UNREAD announcements (staff-composed messages + auto
 * batch-manufactured/delivered events, forward-synced onto the mirror) under
 * the portal header. Fetch-on-load only — no realtime subscription (the mirror
 * is not a realtime-enabled project; announcements are not urgent enough to
 * warrant one). Dismissing inserts a doctor_announcement_reads receipt that
 * reverse-syncs home to the staff receipts UI; the UI updates optimistically
 * and rolls back with a toast if the insert fails.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../../lib/supabase';
import { fetchAnnouncements, dismissAnnouncement } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';
import type { AnnouncementBannerProps, DoctorAnnouncement } from '../../types';

const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ doctorId }) => {
  const toast = useToast();
  const [announcements, setAnnouncements] = useState<DoctorAnnouncement[]>([]);

  const load = useCallback(async (): Promise<void> => {
    if (!doctorId) return;
    try {
      setAnnouncements(await fetchAnnouncements(doctorId));
    } catch {
      // The banner is additive — a failed load must never break the page.
    }
  }, [doctorId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Optimistic dismiss: drop the card immediately, restore on failure.
  const dismiss = async (announcement: DoctorAnnouncement): Promise<void> => {
    if (!doctorId) return;
    const prev = announcements;
    setAnnouncements(prev.filter((a) => a.announcement_id !== announcement.announcement_id));
    try {
      await dismissAnnouncement(announcement.announcement_id, doctorId);
    } catch {
      setAnnouncements(prev);
      toast.error('Could not dismiss the update. Please try again.');
    }
  };

  // Dismiss every DISMISSIBLE announcement (sticky ones stay).
  const dismissAll = async (): Promise<void> => {
    if (!doctorId) return;
    const prev = announcements;
    const dismissible = prev.filter((a) => a.is_dismissible);
    setAnnouncements(prev.filter((a) => !a.is_dismissible));
    const results = await Promise.allSettled(
      dismissible.map((a) => dismissAnnouncement(a.announcement_id, doctorId))
    );
    if (results.some((r) => r.status === 'rejected')) {
      toast.error('Some updates could not be dismissed.');
      void load();
    }
  };

  const unreadCount = announcements.length;
  if (unreadCount === 0) return null;

  const dismissibleCount = announcements.filter((a) => a.is_dismissible).length;

  return (
    <div className="announcements-banner">
      <div className="announcements-header">
        <div className="announcements-title">
          <i className="fas fa-bullhorn"></i>
          <span>
            You have {unreadCount} new {unreadCount === 1 ? 'update' : 'updates'}
          </span>
        </div>
        {dismissibleCount > 1 && (
          <button className="dismiss-all-btn" onClick={dismissAll}>
            Dismiss All
          </button>
        )}
      </div>
      <div className="announcements-list">
        {announcements.slice(0, 3).map((announcement) => (
          <div
            key={announcement.announcement_id}
            className={`announcement-item announcement-${announcement.announcement_type}`}
          >
            <div className="announcement-content">
              <div className="announcement-header-row">
                <strong className="announcement-item-title">{announcement.title}</strong>
                {announcement.is_dismissible && (
                  <button
                    className="announcement-dismiss-btn"
                    aria-label="Dismiss"
                    onClick={() => dismiss(announcement)}
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
              <p className="announcement-message">{announcement.message}</p>
              <div className="announcement-footer">
                <span className="announcement-time">{formatDateTime(announcement.created_at)}</span>
                {announcement.link_url &&
                  (announcement.link_url.startsWith('/') ? (
                    <Link to={announcement.link_url} className="announcement-link">
                      {announcement.link_text || 'View'}
                      <i className="fas fa-arrow-right"></i>
                    </Link>
                  ) : (
                    <a
                      href={announcement.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="announcement-link"
                    >
                      {announcement.link_text || 'Learn More'}
                      <i className="fas fa-external-link-alt"></i>
                    </a>
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      {unreadCount > 3 && (
        <div className="announcements-more">+{unreadCount - 3} more updates</div>
      )}
    </div>
  );
};

export default AnnouncementBanner;
