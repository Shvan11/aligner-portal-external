import React from 'react';
import { formatDateTime } from '../../lib/supabase';

const SetPhotoGrid = ({ photos, onPhotoClick, onPhotoDelete, doctorId }) => {
    const handleDelete = async (photo, e) => {
        e.stopPropagation(); // Prevent opening fullscreen viewer

        if (!confirm(`Delete ${photo.file_name}?`)) {
            return;
        }

        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${supabaseUrl}/functions/v1/aligner-photo-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ photoId: photo.photo_id, doctorId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete photo');
            }

            console.log('✅ Photo deleted');

            // Notify parent
            if (onPhotoDelete) {
                onPhotoDelete(photo.photo_id);
            }
        } catch (error) {
            console.error('❌ Delete failed:', error);
            alert(`Delete failed: ${error.message}`);
        }
    };

    if (!photos || photos.length === 0) {
        return (
            <div className="empty-photos">
                <i className="fas fa-images"></i>
                <p>No photos yet</p>
                <p className="empty-photos-hint">Click "Add Photo" to upload case images</p>
            </div>
        );
    }

    return (
        <div className="photo-grid">
            {photos.map((photo) => (
                <div
                    key={photo.photo_id}
                    className="photo-thumbnail"
                    onClick={() => onPhotoClick(photo)}
                >
                    <img
                        src={photo.thumbnail_url}
                        alt={photo.file_name}
                        loading="lazy"
                    />
                    <div className="photo-overlay">
                        <i className="fas fa-search-plus"></i>
                    </div>
                    <button
                        className="photo-delete-btn"
                        onClick={(e) => handleDelete(photo, e)}
                        title="Delete photo"
                    >
                        <i className="fas fa-trash"></i>
                    </button>
                    <div className="photo-info-tooltip">
                        <div className="photo-tooltip-name">{photo.file_name}</div>
                        <div className="photo-tooltip-date">{formatDateTime(photo.uploaded_at)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default SetPhotoGrid;
