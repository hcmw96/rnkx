import { createContext, useContext } from 'react';

export const ProfileGateContext = createContext<{ refetchProfile: () => Promise<void> } | null>(null);

export function useProfileGate() {
  const ctx = useContext(ProfileGateContext);
  if (!ctx) {
    throw new Error('useProfileGate must be used within ProfileGateContext.Provider');
  }
  return ctx;
}
