import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { WearableConnector, WearableProvider } from '@/components/WearableConnector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LogOut, Trophy, Activity, TrendingUp, Loader2 } from 'lucide-react';
import RNKXLogo from '@/components/RNKXLogo';
import { getCountryFlag } from '@/hooks/useAthletes';

interface AthleteProfile {
  id: string;
  username: string;
  country: string | null;
  avatar_url: string | null;
  is_verified: boolean;
}

interface WearableConnection {
  provider: WearableProvider;
  is_active: boolean;
}

const countries = [
  { name: 'United States', flag: '🇺🇸' },
  { name: 'United Kingdom', flag: '🇬🇧' },
  { name: 'Canada', flag: '🇨🇦' },
  { name: 'Australia', flag: '🇦🇺' },
  { name: 'Germany', flag: '🇩🇪' },
  { name: 'France', flag: '🇫🇷' },
  { name: 'Spain', flag: '🇪🇸' },
  { name: 'Italy', flag: '🇮🇹' },
  { name: 'Netherlands', flag: '🇳🇱' },
  { name: 'Sweden', flag: '🇸🇪' },
  { name: 'Norway', flag: '🇳🇴' },
  { name: 'Denmark', flag: '🇩🇰' },
  { name: 'Japan', flag: '🇯🇵' },
  { name: 'South Korea', flag: '🇰🇷' },
  { name: 'Brazil', flag: '🇧🇷' },
  { name: 'Mexico', flag: '🇲🇽' },
  { name: 'India', flag: '🇮🇳' },
  { name: 'South Africa', flag: '🇿🇦' },
  { name: 'New Zealand', flag: '🇳🇿' },
  { name: 'Kenya', flag: '🇰🇪' },
  { name: 'Ethiopia', flag: '🇪🇹' },
];

export default function AthleteProfile() {
  const navigate = useNavigate();
  const { user, signOut, isLoading: authLoading } = useAuth();
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [connections, setConnections] = useState<WearableConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);
  
  // Profile creation form
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
      return;
    }

    if (user) {
      fetchAthleteProfile();
    }
  }, [user, authLoading, navigate]);

  const fetchAthleteProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('athletes')
      .select('id, username, country, avatar_url, is_verified')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching athlete profile:', error);
      setIsLoading(false);
      return;
    }
    
    if (data) {
      setAthlete(data);
      fetchConnections(data.id);
    } else {
      // No athlete profile exists - show creation form
      setNeedsProfile(true);
    }
    setIsLoading(false);
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      toast.error('Username is required');
      return;
    }
    
    if (!user) return;
    
    setIsCreating(true);
    
    const { data, error } = await supabase
      .from('athletes')
      .insert({
        user_id: user.id,
        username: username.trim(),
        country: country || null,
        is_active: true,
        is_verified: false,
      })
      .select('id, username, country, avatar_url, is_verified')
      .single();

    if (error) {
      console.error('Failed to create athlete profile:', error);
      toast.error('Failed to create profile. Username may already be taken.');
    } else {
      toast.success('Profile created! Connect your wearables to get started.');
      setAthlete(data);
      setNeedsProfile(false);
    }
    
    setIsCreating(false);
  };

  const fetchConnections = async (athleteId: string) => {
    const { data, error } = await supabase
      .from('athlete_wearable_connections')
      .select('provider, is_active')
      .eq('athlete_id', athleteId);

    if (error) {
      console.error('Error fetching connections:', error);
    } else {
      setConnections((data || []) as WearableConnection[]);
    }
  };

  const handleConnect = async (provider: WearableProvider) => {
    if (!athlete) return;

    // For now, simulate connection (later will integrate TerraAPI)
    const { error } = await supabase
      .from('athlete_wearable_connections')
      .upsert({
        athlete_id: athlete.id,
        provider,
        is_active: true,
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'athlete_id,provider'
      });

    if (error) {
      toast.error(`Failed to connect ${provider}`);
      console.error('Connection error:', error);
    } else {
      toast.success(`Connected to ${provider}!`);
      // Update the athletes wearables array as well
      const currentWearables = connections
        .filter(c => c.is_active)
        .map(c => c.provider);
      if (!currentWearables.includes(provider)) {
        currentWearables.push(provider);
      }
      await supabase
        .from('athletes')
        .update({ wearables: currentWearables })
        .eq('id', athlete.id);
      
      fetchConnections(athlete.id);
    }
  };

  const handleDisconnect = async (provider: WearableProvider) => {
    if (!athlete) return;

    const { error } = await supabase
      .from('athlete_wearable_connections')
      .update({ is_active: false })
      .eq('athlete_id', athlete.id)
      .eq('provider', provider);

    if (error) {
      toast.error(`Failed to disconnect ${provider}`);
      console.error('Disconnection error:', error);
    } else {
      toast.success(`Disconnected from ${provider}`);
      // Update the athletes wearables array
      const currentWearables = connections
        .filter(c => c.is_active && c.provider !== provider)
        .map(c => c.provider);
      await supabase
        .from('athletes')
        .update({ wearables: currentWearables })
        .eq('id', athlete.id);
      
      fetchConnections(athlete.id);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Show profile creation form if user has no athlete profile
  if (needsProfile) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center gap-4">
            <RNKXLogo className="h-12" />
            <p className="text-muted-foreground text-center">
              Complete your athlete profile to get started
            </p>
          </div>

          <Card className="card-elevated border-border/50">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl font-display">Create Your Profile</CardTitle>
              <CardDescription>
                Set up your athlete profile to start competing
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="fast_runner_42"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue placeholder="Select your country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((c) => (
                        <SelectItem key={c.name} value={c.name}>
                          {c.flag} {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating profile...
                    </>
                  ) : (
                    'Create Profile'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!athlete) {
    return null;
  }

  const activeConnections = connections.filter(c => c.is_active).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <RNKXLogo className="h-8" />
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/app')}>
              View Leaderboard
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Profile Card */}
        <Card className="card-elevated">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={athlete.avatar_url || undefined} />
                <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                  {athlete.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-display">{athlete.username}</h1>
                  {athlete.is_verified && (
                    <Badge variant="outline" className="border-primary/50 text-primary">
                      Verified
                    </Badge>
                  )}
                </div>
                {athlete.country && (
                  <p className="text-muted-foreground flex items-center gap-2">
                    <span className="text-xl">{getCountryFlag(athlete.country)}</span>
                    {athlete.country}
                  </p>
                )}
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    {activeConnections} wearable{activeConnections !== 1 ? 's' : ''} connected
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="card-elevated">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Trophy className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Current Rank</p>
                <p className="text-2xl font-display">--</p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-secondary/10">
                <Activity className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Score</p>
                <p className="text-2xl font-display">--</p>
              </div>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <TrendingUp className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-2xl font-display">--</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Wearable Connections */}
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="font-display text-xl">Connect Your Wearables</CardTitle>
            <CardDescription>
              Link your fitness devices to sync your activities and compete on the leaderboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WearableConnector
              connections={connections}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
