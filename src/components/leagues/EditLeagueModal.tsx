import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, Loader2 } from 'lucide-react';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';

interface EditLeagueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  league: {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
  };
  onSaved: () => void;
}

export function EditLeagueModal({ open, onOpenChange, league, onSaved }: EditLeagueModalProps) {
  const [name, setName] = useState(league.name);
  const [description, setDescription] = useState(league.description || '');
  const [imagePreview, setImagePreview] = useState<string | null>(league.image_url);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(league.name);
      setDescription(league.description || '');
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

      let imageUrl = league.image_url;

      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const path = `${user.id}/league-${league.id}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, imageFile, { upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        imageUrl = urlData.publicUrl;
      }

      const { error } = await supabase
        .from('private_leagues')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          image_url: imageUrl,
        })
        .eq('id', league.id);

      if (error) throw error;
      toast.success('League updated');
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
          <DialogTitle>Edit League</DialogTitle>
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
            <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="League name" />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 100))}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          <Button type="button" onClick={() => void handleSave()} disabled={loading || !name.trim()} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
