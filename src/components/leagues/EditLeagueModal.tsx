import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, Globe, Loader2, Lock } from 'lucide-react';
import { resolveAthleteId } from '@/lib/resolveAthleteId';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

type ClubVisibility = 'private' | 'public';

interface EditLeagueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  league: {
    id: string;
    name: string;
    image_url: string | null;
    is_public?: boolean | null;
  };
  onSaved: () => void;
}

export function EditLeagueModal({ open, onOpenChange, league, onSaved }: EditLeagueModalProps) {
  const [name, setName] = useState(league.name);
  const [visibility, setVisibility] = useState<ClubVisibility>(league.is_public ? 'public' : 'private');
  const [imagePreview, setImagePreview] = useState<string | null>(league.image_url);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(league.name);
      setVisibility(league.is_public ? 'public' : 'private');
      setImagePreview(league.image_url);
      setImageFile(null);
    }
  }, [open, league]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large (max 5MB)');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error('Not signed in');
        return;
      }
      const athleteId = await resolveAthleteId(user.id);
      if (!athleteId) {
        toast.error('Complete profile before editing clubs');
        return;
      }

      let imageUrl = league.image_url;

      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const path = `${athleteId}/league-${league.id}-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, imageFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const { data: updated, error } = await supabase
        .from('private_leagues')
        .update({
          name: name.trim(),
          image_url: imageUrl,
          is_public: visibility === 'public',
        })
        .eq('id', league.id)
        .eq('created_by', athleteId)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!updated?.id) {
        throw new Error('Could not save club changes (permission denied or club not found).');
      }
      toast.success('Club updated');
      onSaved();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Club</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-muted"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6 text-muted-foreground" />
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </div>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          </div>

          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Club name" />
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex rounded-xl bg-muted/90 p-1">
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setVisibility('private');
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  visibility === 'private'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Lock className="h-4 w-4 shrink-0" aria-hidden />
                Private
              </button>
              <button
                type="button"
                onClick={() => {
                  haptic('light');
                  setVisibility('public');
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  visibility === 'public'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Globe className="h-4 w-4 shrink-0" aria-hidden />
                Public
              </button>
            </div>
          </div>

          <Button type="button" onClick={() => void handleSave()} disabled={loading || !name.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
