// AnnouncementBanner.jsx - Displays announcements with realtime updates and toast notifications
import React, { useState, useEffect } from 'react';
import { supabase, formatDateTime } from '../../lib/supabase';

const AnnouncementBanner = ({ doctorId }) => {
    const [announcements, setAnnouncements] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [toastNotifications, setToastNotifications] = useState([]);

    // Load announcements when doctor is loaded
    useEffect(() => {
        if (doctorId) {
            loadAnnouncements();
            subscribeToAnnouncements();
        }
    }, [doctorId]);

    // Load unread announcements
    const loadAnnouncements = async () => {
        try {
            const { data, error: queryError } = await supabase
                .from('doctor_announcements')
                .select(`
                    *,
                    doctor_announcement_reads!left(read_at)
                `)
                .or(`target_doctor_id.is.null,target_doctor_id.eq.${doctorId}`)
                .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
                .order('created_at', { ascending: false });

            if (queryError) {
                console.error('Error loading announcements:', queryError);
                return;
            }

            // Filter unread announcements
            const unread = data.filter(a => !a.doctor_announcement_reads || a.doctor_announcement_reads.length === 0);
            setAnnouncements(unread);
            setUnreadCount(unread.length);

            console.log(`📬 Loaded ${unread.length} unread announcements`);

        } catch (error) {
            console.error('Error loading announcements:', error);
        }
    };

    // Subscribe to real-time announcement updates
    const subscribeToAnnouncements = () => {
        console.log('🔔 Subscribing to real-time announcements for doctor:', doctorId);

        const subscription = supabase
            .channel('doctor-announcements')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'doctor_announcements',
                filter: `target_doctor_id=eq.${doctorId}`
            }, (payload) => {
                console.log('🔔 New announcement received:', payload.new);
                handleNewAnnouncement(payload.new);
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'doctor_announcements',
                filter: 'target_doctor_id=is.null'
            }, (payload) => {
                console.log('📢 New broadcast announcement:', payload.new);
                handleNewAnnouncement(payload.new);
            })
            .subscribe();

        // Cleanup subscription on unmount
        return () => {
            subscription.unsubscribe();
        };
    };

    // Handle new announcement (real-time)
    const handleNewAnnouncement = (announcement) => {
        // Add to announcements list
        setAnnouncements(prev => [announcement, ...prev]);
        setUnreadCount(prev => prev + 1);

        // Show toast notification
        showToast(announcement);
    };

    // Show toast notification
    const showToast = (announcement) => {
        const toastId = Date.now();
        setToastNotifications(prev => [...prev, { ...announcement, toastId }]);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            dismissToast(toastId);
        }, 5000);
    };

    // Dismiss toast
    const dismissToast = (toastId) => {
        setToastNotifications(prev => prev.filter(t => t.toastId !== toastId));
    };

    // Mark announcement as read
    const markAnnouncementRead = async (announcementId) => {
        try {
            const { error: insertError } = await supabase
                .from('doctor_announcement_reads')
                .insert({
                    announcement_id: announcementId,
                    dr_id: doctorId
                });

            if (insertError) {
                console.error('Error marking announcement as read:', insertError);
                return;
            }

            // Remove from announcements list
            setAnnouncements(prev => prev.filter(a => a.announcement_id !== announcementId));
            setUnreadCount(prev => prev - 1);

        } catch (error) {
            console.error('Error marking announcement as read:', error);
        }
    };

    // Dismiss all announcements
    const dismissAllAnnouncements = async () => {
        try {
            const insertPromises = announcements.map(a =>
                supabase
                    .from('doctor_announcement_reads')
                    .insert({
                        announcement_id: a.announcement_id,
                        dr_id: doctorId
                    })
            );

            await Promise.all(insertPromises);

            setAnnouncements([]);
            setUnreadCount(0);

        } catch (error) {
            console.error('Error dismissing all announcements:', error);
        }
    };

    return (
        <>
            {/* Announcements Banner */}
            {unreadCount > 0 && (
                <div className="announcements-banner">
                    <div className="announcements-header">
                        <div className="announcements-title">
                            <i className="fas fa-bullhorn"></i>
                            <span>You have {unreadCount} new {unreadCount === 1 ? 'update' : 'updates'}</span>
                        </div>
                        {announcements.length > 1 && (
                            <button className="dismiss-all-btn" onClick={dismissAllAnnouncements}>
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
                                                onClick={() => markAnnouncementRead(announcement.announcement_id)}
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        )}
                                    </div>
                                    <p className="announcement-message">{announcement.message}</p>
                                    <div className="announcement-footer">
                                        <span className="announcement-time">
                                            {formatDateTime(announcement.created_at)}
                                        </span>
                                        {announcement.link_url && (
                                            <a
                                                href={announcement.link_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="announcement-link"
                                            >
                                                {announcement.link_text || 'Learn More'}
                                                <i className="fas fa-external-link-alt"></i>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {announcements.length > 3 && (
                        <div className="announcements-more">
                            +{announcements.length - 3} more updates
                        </div>
                    )}
                </div>
            )}

            {/* Toast Notifications */}
            <div className="toast-container">
                {toastNotifications.map((toast) => (
                    <div
                        key={toast.toastId}
                        className={`toast-notification toast-${toast.announcement_type}`}
                    >
                        <div className="toast-icon">
                            {toast.announcement_type === 'success' && <i className="fas fa-check-circle"></i>}
                            {toast.announcement_type === 'info' && <i className="fas fa-info-circle"></i>}
                            {toast.announcement_type === 'warning' && <i className="fas fa-exclamation-triangle"></i>}
                            {toast.announcement_type === 'urgent' && <i className="fas fa-exclamation-circle"></i>}
                        </div>
                        <div className="toast-content">
                            <strong>{toast.title}</strong>
                            <p>{toast.message}</p>
                        </div>
                        <button
                            className="toast-close"
                            onClick={() => dismissToast(toast.toastId)}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
};

export default AnnouncementBanner;
