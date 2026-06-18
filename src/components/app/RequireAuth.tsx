import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate } from 'react-router-dom';

type RequireAuthProps = {
  session: Session | null;
  profileComplete: boolean;
  children: ReactNode;
};

export function RequireAuth({ session, profileComplete, children }: RequireAuthProps) {
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  if (!profileComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}
