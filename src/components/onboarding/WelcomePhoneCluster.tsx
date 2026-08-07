import type { ReactNode } from 'react';
import { AthleteAvatarImg } from '@/components/AthleteAvatarImg';
import { WELCOME_ENGINE_LEADERBOARD_ROWS } from '@/data/mockAthletes';
import { cn } from '@/lib/utils';

function PhoneShell({
  className,
  children,
  depth = 'front',
}: {
  className?: string;
  children: ReactNode;
  depth?: 'back' | 'front';
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.35rem] border border-white/15 bg-[hsla(0,0%,6%,1)]',
        depth === 'front'
          ? 'shadow-[0_28px_60px_-16px_rgba(0,0,0,0.85)]'
          : 'shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]',
        className,
      )}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-1.5">
        <span className="h-1 w-10 rounded-full bg-white/20" />
      </div>
      <div className="h-full overflow-hidden pt-3">{children}</div>
    </div>
  );
}

function PhoneNav({ active }: { active: 'dashboard' | 'leaderboard' | 'social' }) {
  const items = [
    { id: 'dashboard' as const, label: 'Home' },
    { id: 'leaderboard' as const, label: 'Board' },
    { id: 'social' as const, label: 'Social' },
    { id: 'profile' as const, label: 'You' },
  ];
  return (
    <div className="mt-auto flex items-center justify-around border-t border-white/10 bg-black/60 px-1 py-1.5">
      {items.map((item) => (
        <span
          key={item.id}
          className={cn(
            'text-[7px] font-semibold uppercase tracking-wide',
            item.id === active ? 'text-secondary' : 'text-white/35',
          )}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

function DashboardScreen() {
  return (
    <div className="flex h-full flex-col bg-[hsla(0,0%,5%,1)] px-2 pb-1 pt-1">
      <p className="text-[8px] font-bold tracking-wide text-neon-lime">RNKX</p>
      <div className="mt-1.5 rounded-md border border-white/10 bg-[hsla(0,0%,9%,1)] p-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-semibold text-white/80">Engine · Open</span>
          <span className="text-[7px] font-bold text-neon-lime">#12</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[62%] rounded-full bg-neon-lime" />
        </div>
        <p className="mt-1 text-[6px] text-white/45">DAY 22 / 42</p>
      </div>
      <p className="mt-2 text-[7px] font-semibold uppercase tracking-wider text-white/50">Momentum</p>
      <div className="relative mt-1 h-14 overflow-hidden rounded-md border border-white/8 bg-[hsla(0,0%,8%,1)]">
        <svg viewBox="0 0 120 48" className="h-full w-full" preserveAspectRatio="none">
          <path
            d="M0 40 C18 38 22 18 36 16 C50 14 54 28 68 24 C82 20 90 8 104 10 C112 11 116 18 120 16 L120 48 L0 48 Z"
            fill="hsl(72 100% 50% / 0.28)"
          />
          <path
            d="M0 40 C18 38 22 18 36 16 C50 14 54 28 68 24 C82 20 90 8 104 10 C112 11 116 18 120 16"
            fill="none"
            stroke="hsl(72 100% 50%)"
            strokeWidth="1.5"
          />
          <path
            d="M0 42 C20 40 28 30 44 28 C60 26 66 34 80 30 C94 26 102 18 120 22"
            fill="none"
            stroke="hsl(186 100% 50%)"
            strokeWidth="1.5"
            opacity="0.9"
          />
        </svg>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-0.5 rounded-md bg-white/5 p-0.5">
        {['Score', 'Volume', 'Eff'].map((tab, i) => (
          <span
            key={tab}
            className={cn(
              'rounded py-0.5 text-center text-[6px] font-semibold',
              i === 0 ? 'bg-white/15 text-white' : 'text-white/40',
            )}
          >
            {tab}
          </span>
        ))}
      </div>
      <PhoneNav active="dashboard" />
    </div>
  );
}

function LeaderboardScreen() {
  const rows = WELCOME_ENGINE_LEADERBOARD_ROWS.slice(0, 5).map((row, i) => {
    // Match design usernames where possible; keep real avatars from mock data.
    const labels = ['jakewilliams', 'alexmontgomery', 'tomashbury', 'sophiechen', 'liamcarter'];
    return { ...row, displayName: labels[i] ?? row.displayName };
  });

  return (
    <div className="flex h-full flex-col bg-[hsla(0,0%,5%,1)] px-2 pb-1 pt-1">
      <div className="rounded border border-neon-lime/50 px-1.5 py-0.5 text-center text-[6px] font-semibold text-neon-lime">
        Season 1 is LIVE · Spring 2026
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1">
        <span className="rounded-md bg-neon-lime py-1 text-center text-[8px] font-bold text-black">
          ENGINE
        </span>
        <span className="rounded-md border border-white/15 py-1 text-center text-[8px] font-bold text-white/70">
          RUN
        </span>
      </div>
      <div className="mt-1.5 flex gap-1 overflow-hidden">
        {['Open', 'Overall', 'Friends'].map((f, i) => (
          <span
            key={f}
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[6px] font-semibold',
              i === 0 ? 'bg-white/15 text-white' : 'text-white/40',
            )}
          >
            {f}
          </span>
        ))}
      </div>
      <ul className="mt-1.5 min-h-0 flex-1 space-y-1 overflow-hidden">
        {rows.map((row) => (
          <li key={row.rank} className="flex items-center gap-1.5">
            <span className="w-2.5 text-[7px] font-bold tabular-nums text-white/55">{row.rank}</span>
            <div className="h-4 w-4 shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/10">
              <AthleteAvatarImg avatarUrl={row.avatarUrl} league="engine" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[7px] font-semibold text-white">{row.displayName}</p>
              <p className="truncate text-[5px] text-white/40">United Kingdom</p>
            </div>
            <span className="text-[7px] font-bold tabular-nums text-neon-lime">{row.score}</span>
          </li>
        ))}
      </ul>
      <PhoneNav active="leaderboard" />
    </div>
  );
}

function ClubsScreen() {
  const clubs = [
    { name: 'London Run Club', members: '128 members' },
    { name: 'Hyde Park Crew', members: '64 members' },
    { name: 'Iron Engine', members: '41 members' },
  ];

  return (
    <div className="flex h-full flex-col bg-[hsla(0,0%,5%,1)] px-2 pb-1 pt-1">
      <div className="grid grid-cols-2 gap-1">
        <span className="rounded-md bg-white/12 py-1 text-center text-[8px] font-bold text-white">
          Clubs
        </span>
        <span className="rounded-md py-1 text-center text-[8px] font-semibold text-white/40">
          Discover
        </span>
      </div>
      <div className="mt-1.5 rounded-md bg-neon-lime py-1.5 text-center text-[8px] font-bold text-black">
        + New Club
      </div>
      <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-hidden">
        {clubs.map((club) => (
          <li
            key={club.name}
            className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[hsla(0,0%,9%,1)] px-1.5 py-1.5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-neon-lime/20 text-[8px] font-bold text-neon-lime">
              ◆
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[7px] font-semibold text-white">{club.name}</p>
              <p className="text-[5px] text-white/40">{club.members}</p>
            </div>
          </li>
        ))}
      </ul>
      <PhoneNav active="social" />
    </div>
  );
}

/** Three overlapping phone mockups — dashboard / leaderboard / clubs. */
export function WelcomePhoneCluster({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative mx-auto aspect-[5/4] w-full max-w-[380px]', className)}
      aria-hidden
    >
      {/* Left — Dashboard */}
      <PhoneShell
        depth="back"
        className="absolute left-[2%] top-[10%] z-[1] h-[88%] w-[42%] -rotate-[8deg] opacity-95"
      >
        <DashboardScreen />
      </PhoneShell>

      {/* Right — Clubs */}
      <PhoneShell
        depth="back"
        className="absolute right-[2%] top-[10%] z-[1] h-[88%] w-[42%] rotate-[8deg] opacity-95"
      >
        <ClubsScreen />
      </PhoneShell>

      {/* Center — Leaderboard (front) */}
      <PhoneShell
        depth="front"
        className="absolute left-1/2 top-0 z-[2] h-full w-[48%] -translate-x-1/2"
      >
        <LeaderboardScreen />
      </PhoneShell>
    </div>
  );
}
