import { AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RNKXLogo from '@/components/RNKXLogo';
import CountrySelect from '@/components/onboarding/CountrySelect';
import DateOfBirthPicker from '@/components/onboarding/DateOfBirthPicker';
import DisplayNameInput from '@/components/onboarding/DisplayNameInput';
import GenderSelect from '@/components/onboarding/GenderSelect';
import LeagueSelect from '@/components/onboarding/LeagueSelect';
import LegalConsent from '@/components/onboarding/LegalConsent';
import OnboardingStep from '@/components/onboarding/OnboardingStep';
import OnboardingWearables, {
  type WearableProvider,
} from '@/components/onboarding/OnboardingWearables';
import ProfilePhotoPicker from '@/components/onboarding/ProfilePhotoPicker';
import ProgressDots from '@/components/onboarding/ProgressDots';
import UsernameInput from '@/components/onboarding/UsernameInput';
import { Button } from '@/components/ui/button';
import { useProfileGate } from '@/context/ProfileGateContext';
import { getSeededDisplayName, isAppleAuthUser } from '@/lib/authPostLogin';
import { consumeAfterOnboardingPath } from '@/hooks/useWearableConnect';
import { notifyLoopsAccountCreated } from '@/lib/loopsAccountCreated';
import { resolveAthleteAvatarUrl } from '@/lib/leagueAvatars';
import { getPendingLeagueInvitePath } from '@/lib/shareLeagueInvite';
import { uploadAthleteAvatar } from '@/lib/uploadAthleteAvatar';
import { supabase } from '@/services/supabase';

const ONBOARDING_STEP_COUNT = 9;
const PHOTO_STEP = 3;
const LEGAL_STEP = 9;

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ageFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const md = today.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { refetchProfile } = useProfileGate();
  const [bootstrapping, setBootstrapping] = useState(true);
  /** When true, Sign in with Apple already supplied name — do not ask again (Guideline 4 / SIWA). */
  const [nameFromApple, setNameFromApple] = useState(false);
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameValid, setUsernameValid] = useState(false);
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [leagues, setLeagues] = useState<string[]>(['run', 'engine']);
  const [wearables, setWearables] = useState<WearableProvider[]>([]);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoOnly, setPhotoOnly] = useState(false);
  const [existingAthleteId, setExistingAthleteId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        if (!cancelled) setBootstrapping(false);
        return;
      }

      const [seeded, appleUser, athleteLookup] = await Promise.all([
        getSeededDisplayName(userId),
        isAppleAuthUser(),
        Promise.all([
          supabase
            .from('athletes')
            .select('id, username, avatar_url')
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('athletes')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .maybeSingle(),
        ]),
      ]);

      if (cancelled) return;

      const existing = athleteLookup[0].data ?? athleteLookup[1].data;
      const hasUsername =
        typeof existing?.username === 'string' && existing.username.trim().length >= 3;
      const hasPhoto = resolveAthleteAvatarUrl(existing?.avatar_url) != null;
      if (existing?.id && hasUsername && !hasPhoto) {
        setExistingAthleteId(existing.id);
        setPhotoOnly(true);
        setStep(PHOTO_STEP);
      } else if (seeded) {
        setDisplayName(seeded);
        // Apple already provided name via Authentication Services — skip re-asking.
        if (appleUser) {
          setNameFromApple(true);
          setStep(2);
        }
      }
      setBootstrapping(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onUsernameValidChange = useCallback((valid: boolean) => {
    setUsernameValid(valid);
  }, []);

  const onWearablesChange = useCallback((connected: WearableProvider[]) => {
    setWearables(connected);
  }, []);

  const age = useMemo(() => (dob ? ageFromDob(dob) : null), [dob]);

  const canAdvanceFromStep = useCallback(() => {
    switch (step) {
      case 1:
        // Only shown when Apple did not supply a name.
        return displayName.trim().length >= 2;
      case 2:
        return usernameValid && username.trim().length >= 3;
      case PHOTO_STEP:
        return photoFile != null;
      case 4:
        if (!dob || age === null) return false;
        return age >= 13 && age <= 100;
      case 5:
        return gender !== null && gender.length > 0;
      case 6:
        // Country is optional (Guideline 5.1.1(v)) — useful for leaderboards, not required.
        return true;
      case 7:
        return leagues.length > 0;
      case 8:
        return true;
      case LEGAL_STEP:
        return legalAccepted;
      default:
        return false;
    }
  }, [step, displayName, username, usernameValid, photoFile, dob, age, gender, leagues, legalAccepted]);

  const handlePrevStep = () => {
    setSubmitError(null);
    if (photoOnly) return;
    if (step <= 1) return;
    if (step === 2 && nameFromApple) return;
    setStep((s) => s - 1);
  };

  const handleSignInInstead = () => {
    setSubmitError(null);
    void (async () => {
      await supabase.auth.signOut();
      navigate('/auth', { replace: true, state: { authStep: 'login' } });
    })();
  };

  const handleBack = () => {
    if (photoOnly) {
      handleSignInInstead();
      return;
    }
    if (step > 1 && !(step === 2 && nameFromApple)) {
      handlePrevStep();
      return;
    }
    handleSignInInstead();
  };

  const enterApp = async () => {
    await refetchProfile();
    setFinishing(false);
    const afterPath = consumeAfterOnboardingPath();
    navigate(afterPath ?? getPendingLeagueInvitePath() ?? '/app', { replace: true });
  };

  const savePhotoForAthlete = async (athleteId: string): Promise<boolean> => {
    if (!photoFile) {
      setSubmitError('A profile photo is required.');
      return false;
    }
    if (!photoFile.type.startsWith('image/')) {
      setSubmitError('Please choose an image file.');
      return false;
    }
    const { publicUrl, error: uploadError } = await uploadAthleteAvatar(athleteId, photoFile);
    if (uploadError || !publicUrl) {
      setSubmitError(uploadError ?? 'Could not upload your photo. Try another image.');
      return false;
    }
    const { error: updateError } = await supabase
      .from('athletes')
      .update({ avatar_url: publicUrl })
      .eq('id', athleteId);
    if (updateError) {
      setSubmitError(updateError.message);
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    setSubmitError(null);
    if (!canAdvanceFromStep()) return;

    if (photoOnly) {
      const athleteId = existingAthleteId;
      if (!athleteId) {
        setSubmitError('Could not find your profile.');
        return;
      }
      setFinishing(true);
      const ok = await savePhotoForAthlete(athleteId);
      if (!ok) {
        setFinishing(false);
        return;
      }
      await enterApp();
      return;
    }

    if (step === LEGAL_STEP) {
      setFinishing(true);
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setFinishing(false);
        setSubmitError(userError?.message ?? 'Not signed in.');
        return;
      }

      const userId = userData.user.id;
      if (!dob || age === null) {
        setFinishing(false);
        setSubmitError('Date of birth is required.');
        return;
      }

      const trimmedName = displayName.trim();
      if (trimmedName.length < 2) {
        setFinishing(false);
        setSubmitError('A display name is required for leaderboards.');
        return;
      }

      if (!photoFile) {
        setFinishing(false);
        setSubmitError('A profile photo is required.');
        return;
      }

      const row = {
        id: userId,
        user_id: userId,
        display_name: trimmedName,
        username: username.trim().toLowerCase(),
        date_of_birth: formatLocalDate(dob),
        gender,
        country: country.trim() ? country.trim() : null,
        selected_leagues: leagues,
        age,
        // Only persist devices that were actually connected (Apple HealthKit today).
        ...(wearables.includes('apple') ? { wearables: ['apple_watch'] } : {}),
      };

      const { error: insertError } = await supabase.from('athletes').upsert(row, { onConflict: 'id' });

      if (insertError) {
        setFinishing(false);
        setSubmitError(insertError.message);
        return;
      }

      const photoOk = await savePhotoForAthlete(userId);
      if (!photoOk) {
        setFinishing(false);
        return;
      }

      const email = userData.user.email?.trim();
      if (email) {
        notifyLoopsAccountCreated(userId, email);
      } else {
        console.warn('[loops] skip accountCreated — auth user has no email');
      }

      await enterApp();
      return;
    }

    setStep((s) => s + 1);
  };

  if (bootstrapping) {
    return (
      <div className="flex min-h-app items-center justify-center bg-background text-sm text-muted-foreground">
        Preparing your profile…
      </div>
    );
  }

  return (
    <div className="min-h-app bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-4 pb-10 pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2 w-fit gap-2 self-start"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {photoOnly || (step <= 1) || (step === 2 && nameFromApple) ? 'Sign in' : 'Back'}
        </Button>

        <header className="mb-6 flex flex-col items-center gap-2 pt-2">
          <RNKXLogo size="md" />
          <p className="text-center text-sm text-muted-foreground">
            {photoOnly ? 'Add a profile photo to continue' : 'Complete your profile'}
          </p>
          {nameFromApple && !photoOnly ? (
            <p className="text-center text-xs text-muted-foreground">
              Signed in with Apple as {displayName}
            </p>
          ) : null}
        </header>

        {!photoOnly ? (
          <div className="mb-6">
            <ProgressDots currentStep={step - 1} totalSteps={ONBOARDING_STEP_COUNT} />
          </div>
        ) : (
          <div className="mb-6" />
        )}

        {submitError && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {submitError}
          </p>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && !nameFromApple && !photoOnly && (
            <OnboardingStep key="s1" title="Display name" subtitle="How should we show you on leaderboards?">
              <DisplayNameInput value={displayName} onChange={setDisplayName} />
            </OnboardingStep>
          )}

          {step === 2 && !photoOnly && (
            <OnboardingStep key="s2" title="Username" subtitle="Pick a unique handle (letters, numbers, underscore).">
              <UsernameInput value={username} onChange={setUsername} onValidChange={onUsernameValidChange} />
            </OnboardingStep>
          )}

          {step === PHOTO_STEP && (
            <OnboardingStep
              key="s3"
              title="Profile photo"
              subtitle="Required — this is how other athletes see you on the leaderboard."
            >
              <ProfilePhotoPicker file={photoFile} onFile={setPhotoFile} />
            </OnboardingStep>
          )}

          {step === 4 && !photoOnly && (
            <OnboardingStep key="s4" title="Date of birth" subtitle="You must be at least 13 years old.">
              <DateOfBirthPicker value={dob} onChange={setDob} />
            </OnboardingStep>
          )}

          {step === 5 && !photoOnly && (
            <OnboardingStep key="s5" title="Gender" subtitle="Used for athlete categories and rankings.">
              <GenderSelect value={gender} onChange={setGender} />
            </OnboardingStep>
          )}

          {step === 6 && !photoOnly && (
            <OnboardingStep
              key="s6"
              title="Country"
              subtitle="Optional — shown on leaderboards if you choose one. You can skip or add this later in Settings."
            >
              <CountrySelect value={country} onChange={setCountry} />
            </OnboardingStep>
          )}

          {step === 7 && !photoOnly && (
            <OnboardingStep
              key="s7"
              title="Choose Your Leagues"
              subtitle="Compete in one or both leagues. You can change this anytime."
            >
              <LeagueSelect value={leagues} onChange={setLeagues} connectedWearables={wearables} />
            </OnboardingStep>
          )}

          {step === 8 && !photoOnly && (
            <OnboardingStep
              key="s8"
              title="Connect Your Wearable"
              subtitle="Apple Watch can connect now. Garmin, WHOOP and others connect in Settings after sign up."
            >
              <OnboardingWearables
                initialConnected={wearables}
                onConnectionsChange={onWearablesChange}
                onSkip={() => setStep(LEGAL_STEP)}
                onContinue={() => setStep(LEGAL_STEP)}
              />
            </OnboardingStep>
          )}

          {step === LEGAL_STEP && !photoOnly && (
            <OnboardingStep key="s9" title="Almost there" subtitle="Review and accept to finish setup.">
              <LegalConsent checked={legalAccepted} onChange={setLegalAccepted} />
            </OnboardingStep>
          )}
        </AnimatePresence>

        <div className="mt-8 flex flex-col gap-3">
          {photoOnly || step > 1 ? (
            <div className="flex gap-3">
              {!photoOnly && !(step === 2 && nameFromApple) ? (
                <Button type="button" variant="outline" className="flex-1 gap-2" onClick={handlePrevStep}>
                  <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                  Back
                </Button>
              ) : null}
              <Button
                type="button"
                className="flex-1 font-semibold"
                onClick={() => void handleNext()}
                disabled={!canAdvanceFromStep() || finishing}
              >
                {photoOnly || step === LEGAL_STEP
                  ? finishing
                    ? 'Saving…'
                    : photoOnly
                      ? 'Continue'
                      : 'Finish & go to app'
                  : step === 6 && !country.trim()
                    ? 'Skip'
                    : 'Next'}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="w-full font-semibold"
              onClick={() => void handleNext()}
              disabled={!canAdvanceFromStep() || finishing}
            >
              Next
            </Button>
          )}
          {step === 1 && !nameFromApple && !photoOnly ? (
            <button
              type="button"
              onClick={handleSignInInstead}
              className="text-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Already have an account? Sign in
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
