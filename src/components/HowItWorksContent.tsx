import { Activity, Heart, Trophy } from 'lucide-react';

/** Scoring rules & fair play — shared by Welcome modal and How it works page */
export function HowItWorksScrollBody() {
  return (
    <div className="mx-auto max-w-lg space-y-8 pb-6">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-zinc-300">
          <span aria-hidden className="text-[#ADFF2F]">
            ⚡
          </span>
          HOW YOU SCORE
        </h2>

        <div className="space-y-3">
          <div className="rounded-xl border border-teal-800/60 bg-gradient-to-br from-teal-950 to-zinc-950 p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 ring-1 ring-teal-500/30">
                <Activity className="h-5 w-5 text-teal-300" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h3 className="font-semibold text-teal-50">Faster pace = more points</h3>
                <p className="text-sm text-teal-100/75">Your average pace determines points per minute</p>
                <span className="mt-2 inline-flex rounded-full border border-teal-700/40 bg-black/35 px-3 py-1 text-xs font-medium text-teal-200">
                  Example: 5:00/km pace = 3.5 pts/min
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-green-900/70 bg-gradient-to-br from-green-950 to-zinc-950 p-4 shadow-sm">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-500/15 ring-1 ring-green-500/35">
                <Heart className="h-5 w-5 text-green-300" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h3 className="font-semibold text-green-50">Higher effort = more points</h3>
                <p className="text-sm text-green-100/75">Your average heart rate % determines points per minute</p>
                <span className="mt-2 inline-flex rounded-full border border-green-800/45 bg-black/35 px-3 py-1 text-xs font-medium text-green-100">
                  Example: 85% max HR = 4.2 pts/min
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-zinc-300">
          <span className="text-base" aria-hidden>
            📅
          </span>
          SEASONS
        </h2>
        <div className="rounded-xl border border-purple-900/60 bg-gradient-to-br from-purple-950 to-zinc-950 p-4 text-sm text-purple-100/85">
          <p>
            All leagues run in <span className="font-bold text-purple-50">6–8-week seasons.</span> Rankings reset and
            update weekly.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-zinc-300">
          <span className="text-base" aria-hidden>
            🛡️
          </span>
          STAY FAIR
        </h2>
        <ul className="space-y-3 text-sm text-zinc-200">
          <li className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5">
            <span className="select-none pt-px text-base" aria-hidden>
              ⏱
            </span>
            <span>Activities must be 15+ minutes</span>
          </li>
          <li className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5">
            <span className="select-none pt-px text-base" aria-hidden>
              ⚡
            </span>
            <span>Max 2 scored activities per day</span>
          </li>
          <li className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5">
            <span className="select-none pt-px text-base" aria-hidden>
              🎯
            </span>
            <span>Data is pulled from your wearable automatically</span>
          </li>
          <li className="flex gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-3 py-2.5">
            <span className="select-none pt-px text-base" aria-hidden>
              〰️
            </span>
            <span>Select your activity type before each workout</span>
          </li>
        </ul>

        <div className="rounded-xl border border-orange-900/70 bg-gradient-to-br from-orange-950/95 to-zinc-950 p-4">
          <div className="flex gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-500/20 ring-1 ring-orange-400/35">
              <Trophy className="h-5 w-5 text-amber-300" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="font-display text-xs uppercase tracking-wider text-orange-200/90">Pro Tip</p>
              <p className="text-sm text-orange-50/95">
                Train consistently each week to earn <span className="font-semibold text-[#FBBF24]">bonus points</span>
                !
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
