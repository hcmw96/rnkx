import { AnimatePresence } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import ProgressDots from '@/components/onboarding/ProgressDots';
import UsernameInput from '@/components/onboarding/UsernameInput';
import { Button } from '@/components/ui/button';
import { useProfileGate } from '@/context/ProfileGateContext';
import { supabase } from '@/services/supabase';

const ONBOARDING_STEP_COUNT = 8;

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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

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
        return displayName.trim().length >= 2;
      case 2:
        return usernameValid && username.trim().length >= 3;
      case 3:
        if (!dob || age === null) return false;
        return age >= 13 && age <= 100;
      case 4:
        return gender !== null && gender.length > 0;
      case 5:
        return country.trim().length > 0;
      case 6:
        return leagues.length > 0;
      case 7:
        return true;
      case 8:
        return legalAccepted;
      default:
        return false;
    }
  }, [step, displayName, username, usernameValid, dob, age, gender, country, leagues, legalAccepted]);

  const handleBack = () => {
    setSubmitError(null);
    if (step > 1) setStep((s) => s - 1);
  };

  const handleNext = async () => {
    setSubmitError(null);
    if (!canAdvanceFromStep()) return;

    if (step === 8) {
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

      const row = {
        id: userId,
        user_id: userId,
        display_name: displayName.trim(),
        username: username.trim().toLowerCase(),
        date_of_birth: formatLocalDate(dob),
        gender,
        country,
        selected_leagues: leagues,
        age,
      };

      const { error: insertError } = await supabase.from('athletes').upsert(row, { onConflict: 'id' });

      if (insertError) {
        setFinishing(false);
        setSubmitError(insertError.message);
        return;
      }

      await refetchProfile();
      setFinishing(false);
      navigate('/app', { replace: true });
      return;
    }

    setStep((s) => s + 1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 pb-10 pt-8">
        <header className="mb-6 flex flex-col items-center gap-2 pt-6">
          <h1 className="font-display text-4xl tracking-wide text-primary">RNKX</h1>
          <p className="text-center text-sm text-muted-foreground">Complete your profile</p>
        </header>

        <div className="mb-6">
          <ProgressDots currentStep={step - 1} totalSteps={ONBOARDING_STEP_COUNT} />
        </div>

        {submitError && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {submitError}
          </p>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <OnboardingStep key="s1" title="Display name" subtitle="How should we show you on leaderboards?">
              <DisplayNameInput value={displayName} onChange={setDisplayName} />
            </OnboardingStep>
          )}

          {step === 2 && (
            <OnboardingStep key="s2" title="Username" subtitle="Pick a unique handle (letters, numbers, underscore).">
              <UsernameInput value={username} onChange={setUsername} onValidChange={onUsernameValidChange} />
            </OnboardingStep>
          )}

          {step === 3 && (
            <OnboardingStep key="s3" title="Date of birth" subtitle="You must be at least 13 years old.">
              <DateOfBirthPicker value={dob} onChange={setDob} />
            </OnboardingStep>
          )}

          {step === 4 && (
            <OnboardingStep key="s4" title="Gender" subtitle="Used for fair scoring benchmarks.">
              <GenderSelect value={gender} onChange={setGender} />
            </OnboardingStep>
          )}

          {step === 5 && (
            <OnboardingStep key="s5" title="Country" subtitle="Where do you train?">
              <CountrySelect value={country} onChange={setCountry} />
            </OnboardingStep>
          )}

          {step === 6 && (
            <OnboardingStep key="s6" title="Leagues" subtitle="Choose one or both. You can change this later.">
              <LeagueSelect value={leagues} onChange={setLeagues} connectedWearables={wearables} />
            </OnboardingStep>
          )}

          {step === 7 && (
            <OnboardingStep key="s7" title="Wearables" subtitle="Connect devices you use (optional for now).">
              <OnboardingWearables onConnectionsChange={onWearablesChange} />
            </OnboardingStep>
          )}

          {step === 8 && (
            <OnboardingStep key="s8" title="Almost there" subtitle="Review and accept to finish setup.">
              <LegalConsent checked={legalAccepted} onChange={setLegalAccepted} />
            </OnboardingStep>
          )}
        </AnimatePresence>

        <div className="mt-8 flex gap-3">
          {step > 1 ? (
            <Button type="button" variant="outline" className="flex-1" onClick={handleBack}>
              Back
            </Button>
          ) : (
            <div className="flex-1" />
          )}
          <Button
            type="button"
            className="flex-1 font-semibold"
            onClick={() => void handleNext()}
            disabled={!canAdvanceFromStep() || finishing}
          >
            {step === 8 ? (finishing ? 'Saving…' : 'Finish & go to app') : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
