/** Sample UI shown behind PremiumGate scrims when the live view would be empty. */
import { MessageCircle, Users } from 'lucide-react';
import { InsightsPreviewChart } from '@/components/insights/DashboardInsights';

export function InsightsPreview() {
  return <InsightsPreviewChart />;
}

const MOCK_ROWS = [
  { name: 'Alex K.', initials: 'A', pts: '1,842' },
  { name: 'Jamie L.', initials: 'J', pts: '1,695' },
  { name: 'Sam R.', initials: 'S', pts: '1,521' },
  { name: 'Taylor M.', initials: 'T', pts: '1,408' },
] as const;

export function SocialPreview() {
  return (
    <div className="bg-zinc-950">
      <div className="grid grid-cols-3 border-y border-border" aria-hidden>
        {(['Friends', 'Clubs', 'Discover'] as const).map((label, i) => (
          <div
            key={label}
            className={`flex flex-col items-center gap-1 py-3 text-xs font-medium ${
              i === 0 ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'
            }`}
          >
            <div className="h-5 w-5 rounded bg-muted/60" />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <FriendsPreview />
    </div>
  );
}

const MOCK_CHATS = [
  { name: 'Alex K.', message: 'Great session today — new PB!', time: '2h', dm: true },
  { name: 'London Run Club', message: 'See you at the Saturday tempo.', time: '5h', dm: false },
  { name: 'Jamie L.', message: 'Are you racing this weekend?', time: '1d', dm: true },
] as const;

export function ChatPreview() {
  return (
    <div className="space-y-2 bg-card px-3 py-4">
      {MOCK_CHATS.map((chat) => (
        <div
          key={chat.name}
          className="flex items-center gap-3 rounded-lg border border-border bg-zinc-900/80 p-3"
          aria-hidden
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
            {chat.dm ? (
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Users className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-28 rounded bg-muted/80" />
              <div className="h-3 w-8 rounded bg-muted/40" />
            </div>
            <div className="mt-1.5 h-3 w-full max-w-[12rem] rounded bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

const MOCK_CLUBS = [
  { name: 'Hybrid Athletes', type: 'Engine', members: 12 },
  { name: 'London Run Club', type: 'Run', members: 28 },
] as const;

export function ClubsPreview() {
  return (
    <ul className="space-y-2 px-3 py-4">
      {MOCK_CLUBS.map((club) => (
        <li
          key={club.name}
          className="rounded-xl border border-border bg-zinc-900/80 p-4"
          aria-hidden
        >
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-muted/60" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-muted/80" />
              <div className="h-3 w-24 rounded bg-muted/50" />
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-primary/20" />
                <div className="h-5 w-20 rounded-full bg-muted/40" />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function JoinClubPreview() {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      <div className="h-11 w-full rounded-lg bg-neon-lime/25" />
    </div>
  );
}

export function FriendsPreview() {
  return (
    <div className="space-y-2 bg-card px-3 py-4">
      {MOCK_ROWS.map((row, i) => (
        <div
          key={`${row.name}-${i}`}
          className="flex items-center gap-3 rounded-lg border border-border bg-zinc-900/80 p-3"
          aria-hidden
        >
          <span className="type-rank w-8 shrink-0 text-center text-muted-foreground">{i + 1}</span>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
            {row.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-4 w-28 rounded bg-muted/80" />
            <div className="mt-1.5 h-3 w-20 rounded bg-muted/50" />
          </div>
          <div className="shrink-0 pr-2 text-right">
            <div className="h-6 w-14 rounded bg-muted/70" />
            <div className="mt-1 h-3 w-6 rounded bg-muted/40" />
          </div>
        </div>
      ))}
    </div>
  );
}
