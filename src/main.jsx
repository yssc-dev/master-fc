import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './components/common/ErrorBoundary';
import Root from './Root';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>
);
