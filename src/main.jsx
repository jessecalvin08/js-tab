import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary.jsx';
import { DashboardProvider } from './context/DashboardContext.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DashboardProvider>
        <App />
      </DashboardProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
