import React from 'react';
import ReactDOM from 'react-dom/client';
import ErrorBoundary from './components/common/ErrorBoundary';
import { ThemeProvider } from './hooks/useTheme';
import Root from './Root';
import './styles/app_tokens.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </ThemeProvider>
);
