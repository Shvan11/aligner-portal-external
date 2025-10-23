import React, { useEffect } from 'react';
import { formatDateTime } from '../../lib/supabase';

const FullscreenImageViewer = ({ photo, onClose }) => {
    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Prevent body scroll when viewer is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = '';
        };
    }, []);

    if (!photo) return null;

    return (
        <div className="fullscreen-viewer" onClick={onClose}>
            <button className="fullscreen-close-btn" onClick={onClose} title="Close (Esc)">
                <i className="fas fa-times"></i>
            </button>

            <div className="fullscreen-image-container" onClick={(e) => e.stopPropagation()}>
                <img
                    src={photo.view_url || photo.url}
                    alt={photo.file_name}
                    className="fullscreen-image"
                />
            </div>

            <div className="fullscreen-photo-info" onClick={(e) => e.stopPropagation()}>
                <div className="fullscreen-info-row">
                    <i className="fas fa-file-image"></i>
                    <span className="fullscreen-filename">{photo.file_name}</span>
                </div>
                <div className="fullscreen-info-row">
                    <i className="fas fa-calendar"></i>
                    <span className="fullscreen-date">{formatDateTime(photo.uploaded_at)}</span>
                </div>
                {photo.file_size && (
                    <div className="fullscreen-info-row">
                        <i className="fas fa-weight"></i>
                        <span className="fullscreen-size">
                            {(photo.file_size / 1024 / 1024).toFixed(2)} MB
                        </span>
                    </div>
                )}
            </div>

            <div className="fullscreen-hint">
                Click anywhere or press ESC to close
            </div>
        </div>
    );
};

export default FullscreenImageViewer;
