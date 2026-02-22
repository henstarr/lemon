import { useContext } from 'react';
import { AppContext } from './appContextValue';

export function useApp() {
  return useContext(AppContext);
}
