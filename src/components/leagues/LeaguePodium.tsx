import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PodiumMember {
  id: string;
  username: string;
  avatar_url: string | null;
  score: number;
  rank: number;
}

interface LeaguePodiumProps {
  members: PodiumMember[];
  leagueType: 'engine' | 'run';
}

const podiumOrder = [1, 0, 2]; // 2nd, 1st, 3rd
const podiumHeights = ['h-20', 'h-28', 'h-16'];
const podiumColors = [
  'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
  'from-slate-300/20 to-slate-400/10 border-slate-400/30',
  'from-amber-700/20 to-amber-800/10 border-amber-700/30',
];
const rankEmoji = ['🥇', '🥈', '🥉'];

export function LeaguePodium({ members, leagueType }: LeaguePodiumProps) {
  if (members.length < 3) return null;

  const top3 = members.slice(0, 3);
  // Display order: 2nd | 1st | 3rd
  const display = [top3[1], top3[0], top3[2]];

  return (
    <div className="flex items-end justify-center gap-2 py-4">
      {display.map((member, displayIdx) => {
        const actualRank = podiumOrder[displayIdx]; // 0=gold, 1=silver, 2=bronze
        return (
          <motion.div
            key={member.id}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: displayIdx * 0.15, duration: 0.4, type: 'spring', bounce: 0.3 }}
            className="flex max-w-[110px] flex-1 flex-col items-center gap-1.5"
          >
            <div className="relative">
              <div
                className={cn(
                  'flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-muted ring-2',
                  actualRank === 0 ? 'ring-yellow-500' : actualRank === 1 ? 'ring-slate-400' : 'ring-amber-700',
                )}
              >
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">
                    {member.username.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="absolute -right-1 -top-1 text-sm">{rankEmoji[actualRank]}</span>
            </div>
            <span className="max-w-full truncate text-xs font-medium text-foreground">{member.username}</span>
            <span
              className={cn(
                'font-display text-xs font-bold',
                leagueType === 'engine' ? 'text-primary' : 'text-secondary',
              )}
            >
              {member.score.toLocaleString()}
            </span>
            <div
              className={cn(
                'w-full rounded-t-lg border border-b-0 bg-gradient-to-t',
                podiumColors[actualRank],
                podiumHeights[actualRank],
              )}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
