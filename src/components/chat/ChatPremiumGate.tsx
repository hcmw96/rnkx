import { useAthleteSession } from '@/context/AthleteSessionContext';
import { PremiumGate } from '@/components/PremiumGate';

type ChatPremiumGateProps = {
  children: React.ReactNode;
  /** Sample inbox when the live thread list would be empty. */
  previewContent?: React.ReactNode;
};

/** Messaging is a Premium feature — teaser shows inbox UI behind a light scrim. */
export function ChatPremiumGate({ children, previewContent }: ChatPremiumGateProps) {
  const { authUserId, athleteId } = useAthleteSession();

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
