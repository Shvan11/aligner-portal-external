/**
 * AnnouncementBanner - disabled in Phase 1.
 *
 * The curated `doctor_announcements` / `doctor_announcement_reads` tables have no
 * equivalent in the raw Supabase mirror, so the announcements feature is parked
 * until it is rebuilt (Phase 3). This stub keeps the component contract intact
 * for its callers (Dashboard, CaseDetail) while rendering nothing.
 */

import React from 'react';
import type { AnnouncementBannerProps } from '../../types';

const AnnouncementBanner: React.FC<AnnouncementBannerProps> = () => null;

export default AnnouncementBanner;
