import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

const APP_SETTINGS_DEEP_LINK = 'rnkx://app/settings';

/**
 * Safari handoff after Terra (Garmin / Polar / COROS / Fitbit) OAuth.
 * Terra must not keep the user on its widget loading screen inside the Despia webview.
 */
export default function TerraCallback() {
  const failed =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('status') === 'failed';

  useEffect(() => {
    document.title = 'RNKX';
    window.location.href = APP_SETTINGS_DEEP_LINK;
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
      <h1 className="text-lg font-semibold">
        {failed ? 'Could not connect that device' : 'Return to RNKX'}
      </h1>
      <p className="max-w-sm text-sm text-white/70">
        {failed
          ? 'Open the RNKX app and try Connect new device again.'
          : 'Your device is connecting. Open RNKX to finish — workouts sync automatically.'}
      </p>
      <Button asChild className="h-12 rounded-2xl bg-neon-lime px-6 font-bold text-black hover:bg-neon-lime/90">
        <a href={APP_SETTINGS_DEEP_LINK}>Open RNKX</a>
      </Button>
    </div>
  );
}
