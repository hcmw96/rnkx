import { Button } from '@/components/ui/button';
import { ImagePlus, Sparkles } from 'lucide-react';
import { useRef } from 'react';
import { readImageFileAsDataUrl } from '@/lib/shareCardImage';

type ShareBackgroundPickerProps = {
  backgroundImageUrl: string | null;
  onBackgroundChange: (url: string | null) => void;
  disabled?: boolean;
};

export function ShareBackgroundPicker({
  backgroundImageUrl,
  onBackgroundChange,
  disabled,
}: ShareBackgroundPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      onBackgroundChange(dataUrl);
    } catch {
      onBackgroundChange(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
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
        className="flex-1 border-border"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
        Photo from library
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="flex-1 border-border"
        disabled={disabled || !backgroundImageUrl}
        onClick={() => onBackgroundChange(null)}
      >
        <Sparkles className="mr-2 h-4 w-4 text-neon-lime" aria-hidden />
        Default gradient
      </Button>
    </div>
  );
}
