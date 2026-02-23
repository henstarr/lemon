import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const UI_THEME_STORAGE_KEY = 'lemon-ui-theme-mode';

function getInitialThemeMode() {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function RootShell() {
  const [themeMode, setThemeMode] = useState(getInitialThemeMode);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeMode;
    root.style.colorScheme = themeMode;
    document.body?.setAttribute('data-theme', themeMode);
    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, themeMode);
    } catch {
      // Ignore storage failures (private mode, etc).
    }
  }, [themeMode]);

  return (
    <>
      <button
        type="button"
        className="theme-mode-toggle"
        onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}
      >
        <span className="theme-mode-toggle-label">{themeMode === 'dark' ? 'DARK' : 'LIGHT'}</span>
        <span className={`theme-mode-toggle-knob ${themeMode === 'light' ? 'is-light' : ''}`} aria-hidden="true" />
      </button>
      <App />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootShell />
  </StrictMode>,
);
