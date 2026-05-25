import { ShareBackgroundPicker } from '@/components/share/ShareBackgroundPicker';
import { WorkoutShareCard } from '@/components/share/WorkoutShareCard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { captureElementAsPng, sharePngBlob } from '@/lib/shareCardImage';
import type { WorkoutSharePayload } from '@/types/shareCards';
import { Loader2, Share2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

const PREVIEW_SCALE = 0.28;

type WorkoutShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: WorkoutSharePayload | null;
};

export function WorkoutShareDialog({ open, onOpenChange, payload }: WorkoutShareDialogProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);

  async function handleShare() {
    const el = captureRef.current;
    if (!el || !payload) return;
    setSharing(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const blob = await captureElementAsPng(el);
      await sharePngBlob(blob, 'rnkx-workout-card.png', 'My RNKX Workout');
      toast.success('Card ready to share');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error('Could not share card. Try again.');
    } finally {
      setSharing(false);
    }
  }

  const previewHeight = Math.round(1920 * PREVIEW_SCALE);

  if (!payload) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setBackgroundImageUrl(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-border bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Workout scored!</DialogTitle>
          <DialogDescription>Share your result — portrait 9:16 for Stories.</DialogDescription>
        </DialogHeader>

        <div
          className="relative mx-auto overflow-hidden rounded-xl border border-border bg-zinc-950"
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
            <WorkoutShareCard payload={payload} backgroundImageUrl={backgroundImageUrl} />
          </div>
        </div>

        <div className="pointer-events-none fixed left-[-10000px] top-0 opacity-0" aria-hidden>
          <div ref={captureRef}>
            <WorkoutShareCard payload={payload} backgroundImageUrl={backgroundImageUrl} />
          </div>
        </div>

        <ShareBackgroundPicker
          backgroundImageUrl={backgroundImageUrl}
          onBackgroundChange={setBackgroundImageUrl}
          disabled={sharing}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 bg-neon-lime font-semibold text-zinc-950 hover:bg-neon-lime/90"
            disabled={sharing}
            onClick={() => void handleShare()}
          >
            {sharing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Share2 className="mr-2 h-4 w-4" aria-hidden />
            )}
            Share
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 border-border"
            disabled={sharing}
            onClick={() => onOpenChange(false)}
          >
            Dismiss
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
