/**
 * External Aligner Portal - React Router App
 *
 * Clean routing structure:
 * - / → Dashboard (all cases)
 * - /new-case → New case submission form
 * - /case/:workId → Case detail (sets, batches, notes)
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/shared/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import NewCase from './pages/NewCase';
import CaseDetail from './pages/CaseDetail';

function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Dashboard - List of all cases */}
            <Route path="/" element={<Dashboard />} />

            {/* New Case - Doctor-submitted case (auto-creates records) */}
            <Route path="/new-case" element={<NewCase />} />

            {/* Case Detail - Individual case with sets, batches, notes */}
            <Route path="/case/:workId" element={<CaseDetail />} />

            {/* Redirect any unknown routes to dashboard */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
