/** Aggregated per-emoji row from chat threads */
export type MessageReactionSummary = {
  emoji: string;
  count: number;
  myReaction: boolean;
};

type MessageReactionProps = {
  messageId: string;
  athleteId: string;
  reactions: MessageReactionSummary[];
  isMine: boolean;
  onToggle: () => void;
};

/** Stub — reactions UI not implemented yet */
export function MessageReaction(_props: MessageReactionProps) {
  return null;
}
