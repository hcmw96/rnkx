import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import { initOneSignal } from '@/services/onesignal';
import './index.css';

void initOneSignal().catch((err) => console.warn('[OneSignal] init failed', err));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
