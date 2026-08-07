import { Button } from '@/components/ui/button';
import { ImagePlus, Sparkles } from 'lucide-react';
import { useRef } from 'react';
import { readImageFileAsDataUrl } from '@/lib/shareCardImage';
import { cn } from '@/lib/utils';

type ShareBackgroundPickerProps = {
  backgroundImageUrl: string | null;
  onBackgroundChange: (url: string | null) => void;
  disabled?: boolean;
  /** When false, only the RNKX background control is shown. */
  allowLibraryPhoto?: boolean;
};

/**
 * Background toggle for share cards.
 * Photo pick uses a plain `<input type="file" accept="image/*">` — Despia routes
 * that to the native gallery; web uses the browser file picker. No despia:// bridge.
 */
export function ShareBackgroundPicker({
  backgroundImageUrl,
  onBackgroundChange,
  disabled,
  allowLibraryPhoto = true,
}: ShareBackgroundPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const usingRnkxBackground = backgroundImageUrl == null;

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear so the same file can be re-selected later.
    e.target.value = '';
    if (!file) {
      // Cancel / empty selection → stay on a valid card (RNKX), never blank.
      onBackgroundChange(null);
      return;
    }
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      onBackgroundChange(dataUrl);
    } catch {
      onBackgroundChange(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {allowLibraryPhoto ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-hidden
            onChange={(e) => void onFileChange(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'flex-1 border-border',
              !usingRnkxBackground &&
                'border-neon-lime/40 bg-neon-lime/10 text-neon-lime hover:bg-neon-lime/15 hover:text-neon-lime',
            )}
            disabled={disabled}
            aria-pressed={!usingRnkxBackground}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
            Use photo from library
          </Button>
        </>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          allowLibraryPhoto ? 'flex-1 border-border' : 'w-full border-border',
          usingRnkxBackground &&
            'border-neon-lime/40 bg-neon-lime/10 text-neon-lime hover:bg-neon-lime/15 hover:text-neon-lime',
        )}
        disabled={disabled || usingRnkxBackground}
        onClick={() => onBackgroundChange(null)}
        aria-pressed={usingRnkxBackground}
      >
        <Sparkles className="mr-2 h-4 w-4 text-neon-lime" aria-hidden />
        Use RNKX background
      </Button>
    </div>
  );
}
