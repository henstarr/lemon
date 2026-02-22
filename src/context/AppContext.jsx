import { useState, useCallback } from 'react';
import { AppContext } from './appContextValue';

export function AppProvider({ children }) {
  const [service, setService] = useState(null);
  const [visualizerMode, setVisualizerMode] = useState('nebula');
  const [colorTheme, setColorTheme] = useState('cosmic');
  const [sensitivity, setSensitivity] = useState(1.0);
  const [bloom, setBloom] = useState(0.7);
  const [speed, setSpeed] = useState(1.0);

  const connect = useCallback((svc) => setService(svc), []);
  const disconnect = useCallback(() => setService(null), []);

  return (
    <AppContext.Provider value={{
      service, connect, disconnect,
      visualizerMode, setVisualizerMode,
      colorTheme, setColorTheme,
      sensitivity, setSensitivity,
      bloom, setBloom,
      speed, setSpeed,
    }}>
      {children}
    </AppContext.Provider>
  );
}
