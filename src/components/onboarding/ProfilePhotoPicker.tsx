import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ProfilePhotoPickerProps = {
  file: File | null;
  onFile: (file: File | null) => void;
};

export default function ProfilePhotoPicker({ file, onFile }: ProfilePhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!next) return;
    if (!next.type.startsWith('image/')) return;
    onFile(next);
  };

  return (
    <div className="flex flex-col items-center gap-5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={onPick}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-neon-lime/50 bg-muted transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={file ? 'Change profile photo' : 'Add profile photo'}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <Camera className="h-8 w-8" aria-hidden />
            <span className="text-xs font-medium">Add photo</span>
          </span>
        )}
      </button>
      <Button type="button" variant="outline" className="font-semibold" onClick={() => inputRef.current?.click()}>
        {file ? 'Change photo' : 'Choose photo'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">Required — this is how you appear on leaderboards.</p>
    </div>
  );
}
