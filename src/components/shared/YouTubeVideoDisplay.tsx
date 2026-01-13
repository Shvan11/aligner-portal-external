/**
 * YouTubeVideoDisplay - Display YouTube video with thumbnail and play button
 */

import React from 'react';
import type { YouTubeVideoDisplayProps } from '../../types';
import '../../styles/YouTubeVideoDisplay.css';

/**
 * Extract YouTube video ID from various URL formats
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 */
const extractVideoId = (url: string | null | undefined): string | null => {
  if (!url) return null;

  // Regular YouTube URL: youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  if (watchMatch) return watchMatch[1];

  // Short YouTube URL: youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
  if (shortMatch) return shortMatch[1];

  // Embed URL: youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/youtube\.com\/embed\/([^?&]+)/);
  if (embedMatch) return embedMatch[1];

  // V URL: youtube.com/v/VIDEO_ID
  const vMatch = url.match(/youtube\.com\/v\/([^?&]+)/);
  if (vMatch) return vMatch[1];

  return null;
};

/**
 * YouTubeVideoDisplay Component
 * Displays a YouTube video thumbnail with a play button overlay
 * When clicked, opens the video in a new tab
 */
const YouTubeVideoDisplay: React.FC<YouTubeVideoDisplayProps> = ({ videoUrl }) => {
  if (!videoUrl) return null;

  const videoId = extractVideoId(videoUrl);

  if (!videoId) {
    return (
      <div className="youtube-video-error">
        <i className="fas fa-exclamation-triangle"></i>
        <span>Invalid YouTube URL</span>
      </div>
    );
  }

  // YouTube provides multiple thumbnail sizes:
  // - maxresdefault.jpg (1920x1080) - highest quality but may not exist for all videos
  // - sddefault.jpg (640x480) - standard definition
  // - hqdefault.jpg (480x360) - high quality
  // - mqdefault.jpg (320x180) - medium quality
  // - default.jpg (120x90) - lowest quality
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const handleClick = (): void => {
    window.open(videoPageUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="youtube-video-container" onClick={handleClick} role="button" tabIndex={0}>
      <div className="youtube-thumbnail-wrapper">
        <img
          src={thumbnailUrl}
          alt="YouTube video thumbnail"
          className="youtube-thumbnail"
          loading="lazy"
        />
        <div className="youtube-play-overlay">
          <div className="youtube-play-button">
            <svg viewBox="0 0 68 48" className="youtube-play-icon">
              <path
                d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"
                fill="#f00"
              ></path>
              <path d="M 45,24 27,14 27,34" fill="#fff"></path>
            </svg>
          </div>
        </div>
      </div>
      <div className="youtube-video-label">
        <i className="fab fa-youtube"></i>
        <span>Click to watch setup video</span>
      </div>
    </div>
  );
};

export default YouTubeVideoDisplay;
