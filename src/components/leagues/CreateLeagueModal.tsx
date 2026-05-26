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
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error('Not signed in');
        return;
      }

      // Ensure athletes.user_id is populated so RLS policies pass
      await supabase
        .from('athletes')
        .update({ user_id: user.id })
        .eq('id', athleteId)
        .is('user_id', null);

      let imageUrl: string | null = null;
      if (imageFile) {
        setUploading(true);
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${user.id}/league-${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, imageFile, { cacheControl: '3600', upsert: true });
        if (uploadError) throw uploadError;
        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(fileName);
        imageUrl = pub.publicUrl;
        setUploading(false);
      }

      const { data: convRow, error: convError } = await supabase
        .from('conversations')
        .insert({ is_group: true, name: name.trim(), created_by: athleteId })
        .select('id')
        .single();
      if (convError) throw convError;

      const conversationId = convRow.id as string;

      const { error: memberConvError } = await supabase
        .from('conversation_members')
        .insert({ conversation_id: conversationId, athlete_id: athleteId });
      if (memberConvError) throw memberConvError;

      let inviteCode: string;
      let leagueRow: { id: string } | null = null;
      let leagueError: Error | null = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        inviteCode = Math.random().toString(36).substring(2, 10);
        const ins = await supabase
          .from('private_leagues')
          .insert({
            name: name.trim(),
            created_by: athleteId,
            league_type: leagueType,
            conversation_id: conversationId,
            image_url: imageUrl,
            invite_code: inviteCode,
            is_public: visibility === 'public',
          })
          .select('id')
          .single();
        if (!ins.error) {
          leagueRow = ins.data as { id: string };
          leagueError = null;
          break;
        }
        if (ins.error.code === '23505') {
          leagueError = new Error(ins.error.message);
          continue;
        }
        leagueError = new Error(ins.error.message);
        break;
      }
      if (leagueError || !leagueRow) throw leagueError ?? new Error('Failed to create club');

      const leagueId = leagueRow.id as string;

      const { error: memberError } = await supabase.from('private_league_members').insert({
        league_id: leagueId,
        athlete_id: athleteId,
        status: 'accepted',
      });
      if (memberError) throw memberError;

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
