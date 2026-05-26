import { useState, useRef } from 'react';
import { Activity, Camera, Heart, Lock, Plus, Globe } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';

interface CreateLeagueModalProps {
  athleteId: string;
  onCreated: () => void;
  triggerLabel?: string;
  triggerClassName?: string;
}

type ClubVisibility = 'private' | 'public';

const UPLOAD_TIMEOUT_MS = 25_000;

async function uploadClubImage(
  athleteId: string,
  leagueId: string,
  file: File,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const ext =
    file.name.split('.').pop()?.toLowerCase() ||
    (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');
  const path = `${athleteId}/league-${leagueId}.${ext}`;

  const uploadPromise = supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
  });

  const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
    setTimeout(() => resolve({ data: null, error: { message: 'Upload timed out' } }), UPLOAD_TIMEOUT_MS);
  });

  const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
  if (uploadError) {
    return { publicUrl: null, error: uploadError.message };
  }

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  return { publicUrl: pub.publicUrl, error: null };
}

export function CreateLeagueModal({
  athleteId,
  onCreated,
  triggerLabel = 'New Club',
  triggerClassName,
}: CreateLeagueModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<ClubVisibility>('private');
  const [leagueType, setLeagueType] = useState<'engine' | 'run'>('engine');
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setName('');
    setVisibility('private');
    setLeagueType('engine');
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setUploading(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error('Not signed in');
        return;
      }

      const { error: linkErr } = await supabase.rpc('ensure_athlete_user_id', {
        p_athlete_id: athleteId,
      });
      if (linkErr) throw new Error(`Profile link failed: ${linkErr.message}`);

      const { data: leagueId, error: createErr } = await supabase.rpc('create_private_club', {
        p_athlete_id: athleteId,
        p_name: name.trim(),
        p_league_type: leagueType,
        p_is_public: visibility === 'public',
        p_image_url: null,
      });
      if (createErr) throw new Error(createErr.message);
      if (!leagueId) throw new Error('Failed to create club');

      if (imageFile) {
        setUploading(true);
        const { publicUrl, error: uploadErr } = await uploadClubImage(athleteId, leagueId, imageFile);
        if (uploadErr || !publicUrl) {
          toast.error(uploadErr ?? 'Image upload failed — club was created without a photo.');
        } else {
          const { error: imageUpdateErr } = await supabase
            .from('private_leagues')
            .update({ image_url: publicUrl })
            .eq('id', leagueId);
          if (imageUpdateErr) {
            toast.error('Club created but photo could not be saved.');
          }
        }
      }

      toast.success(`"${name.trim()}" is ready!`);
      resetForm();
      setOpen(false);
      onCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create club';
      toast.error(msg);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className={cn(
            'gap-1 bg-primary text-primary-foreground hover:bg-primary/90',
            triggerClassName,
          )}
        >
          {triggerLabel.startsWith('+') ? null : <Plus className="h-4 w-4" />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle className="type-card-title">Create Club</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex justify-center">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-muted',
                'border-2 border-dashed border-border transition-colors hover:border-primary/50',
              )}
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Club" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6 text-muted-foreground" />
              )}
            </button>
          </div>

          <div>
            <Label htmlFor="league-name" className="text-foreground">
              Club name
            </Label>
            <Input
              id="league-name"
              placeholder="e.g. Morning Runners"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-foreground">Visibility</Label>
            <div className="mt-1 flex rounded-xl bg-muted/90 p-1">
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
            <p className="mt-1.5 text-xs text-muted-foreground">
              {visibility === 'private'
                ? 'Invite-only — members join with your club link.'
                : 'Discoverable — anyone can find and join this club.'}
            </p>
          </div>

          <div>
            <Label className="text-foreground">Scoring type</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLeagueType('engine')}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-3 transition-all',
                  leagueType === 'engine'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40',
                )}
              >
                <Heart className="h-5 w-5" aria-hidden />
                <span className="type-heading">Engine</span>
                <span className="text-xs">Heart rate based</span>
              </button>
              <button
                type="button"
                onClick={() => setLeagueType('run')}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-3 transition-all',
                  leagueType === 'run'
                    ? 'border-secondary bg-secondary/10 text-secondary'
                    : 'border-border bg-card text-muted-foreground hover:border-secondary/40',
                )}
              >
                <Activity className="h-5 w-5" aria-hidden />
                <span className="type-heading">Run</span>
                <span className="text-xs">Pace based</span>
              </button>
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => void handleCreate()}
            disabled={loading || !name.trim()}
          >
            {uploading ? 'Uploading…' : loading ? 'Creating…' : 'Create Club'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
