import { useCallback, useEffect, useRef, useState } from 'react';

export type WearableProvider =
  | 'strava'
  | 'whoop'
  | 'garmin'
  | 'apple'
  | 'polar'
  | 'coros'
  | 'fitbit'
  | 'oura'
  | 'samsung'
  | 'myzone';

export function useWearableConnect(options?: {
  onSuccess?: (provider: WearableProvider) => void;
}) {
  const [loading, setLoading] = useState<WearableProvider | null>(null);
  const onSuccessRef = useRef(options?.onSuccess);

  useEffect(() => {
    onSuccessRef.current = options?.onSuccess;
  }, [options?.onSuccess]);

  const connect = useCallback(async (provider: WearableProvider) => {
    setLoading(provider);
    await new Promise((r) => setTimeout(r, 450));
    onSuccessRef.current?.(provider);
    setLoading(null);
  }, []);

  const disconnect = useCallback(async () => {}, []);

  return { connect, disconnect, loading };
}
