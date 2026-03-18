import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext } from './appContextValue';
import { serviceRequiresAuth } from '../config/services';

const STORAGE_KEY = 'lemon-app-state-v2';

function loadInitialState() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AppProvider({ children }) {
  const initial = typeof window !== 'undefined' ? loadInitialState() : null;
  const [service, setService] = useState(initial?.service ?? null);
  const [pendingService, setPendingService] = useState(initial?.pendingService ?? null);
  const [authByService, setAuthByService] = useState(initial?.authByService ?? {});
  const [authError, setAuthError] = useState(initial?.authError ?? null);
  const [localAudioFile, setLocalAudioFileState] = useState(null);
  const [visualizerMode, setVisualizerMode] = useState('nebula');
  const [colorTheme, setColorTheme] = useState('cosmic');
  const [sensitivity, setSensitivity] = useState(1.0);
  const [bloom, setBloom] = useState(0.7);
  const [speed, setSpeed] = useState(1.0);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ service, pendingService, authByService, authError })
      );
    } catch {
      // Ignore storage failures in private/incognito modes.
    }
  }, [service, pendingService, authByService, authError]);

  const connect = useCallback((svc) => {
    setService(svc);
    setPendingService(null);
    setAuthError(null);
  }, []);

  const beginConnect = useCallback((svc) => {
    setPendingService(svc);
    setAuthError(null);
  }, []);

  const finishOAuthConnect = useCallback((svc, authPayload) => {
    setAuthByService((prev) => ({
      ...prev,
      [svc]: {
        ...authPayload,
        connectedAt: Date.now(),
      },
    }));
    setService(svc);
    setPendingService(null);
    setAuthError(null);
  }, []);

  const failConnect = useCallback((svc, message) => {
    setPendingService(svc ?? null);
    setAuthError(message || 'Connection failed');
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const disconnect = useCallback(() => {
    setLocalAudioFileState((prev) => {
      if (prev?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(prev.url); } catch { /* noop */ }
      }
      return null;
    });
    setService(null);
    setPendingService(null);
    setAuthError(null);
  }, []);

  const setLocalAudioFile = useCallback((file) => {
    setLocalAudioFileState((prev) => {
      if (prev?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(prev.url); } catch { /* noop */ }
      }
      return file;
    });
  }, []);

  const clearLocalAudioFile = useCallback(() => {
    setLocalAudioFileState((prev) => {
      if (prev?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(prev.url); } catch { /* noop */ }
      }
      return null;
    });
  }, []);

  const isServiceReady = useCallback((svc) => {
    if (!svc) return false;
    if (!serviceRequiresAuth(svc)) return true;
    const auth = authByService?.[svc];
    return Boolean(auth?.accessToken || auth?.userToken);
  }, [authByService]);

  const value = useMemo(() => ({
    service,
    pendingService,
    authByService,
    authError,
    localAudioFile,
    connect,
    beginConnect,
    finishOAuthConnect,
    failConnect,
    clearAuthError,
    disconnect,
    setLocalAudioFile,
    clearLocalAudioFile,
    isServiceReady,
    visualizerMode, setVisualizerMode,
    colorTheme, setColorTheme,
    sensitivity, setSensitivity,
    bloom, setBloom,
    speed, setSpeed,
  }), [
    service,
    pendingService,
    authByService,
    authError,
    localAudioFile,
    connect,
    beginConnect,
    finishOAuthConnect,
    failConnect,
    clearAuthError,
    disconnect,
    setLocalAudioFile,
    clearLocalAudioFile,
    isServiceReady,
    visualizerMode,
    colorTheme,
    sensitivity,
    bloom,
    speed,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
