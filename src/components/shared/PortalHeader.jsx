// PortalHeader.jsx - Shared header component for external portal
import React from 'react';

const PortalHeader = ({ doctor }) => {
    const handleLogout = () => {
        // Redirect to Cloudflare Access logout endpoint
        window.location.href = '/cdn-cgi/access/logout';
    };

    return (
        <header className="portal-header">
            <div className="portal-header-content">
                <div className="portal-branding">
                    <i className="fas fa-tooth portal-logo"></i>
                    <div className="portal-title">
                        <h1>Shwan Aligner Portal</h1>
                        <div className="portal-subtitle">Doctor Access</div>
                    </div>
                </div>
                <div className="portal-doctor-info">
                    <span className="doctor-name">
                        <i className="fas fa-user-md"></i> Dr. {doctor?.doctor_name}
                    </span>
                    <button className="logout-btn" onClick={handleLogout}>
                        <i className="fas fa-sign-out-alt"></i>
                        Logout
                    </button>
                </div>
            </div>
        </header>
    );
};

export default PortalHeader;
