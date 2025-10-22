// Placeholder context - audio feature temporarily disabled
import { createContext, useContext, ReactNode } from 'react';

const SpokenTextContext = createContext<any>(null);

export function SpokenTextProvider({ children }: { children: ReactNode }) {
  return <SpokenTextContext.Provider value={null}>{children}</SpokenTextContext.Provider>;
}

export function useSpokenText() {
  return useContext(SpokenTextContext);
}
