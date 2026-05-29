import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RootErrorBoundary } from '@/components/RootErrorBoundary';
import { installNotificationOpenHandler } from '@/lib/notificationRouting';
import './index.css';

if (typeof window !== 'undefined') {
  installNotificationOpenHandler();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
