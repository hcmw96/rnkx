import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Activity, Heart, Clock, Shield, Zap, Trophy, Watch, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { haptic } from "@/lib/haptics";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  username: string;
  selectedLeague: string | null;
  selectedLeagues?: string[];
}

export function WelcomeModal({ open, onClose, username, selectedLeague, selectedLeagues = [] }: WelcomeModalProps) {
  // Support both old single league and new multi-league
  const leagues = selectedLeagues.length > 0 ? selectedLeagues : (selectedLeague ? [selectedLeague] : []);
  const isRunLeague = leagues.includes('run');
  const isEngineLeague = leagues.includes('engine');
  const showBothLeagues = isRunLeague && isEngineLeague;

  // Determine header gradient based on league(s)
  const headerGradient = showBothLeagues 
    ? 'bg-gradient-to-br from-secondary/20 to-primary/20' 
    : isRunLeague 
      ? 'bg-secondary/10' 
      : 'bg-primary/10';

  const iconColor = showBothLeagues ? 'text-primary' : isRunLeague ? 'text-secondary' : 'text-primary';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-0 bg-background max-h-[85vh] overflow-y-auto my-4">
        {/* Header */}
        <div className={`p-5 pb-3 ${headerGradient}`}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Trophy className={`h-5 w-5 ${iconColor}`} />
              <span className="text-sm font-medium text-muted-foreground">Welcome to RNKX</span>
            </div>
            <h2 className="text-2xl font-bold text-foreground">
              Hey {username}! 👋
            </h2>
            <p className="text-muted-foreground mt-1">
              Here's how to climb the ranks
            </p>
          </motion.div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* How You Score */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3"
          >
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              How You Score
            </h3>
            
            {isRunLeague && (
              <div className="bg-secondary/10 border border-secondary/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-secondary/20">
                    <Activity className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Faster pace = more points</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Your average pace determines points per minute
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 bg-background/50 rounded-lg px-2 py-1 inline-block">
                      Example: 5:00/km pace = 3.5 pts/min
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isEngineLeague && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Heart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Higher effort = more points</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Your average heart rate % determines points per minute
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 bg-background/50 rounded-lg px-2 py-1 inline-block">
                      Example: 85% max HR = 4.2 pts/min
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!isRunLeague && !isEngineLeague && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/20">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Effort = points</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Work harder and longer to earn more points
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Seasons Info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="space-y-3"
          >
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-violet-500" />
              Seasons
            </h3>
            
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
              <p className="text-sm text-muted-foreground">
                All leagues run in <span className="text-foreground font-medium">6–8-week seasons</span>. Rankings reset and update weekly.
              </p>
            </div>
          </motion.div>

          {/* Stay Fair */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3"
          >
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" />
              Stay Fair
            </h3>
            
            <div className="grid gap-2">
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="text-muted-foreground">Activities must be <span className="text-foreground font-medium">15+ minutes</span></span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Zap className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-muted-foreground">Max <span className="text-foreground font-medium">2 scored activities</span> per day</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Watch className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-muted-foreground">Data is pulled from your <span className="text-foreground font-medium">wearable</span> automatically</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Activity className="h-4 w-4 text-violet-400 shrink-0" />
                <span className="text-muted-foreground">Select your <span className="text-foreground font-medium">activity type</span> before each workout</span>
              </div>
            </div>
          </motion.div>

          {/* Pro Tip */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4"
          >
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-amber-500/20">
                <Trophy className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">Pro Tip</p>
                <p className="text-sm text-muted-foreground">
                  Train consistently each week to earn <span className="text-amber-500 font-medium">bonus points!</span>
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-0">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Button 
              onClick={() => { haptic('light'); onClose(); }} 
              className="w-full h-12 text-base font-semibold"
              size="lg"
            >
              Got it, let's go! 🚀
            </Button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}