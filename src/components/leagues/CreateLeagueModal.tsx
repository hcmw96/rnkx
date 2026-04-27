import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Camera } from 'lucide-react';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CreateLeagueModalProps {
  athleteId: string;
  onCreated: () => void;
}

export function CreateLeagueModal({ athleteId, onCreated }: CreateLeagueModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leagueType, setLeagueType] = useState<'engine' | 'run'>('engine');
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            description: description.trim() || null,
            image_url: imageUrl,
            invite_code: inviteCode,
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
      if (leagueError || !leagueRow) throw leagueError ?? new Error('Failed to create league');

      const leagueId = leagueRow.id as string;

      const { error: memberError } = await supabase.from('private_league_members').insert({
        league_id: leagueId,
        athlete_id: athleteId,
        status: 'accepted',
      });
      if (memberError) throw memberError;

      toast.success(`"${name.trim()}" is ready!`);
      setName('');
      setDescription('');
      setLeagueType('engine');
      setImageFile(null);
      setImagePreview(null);
      setOpen(false);
      onCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create league';
      toast.error(msg);
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> New League
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Create Private League</DialogTitle>
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
                <img src={imagePreview} alt="League" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-6 w-6 text-muted-foreground" />
              )}
            </button>
          </div>

          <div>
            <Label htmlFor="league-name" className="text-foreground">
              League Name
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
            <Label htmlFor="league-desc" className="text-foreground">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="league-desc"
              placeholder="What's this league about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={100}
              className="mt-1 min-h-[60px] resize-none"
              rows={2}
            />
            <p className="mt-0.5 text-right text-[10px] text-muted-foreground">{description.length}/100</p>
          </div>

          <div>
            <Label className="text-foreground">League Type</Label>
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
                <span className="text-lg">❤️‍🔥</span>
                <span className="text-sm font-medium">Engine</span>
                <span className="text-[10px]">Heart rate based</span>
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
                <span className="text-lg">🏃</span>
                <span className="text-sm font-medium">Run</span>
                <span className="text-[10px]">Pace based</span>
              </button>
            </div>
          </div>

          <Button
            type="button"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => void handleCreate()}
            disabled={loading || !name.trim()}
          >
            {uploading ? 'Uploading…' : loading ? 'Creating…' : 'Create League'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
