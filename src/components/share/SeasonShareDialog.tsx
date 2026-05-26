import { SeasonOverviewCard } from '@/components/share/SeasonOverviewCard';
import { ShareBackgroundPicker } from '@/components/share/ShareBackgroundPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { captureElementAsPng, sharePngBlob } from '@/lib/shareCardImage';
import { fetchSeasonShareStats, type SeasonShareStats } from '@/lib/seasonShareStats';
import { Loader2, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const PREVIEW_SCALE = 0.28;

type SeasonShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteId: string | null;
};

export function SeasonShareDialog({ open, onOpenChange, athleteId }: SeasonShareDialogProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<SeasonShareStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !athleteId) return;
    setBackgroundImageUrl(null);
    setLoading(true);
    void fetchSeasonShareStats(athleteId)
      .then((data) => setStats(data))
      .catch(() => {
        setStats(null);
        toast.error('Could not load season stats for your card.');
      })
      .finally(() => setLoading(false));
  }, [open, athleteId]);

  async function handleShare() {
    const el = captureRef.current;
    if (!el || !stats) return;
    setSharing(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const blob = await captureElementAsPng(el);
      await sharePngBlob(blob, 'rnkx-season-card.png', 'My RNKX Season');
      toast.success('Card ready to share');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error('Could not share card. Try again.');
    } finally {
      setSharing(false);
    }
  }

  const previewHeight = Math.round(1920 * PREVIEW_SCALE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto border-border bg-[hsla(0,0%,8%,1)] p-5 sm:max-w-md sm:p-6">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="type-page-title text-neon-lime">
            Season overview card
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            Portrait 9:16 for Stories. Pick a photo background or use the default RNKX gradient.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Building your card…
          </p>
        ) : !stats ? (
          <p className="text-sm text-destructive">Could not load card data.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div
              className="relative mx-auto overflow-hidden rounded-xl border border-border/80 bg-black shadow-inner"
              style={{ height: previewHeight, width: '100%', maxWidth: 1080 * PREVIEW_SCALE }}
            >
              <div
                className="absolute left-1/2 top-0 origin-top"
                style={{
                  transform: `translateX(-50%) scale(${PREVIEW_SCALE})`,
                  width: 1080,
                  height: 1920,
                }}
              >
                <SeasonOverviewCard stats={stats} backgroundImageUrl={backgroundImageUrl} />
              </div>
            </div>

            <div className="pointer-events-none fixed left-[-10000px] top-0 opacity-0" aria-hidden>
              <div ref={captureRef}>
                <SeasonOverviewCard stats={stats} backgroundImageUrl={backgroundImageUrl} />
              </div>
            </div>

            <ShareBackgroundPicker
              backgroundImageUrl={backgroundImageUrl}
              onBackgroundChange={setBackgroundImageUrl}
              disabled={sharing}
            />

            <Button
              type="button"
              className="h-11 w-full bg-neon-lime font-semibold text-black hover:bg-neon-lime/90"
              disabled={sharing}
              onClick={() => void handleShare()}
            >
              {sharing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Share2 className="mr-2 h-4 w-4" aria-hidden />
              )}
              Share card
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
