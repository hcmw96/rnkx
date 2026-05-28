import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import { isDespiaNative } from '@/services/onesignal';
import './index.css';

if (typeof window !== 'undefined' && isDespiaNative()) {
  window.onNotificationEvent = (payload: {
    type?: string;
    path?: string;
    url?: string;
    metadata?: unknown;
  }) => {
    if (payload?.path) {
      window.history.pushState({}, '', payload.path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
