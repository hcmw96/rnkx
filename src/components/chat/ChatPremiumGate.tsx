import { PremiumGate } from '@/components/PremiumGate';

type ChatPremiumGateProps = {
  children: React.ReactNode;
  /** Sample inbox when the live thread list would be empty. */
  previewContent?: React.ReactNode;
  /** Support threads stay reachable without Premium. */
  bypass?: boolean;
};

/** Messaging is a Premium feature — teaser shows inbox UI behind a light scrim. */
export function ChatPremiumGate({ children, previewContent, bypass }: ChatPremiumGateProps) {
  if (bypass) return <>{children}</>;
  return (
    <PremiumGate
      title="Social and Chat"
      description="Direct and group chat are included with RNKX Premium."
      previewContent={previewContent}
    >
      {children}
    </PremiumGate>
  );
}
