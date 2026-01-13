/**
 * External Aligner Portal - React Router App
 *
 * Clean routing structure:
 * - / → Dashboard (all cases)
 * - /case/:workId → Case detail (sets, batches, notes)
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import Dashboard from './pages/Dashboard';
import CaseDetail from './pages/CaseDetail';

function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Dashboard - List of all cases */}
          <Route path="/" element={<Dashboard />} />

          {/* Case Detail - Individual case with sets, batches, notes */}
          <Route path="/case/:workId" element={<CaseDetail />} />

          {/* Redirect any unknown routes to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
