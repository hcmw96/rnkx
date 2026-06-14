import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { PremiumGate } from '@/components/PremiumGate';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';

type ChatPremiumGateProps = {
  children: ReactNode;
  /** Sample inbox when the live thread list would be empty. */
  previewContent?: ReactNode;
};

/** Messaging is a Premium feature — teaser shows inbox UI behind a light scrim. */
export function ChatPremiumGate({ children, previewContent }: ChatPremiumGateProps) {
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [athleteId, setAthleteId] = useState<string | undefined>();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      setAuthUserId(uid);
      if (uid) {
        setAthleteId(await resolveAthleteId(uid));
      }
    })();
  }, []);

  return (
    <PremiumGate
      athleteId={athleteId}
      userId={authUserId}
      title="Social and Chat"
      description="Direct and group chat are included with RNKX Premium."
      previewContent={previewContent}
    >
      {children}
    </PremiumGate>
  );
}
