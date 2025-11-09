import React, { useState } from 'react';

const SetPhotoUpload = ({ setId, doctorId, onUploadComplete }) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset file input
        e.target.value = '';

        // Client-side validation
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (JPEG, PNG, GIF, WEBP, HEIC)');
            return;
        }

        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            alert('File too large. Maximum size is 10MB');
            return;
        }

        setUploading(true);
        setProgress(10);

        try {
            // Step 1: Get presigned upload URL from Supabase Edge Function
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const urlResponse = await fetch(`${supabaseUrl}/functions/v1/aligner-photo-upload-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    setId,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    doctorId
                })
            });

            if (!urlResponse.ok) {
                const errorData = await urlResponse.json();
                throw new Error(errorData.error || 'Failed to get upload URL');
            }

            const { uploadUrl, fileKey } = await urlResponse.json();
            setProgress(30);

            // Step 2: Upload directly to R2 using presigned URL
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type
                }
            });

            if (!uploadResponse.ok) {
                throw new Error('Failed to upload file to storage');
            }

            setProgress(70);

            // Step 3: Save metadata to Supabase via Edge Function
            const metadataResponse = await fetch(`${supabaseUrl}/functions/v1/aligner-photo-save-metadata`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    setId,
                    fileKey,
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type,
                    doctorId
                })
            });

            if (!metadataResponse.ok) {
                const errorData = await metadataResponse.json();
                throw new Error(errorData.error || 'Failed to save photo metadata');
            }

            setProgress(100);

            // Notify parent component
            if (onUploadComplete) {
                onUploadComplete();
            }

            // Reset progress after brief delay
            setTimeout(() => {
                setProgress(0);
            }, 1000);

        } catch (error) {
            alert(`Upload failed: ${error.message}`);
            setProgress(0);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="photo-upload">
            <label className={`upload-btn ${uploading ? 'uploading' : ''}`}>
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    style={{ display: 'none' }}
                />
                {uploading ? (
                    <>
                        <i className="fas fa-spinner fa-spin"></i>
                        <span>Uploading {progress}%</span>
                    </>
                ) : (
                    <>
                        <i className="fas fa-camera"></i>
                        <span>Add Photo</span>
                    </>
                )}
            </label>
            {uploading && (
                <div className="upload-progress">
                    <div className="upload-progress-bar" style={{ width: `${progress}%` }}></div>
                </div>
            )}
        </div>
    );
};

export default SetPhotoUpload;
