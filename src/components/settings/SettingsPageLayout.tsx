import * as React from 'react';
import type { ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlignLeft,
  Check,
  CreditCard,
  FileText,
  ChevronDown,
  Globe,
  Heart,
  HelpCircle,
  Info,
  Lock,
  LogOut,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Shield,
  Smartphone,
  Star,
  Trash2,
  Trophy,
  User,
} from 'lucide-react';
import { WearableCompatibility } from '@/components/WearableCompatibility';
import { AppShell } from '@/components/app/AppShell';
import { PremiumGate } from '@/components/PremiumGate';
import { SHOW_RECOVERY } from '@/lib/featureFlags';
import RecoveryPage from '@/pages/app/RecoveryPage';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  ENGINE_LEAGUE_AVATAR_FALLBACK,
  RUN_LEAGUE_AVATAR_FALLBACK,
} from '@/lib/leagueAvatars';
import { APP_DOCUMENTS, type AppDocument } from '@/lib/appDocuments';
import { DocViewerSheet } from '@/components/settings/DocViewerSheet';
import {
  ConnectBadge,
  SettingsGroup,
  SettingsRow,
  SettingsRowDivider,
  SettingsSectionHeader,
} from '@/components/settings/SettingsRows';
import { ProfileGenderSelect } from '@/components/settings/ProfileGenderSelect';
import { athleteProfileGenderLabel, type AthleteProfileGender } from '@/lib/clubGender';
import { formatLeaguesSubtitle, formatSyncAgo, maxHrSourceLabel } from '@/lib/settingsFormat';
import { cn } from '@/lib/utils';
import { WhoopLogo } from '@/components/BrandLogos';
import { providerLabel } from '@/components/terra/TerraWearableProviders';

type TerraConnectionRow = {
  id: string;
  terra_user_id: string;
  provider: string;
};

type SettingsDialog =
  | 'email'
  | 'displayName'
  | 'username'
  | 'gender'
  | 'password'
  | 'leagues'
  | 'subscription'
  | 'support'
  | 'appleDevice'
  | 'whoopDevice'
  | 'terraDevice'
  | null;

export type SettingsPageLayoutProps = {
  loading: boolean;
  athlete: {
    id: string;
    display_name: string;
    username: string | null;
    wearables: string[] | null;
    max_hr: number | string | null;
    max_hr_source: string | null;
    is_premium: boolean | null;
    health_data_enabled: boolean | null;
    profile_public: boolean | null;
    last_synced: string | null;
    user_id: string | null;
    gender: string | null;
  } | null;
  userEmail: string | null;
  terraConnections: TerraConnectionRow[];
  whoopConnected: boolean;
  appleConnected: boolean;
  appleError: string | null;
  appleConnecting: boolean;
  disconnectingWhoop: boolean;
  disconnectingId: string | null;
  terraConnecting: boolean;
  syncing: boolean;
  hasConnectedSyncDevice: boolean;
  selectedLeagues: string[];
  maxHrDisplay: number | null;
  settingsBusy: boolean;
  settingsDialog: SettingsDialog;
  terraDialogRow: TerraConnectionRow | null;
  nameDraft: string;
  nameSaving: boolean;
  usernameDraft: string;
  usernameSaving: boolean;
  genderDraft: AthleteProfileGender;
  genderSaving: boolean;
  supportBody: string;
  supportSending: boolean;
  restorePurchasing: boolean;
  deleteAccountOpen: boolean;
  deleteAccountWorking: boolean;
  wearableLogoForCode: (code: string) => ComponentType<{ className?: string }> | null;
  onSync: () => void;
  onOpenDialog: (dialog: SettingsDialog) => void;
  onOpenTerraDialog: (row: TerraConnectionRow) => void;
  onCloseDialog: () => void;
  onConnectDevice: () => void;
  onConnectApple: () => void;
  onDisconnectApple: () => void;
  onConnectWhoop: () => void;
  onDisconnectWhoop: () => void;
  onDisconnectTerra: (row: TerraConnectionRow) => void;
  onNameDraftChange: (value: string) => void;
  onSaveDisplayName: () => void;
  onUsernameDraftChange: (value: string) => void;
  onSaveUsername: () => void;
  onGenderDraftChange: (value: AthleteProfileGender) => void;
  onSaveGender: () => void;
  onPasswordReset: () => void;
  onToggleLeague: (league: 'engine' | 'run') => void;
  onHealthDataChange: (value: boolean) => void;
  onProfilePublicChange: (value: boolean) => void;
  onRestorePurchases: () => void;
  onUnlockPremium: () => void;
  onSupportBodyChange: (value: string) => void;
  onSendSupport: () => void;
  onSignOut: () => void;
  onDeleteAccountOpen: () => void;
  onDeleteAccountClose: (open: boolean) => void;
  onDeleteAccountConfirm: () => void;
};

export function SettingsPageLayout(props: SettingsPageLayoutProps) {
  const navigate = useNavigate();
  const {
    loading,
    athlete,
    userEmail,
    terraConnections,
    whoopConnected,
    appleConnected,
    appleError,
    appleConnecting,
    disconnectingWhoop,
    disconnectingId,
    terraConnecting,
    syncing,
    hasConnectedSyncDevice,
    selectedLeagues,
    maxHrDisplay,
    settingsBusy,
    settingsDialog,
    terraDialogRow,
    nameDraft,
    nameSaving,
    usernameDraft,
    usernameSaving,
    genderDraft,
    genderSaving,
    supportBody,
    supportSending,
    restorePurchasing,
    deleteAccountOpen,
    deleteAccountWorking,
    wearableLogoForCode,
    onSync,
    onOpenDialog,
    onOpenTerraDialog,
    onCloseDialog,
    onConnectDevice,
    onConnectApple,
    onDisconnectApple,
    onConnectWhoop,
    onDisconnectWhoop,
    onDisconnectTerra,
    onNameDraftChange,
    onSaveDisplayName,
    onUsernameDraftChange,
    onSaveUsername,
    onGenderDraftChange,
    onSaveGender,
    onPasswordReset,
    onToggleLeague,
    onHealthDataChange,
    onProfilePublicChange,
    onRestorePurchases,
    onUnlockPremium,
    onSupportBodyChange,
    onSendSupport,
    onSignOut,
    onDeleteAccountOpen,
    onDeleteAccountClose,
    onDeleteAccountConfirm,
  } = props;

  const [activeDoc, setActiveDoc] = React.useState<AppDocument | null>(null);
  const [devicesHowToOpen, setDevicesHowToOpen] = React.useState(false);

  const appleSubtitle = appleConnected
    ? formatSyncAgo(athlete?.last_synced)
    : 'HealthKit via iPhone app';

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-5 pb-8">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading settings…</p>
        ) : !athlete ? (
          <p className="text-sm text-destructive">Could not load your athlete profile.</p>
        ) : (
          <>
            <AlertDialog open={deleteAccountOpen} onOpenChange={onDeleteAccountClose}>
              <AlertDialogContent className="border-border bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete account permanently?</AlertDialogTitle>
                  <AlertDialogDescription className="text-left">
                    Are you sure? This will permanently delete your account and all your data. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteAccountWorking}>Cancel</AlertDialogCancel>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={deleteAccountWorking}
                    onClick={onDeleteAccountConfirm}
                  >
                    {deleteAccountWorking ? 'Deleting…' : 'Delete my account'}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Dialog open={settingsDialog != null} onOpenChange={(open) => !open && onCloseDialog()}>
              <DialogContent className="max-w-md border-border bg-card">
                {settingsDialog === 'email' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Email</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-foreground">{userEmail ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      Email is tied to your login. Contact support if you need to change it.
                    </p>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Done
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'displayName' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Display name</DialogTitle>
                    </DialogHeader>
                    <Input
                      value={nameDraft}
                      onChange={(e) => onNameDraftChange(e.target.value)}
                      placeholder="Display name"
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Cancel
                      </Button>
                      <Button type="button" disabled={nameSaving} onClick={onSaveDisplayName}>
                        {nameSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'username' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Username</DialogTitle>
                    </DialogHeader>
                    <Input
                      value={usernameDraft}
                      onChange={(e) => onUsernameDraftChange(e.target.value)}
                      placeholder="username"
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Cancel
                      </Button>
                      <Button type="button" disabled={usernameSaving} onClick={onSaveUsername}>
                        {usernameSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'gender' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Gender</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        Used for men&apos;s and women&apos;s club matching. Mixed clubs are open to everyone.
                      </p>
                    </DialogHeader>
                    <ProfileGenderSelect value={genderDraft} onChange={onGenderDraftChange} />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Cancel
                      </Button>
                      <Button type="button" disabled={genderSaving} onClick={onSaveGender}>
                        {genderSaving ? 'Saving…' : 'Save'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'password' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Password</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      We&apos;ll email a secure reset link to {userEmail ?? 'your address'}.
                    </p>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={onPasswordReset}>
                        Send reset email
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'leagues' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Competition leagues</DialogTitle>
                      <p className="text-sm text-muted-foreground">Select one or both leagues to compete in.</p>
                    </DialogHeader>
                    <div className="space-y-2">
                      {(['run', 'engine'] as const).map((league) => {
                        const active = selectedLeagues.includes(league);
                        const isRun = league === 'run';
                        return (
                          <button
                            key={league}
                            type="button"
                            disabled={settingsBusy}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-xl border bg-zinc-950/50 px-4 py-3 text-left transition',
                              active
                                ? isRun
                                  ? 'border-cyan-400/70 ring-1 ring-cyan-500/35'
                                  : 'border-neon-lime/70 ring-1 ring-neon-lime/25'
                                : 'border-border hover:border-muted-foreground/30',
                            )}
                            onClick={() => onToggleLeague(league)}
                          >
                            <div
                              className={cn(
                                'relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 bg-muted',
                                active
                                  ? isRun
                                    ? 'border-cyan-400 ring-1 ring-cyan-500/35'
                                    : 'border-neon-lime ring-1 ring-neon-lime/25'
                                  : 'border-border opacity-80',
                              )}
                            >
                              <img
                                src={isRun ? RUN_LEAGUE_AVATAR_FALLBACK : ENGINE_LEAGUE_AVATAR_FALLBACK}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              {active ? (
                                <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
                                  <Check
                                    className={cn('h-2.5 w-2.5', isRun ? 'text-cyan-400' : 'text-neon-lime')}
                                    strokeWidth={3}
                                  />
                                </span>
                              ) : null}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">
                                {isRun ? 'Run League' : 'Engine League'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {isRun ? 'Pace-based scoring' : 'Heart rate-based scoring'}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <DialogFooter>
                      <Button type="button" onClick={onCloseDialog}>
                        Done
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'subscription' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Subscription</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-zinc-950/40 px-3 py-2">
                      <span className="text-sm text-muted-foreground">Current plan</span>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
                          athlete.is_premium
                            ? 'border border-neon-lime/35 bg-zinc-950 text-neon-lime'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {athlete.is_premium ? 'Premium' : 'Free'}
                      </span>
                    </div>
                    {!athlete.is_premium ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Unlock friends, clubs, recovery insights, and more.
                        </p>
                        <Button
                          type="button"
                          className="w-full bg-neon-lime font-semibold text-black hover:bg-neon-lime/90"
                          onClick={onUnlockPremium}
                        >
                          Unlock Premium
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Thank you for supporting RNKX with Premium.
                      </p>
                    )}
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Done
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'support' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Contact support</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        Send us a message — we&apos;ll get back to you as soon as possible.
                      </p>
                    </DialogHeader>
                    <Textarea
                      placeholder="Describe your issue or question…"
                      value={supportBody}
                      onChange={(e) => onSupportBodyChange(e.target.value)}
                      className="min-h-[120px] resize-none border-border bg-background"
                    />
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="bg-neon-lime text-black hover:bg-neon-lime/90"
                        disabled={supportSending}
                        onClick={onSendSupport}
                      >
                        <Send className="h-4 w-4" aria-hidden />
                        {supportSending ? 'Sending…' : 'Send message'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}

                {settingsDialog === 'appleDevice' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Apple Watch</DialogTitle>
                      <p className="text-sm text-muted-foreground">HealthKit sync via the RNKX iPhone app.</p>
                    </DialogHeader>
                    {appleError ? <p className="text-sm text-destructive">{appleError}</p> : null}
                    {appleConnected ? (
                      <>
                        <p className="text-sm text-muted-foreground">{appleSubtitle}</p>
                        <p className="text-xs text-muted-foreground">
                          To fully disconnect, go to iOS Settings &gt; Health &gt; Data Access.
                        </p>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={onCloseDialog}>
                            Done
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={appleConnecting}
                            onClick={onDisconnectApple}
                          >
                            {appleConnecting ? '…' : 'Disconnect'}
                          </Button>
                        </DialogFooter>
                      </>
                    ) : (
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={onCloseDialog}>
                          Cancel
                        </Button>
                        <Button type="button" disabled={appleConnecting} onClick={onConnectApple}>
                          {appleConnecting ? 'Connecting…' : 'Connect Apple Watch'}
                        </Button>
                      </DialogFooter>
                    )}
                  </>
                ) : null}

                {settingsDialog === 'whoopDevice' ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>WHOOP</DialogTitle>
                      <p className="text-sm text-muted-foreground">Direct OAuth connection — syncs automatically.</p>
                    </DialogHeader>
                    {whoopConnected ? (
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={onCloseDialog}>
                          Done
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={disconnectingWhoop}
                          onClick={onDisconnectWhoop}
                        >
                          {disconnectingWhoop ? '…' : 'Disconnect'}
                        </Button>
                      </DialogFooter>
                    ) : (
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={onCloseDialog}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={onConnectWhoop}>
                          Connect WHOOP
                        </Button>
                      </DialogFooter>
                    )}
                  </>
                ) : null}

                {settingsDialog === 'terraDevice' && terraDialogRow ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>{providerLabel(terraDialogRow.provider)}</DialogTitle>
                      <p className="text-sm text-muted-foreground">Syncs automatically via webhook.</p>
                    </DialogHeader>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={onCloseDialog}>
                        Done
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={disconnectingId === terraDialogRow.id}
                        onClick={() => onDisconnectTerra(terraDialogRow)}
                      >
                        {disconnectingId === terraDialogRow.id ? '…' : 'Disconnect'}
                      </Button>
                    </DialogFooter>
                  </>
                ) : null}
              </DialogContent>
            </Dialog>

            <div className="space-y-2">
              <SettingsSectionHeader icon={RefreshCw} label="Devices & sync" />
              <SettingsGroup>
                <div className="p-3 pb-0">
                  <Button
                    type="button"
                    className="w-full gap-2 bg-neon-lime font-semibold text-black hover:bg-neon-lime/90"
                    disabled={syncing || !hasConnectedSyncDevice}
                    onClick={onSync}
                  >
                    <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} aria-hidden />
                    {!hasConnectedSyncDevice
                      ? 'Connect a device to sync'
                      : syncing
                        ? 'Syncing…'
                        : 'Sync workouts'}
                  </Button>
                </div>

                <SettingsRowDivider />
                <Collapsible open={devicesHowToOpen} onOpenChange={setDevicesHowToOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/30 active:bg-muted/40"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                        <Info className="h-4 w-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">How devices work</p>
                        <p className="text-xs text-muted-foreground">Manual vs automatic sync</p>
                      </div>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                          devicesHowToOpen && 'rotate-180',
                        )}
                        aria-hidden
                      />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pb-3">
                    <WearableCompatibility />
                  </CollapsibleContent>
                </Collapsible>
                <SettingsRowDivider />

                <SettingsRow
                  icon={Smartphone}
                  title="Apple Watch"
                  subtitle={appleSubtitle}
                  trailing={<ConnectBadge connected={appleConnected} />}
                  onClick={() => onOpenDialog('appleDevice')}
                />
                <SettingsRowDivider />

                <SettingsRow
                  iconNode={
                    <div className="flex h-4 w-4 items-center justify-center">
                      <WhoopLogo className="h-4 w-4" />
                    </div>
                  }
                  title="WHOOP"
                  subtitle="Direct connection"
                  trailing={<ConnectBadge connected={whoopConnected} />}
                  onClick={() => onOpenDialog('whoopDevice')}
                />

                {terraConnections.map((row) => {
                  const Logo = wearableLogoForCode(row.provider);
                  return (
                    <div key={row.id}>
                      <SettingsRowDivider />
                      <SettingsRow
                        iconNode={
                          Logo ? (
                            <Logo className="h-4 w-4 max-w-[1rem]" />
                          ) : (
                            <span className="text-[10px] font-bold">{row.provider.slice(0, 2)}</span>
                          )
                        }
                        title={providerLabel(row.provider)}
                        subtitle="Webhook sync"
                        trailing={<ConnectBadge connected />}
                        onClick={() => onOpenTerraDialog(row)}
                      />
                    </div>
                  );
                })}

                <SettingsRowDivider />
                <SettingsRow
                  icon={Heart}
                  title="Max heart rate"
                  subtitle={`${maxHrSourceLabel(athlete.max_hr_source)} · not editable`}
                  chevron={false}
                  trailing={
                    maxHrDisplay != null ? (
                      <span className="text-sm font-medium tabular-nums text-muted-foreground">
                        {maxHrDisplay} bpm
                      </span>
                    ) : undefined
                  }
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={Plus}
                  title="Connect new device"
                  titleClassName="text-neon-lime"
                  subtitle={terraConnecting ? 'Opening…' : 'Garmin'}
                  onClick={onConnectDevice}
                  disabled={terraConnecting}
                />
              </SettingsGroup>
              <p className="px-1 text-xs text-muted-foreground">
                To fully disconnect a device, also revoke access in iOS Settings &gt; Health &gt; Data Access.
              </p>
            </div>

            <div className="space-y-2">
              <SettingsSectionHeader icon={User} label="Account" />
              <SettingsGroup>
                <SettingsRow
                  icon={Mail}
                  title="Email"
                  subtitle={userEmail ?? '—'}
                  onClick={() => onOpenDialog('email')}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={User}
                  title="Display name"
                  subtitle={athlete.display_name}
                  onClick={() => onOpenDialog('displayName')}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={AlignLeft}
                  title="Username"
                  subtitle={athlete.username ? `@${athlete.username}` : '—'}
                  onClick={() => onOpenDialog('username')}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={User}
                  title="Gender"
                  subtitle={athleteProfileGenderLabel(athlete.gender)}
                  onClick={() => onOpenDialog('gender')}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={Lock}
                  title="Password"
                  subtitle="Reset via email"
                  onClick={() => onOpenDialog('password')}
                />
              </SettingsGroup>
            </div>

            <div className="space-y-2">
              <SettingsSectionHeader icon={Activity} label="Performance" />
              <SettingsGroup>
                <SettingsRow
                  icon={Trophy}
                  title="Competition leagues"
                  subtitle={formatLeaguesSubtitle(selectedLeagues)}
                  onClick={() => onOpenDialog('leagues')}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={Heart}
                  title="Share health data"
                  subtitle="Sync HR & workouts"
                  chevron={false}
                  trailing={
                    <Switch
                      checked={athlete.health_data_enabled ?? true}
                      disabled={settingsBusy}
                      onCheckedChange={onHealthDataChange}
                      className="data-[state=checked]:bg-neon-lime"
                    />
                  }
                />
              </SettingsGroup>
            </div>

            {SHOW_RECOVERY ? (
              <div id="recovery" className="space-y-2">
                <SettingsSectionHeader icon={Heart} label="Recovery" />
                <SettingsGroup className="p-4">
                  <PremiumGate
                    athleteId={athlete.id}
                    userId={athlete.user_id ?? undefined}
                    badge="PREMIUM"
                    title="Recovery insights"
                    description="Trend charts, load guidance, and readiness — included with RNKX Premium"
                  >
                    <RecoveryPage embedded />
                  </PremiumGate>
                </SettingsGroup>
              </div>
            ) : null}

            <div className="space-y-2">
              <SettingsSectionHeader icon={Shield} label="Privacy" />
              <SettingsGroup>
                <SettingsRow
                  icon={Globe}
                  title="Public profile"
                  subtitle="Show your rank to others"
                  chevron={false}
                  trailing={
                    <Switch
                      checked={athlete.profile_public ?? true}
                      disabled={settingsBusy}
                      onCheckedChange={onProfilePublicChange}
                      className="data-[state=checked]:bg-neon-lime"
                    />
                  }
                />
              </SettingsGroup>
            </div>

            <div className="space-y-2">
              <SettingsSectionHeader icon={CreditCard} label="Subscription" />
              <SettingsGroup>
                <SettingsRow
                  icon={Star}
                  title="Current plan"
                  subtitle={athlete.is_premium ? 'Premium active' : 'Free plan'}
                  trailing={
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        athlete.is_premium
                          ? 'border border-neon-lime/35 bg-zinc-950 text-neon-lime'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {athlete.is_premium ? 'Premium' : 'Free'}
                    </span>
                  }
                  onClick={() => onOpenDialog('subscription')}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={RotateCcw}
                  title="Restore purchases"
                  subtitle="After reinstall or new device"
                  disabled={restorePurchasing}
                  onClick={onRestorePurchases}
                />
              </SettingsGroup>
            </div>

            <div className="space-y-2">
              <SettingsSectionHeader icon={HelpCircle} label="Help & info" />
              <SettingsGroup>
                <SettingsRow
                  icon={Trophy}
                  title="Competition Guide"
                  compact
                  onClick={() => setActiveDoc(APP_DOCUMENTS.guide)}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={AlignLeft}
                  title="Official Competition Rules"
                  compact
                  onClick={() => setActiveDoc(APP_DOCUMENTS.rules)}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={HelpCircle}
                  title="FAQ"
                  compact
                  onClick={() => navigate('/app/faq')}
                />
                <SettingsRowDivider />
                <SettingsRow
                  icon={Mail}
                  title="Contact support"
                  compact
                  onClick={() => onOpenDialog('support')}
                />
              </SettingsGroup>
            </div>

            <div className="space-y-2">
              <SettingsSectionHeader icon={FileText} label="Legal" />
              <SettingsGroup>
                {(
                  [
                    ['Privacy policy', APP_DOCUMENTS.privacy],
                    ['Terms & conditions', APP_DOCUMENTS.terms],
                    ['User waiver', APP_DOCUMENTS.waiver],
                    ['Cookies policy', APP_DOCUMENTS.cookies],
                  ] as const
                ).map(([label, doc], index) => (
                  <div key={doc.id}>
                    {index > 0 ? <SettingsRowDivider /> : null}
                    <SettingsRow
                      icon={FileText}
                      title={label}
                      compact
                      onClick={() => setActiveDoc(doc)}
                    />
                  </div>
                ))}
              </SettingsGroup>
            </div>

            <SettingsGroup>
              <SettingsRow
                icon={LogOut}
                title="Sign out"
                chevron={false}
                compact
                onClick={onSignOut}
              />
            </SettingsGroup>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-destructive/80 hover:text-destructive hover:underline"
              onClick={onDeleteAccountOpen}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete account
            </button>

            <p className="pt-2 text-center text-xs text-muted-foreground">RNKX · v1.0.0</p>
          </>
        )}
      </section>

      <DocViewerSheet doc={activeDoc} onClose={() => setActiveDoc(null)} />
    </AppShell>
  );
}
