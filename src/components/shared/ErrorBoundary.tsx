/**
 * ErrorBoundary - last-resort catch for render-time crashes so a bug in one
 * screen doesn't white-screen the whole portal. This repo has no backend of
 * its own (Supabase only) and no client-error reporting endpoint like the
 * main app's /api/client-error, so this only contains the failure and offers
 * a way back — it doesn't attempt to log anywhere.
 */

import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  // Full reload rather than SPA navigation: after a render-tree crash the
  // in-memory app state can't be trusted, so this mirrors the logout pattern
  // elsewhere in this codebase (a deliberate window.location exception for a
  // drastic reset, not a routine internal link).
  private handleReload = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="portal-container">
          <div className="error-container">
            <i className="fas fa-exclamation-triangle"></i>
            <h2>Something went wrong</h2>
            <p>An unexpected error occurred. Please try reloading the page.</p>
            <button
              className="logout-btn"
              onClick={this.handleReload}
              style={{ marginTop: '1.5rem' }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
