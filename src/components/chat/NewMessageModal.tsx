type NewMessageModalProps = {
  open: boolean;
  onClose: () => void;
  myAthleteId: string;
  existingDmFriendIds: string[];
  onSelect: (friendId: string) => void;
};

/** Stub — full new-message UI not implemented yet */
export function NewMessageModal(_props: NewMessageModalProps) {
  return null;
}
