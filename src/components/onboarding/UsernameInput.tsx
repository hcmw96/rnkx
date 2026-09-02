import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsernameInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidChange: (isValid: boolean) => void;
}

const UsernameInput = ({ value, onChange, onValidChange }: UsernameInputProps) => {
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkGenRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    checkGenRef.current += 1;
    const requested = value;
    setIsAvailable(null);
    setIsChecking(false);
    onValidChange(false);

    const debounce = setTimeout(() => {
      const gen = checkGenRef.current;
      const isCurrent = () => gen === checkGenRef.current && valueRef.current === requested;

      void (async () => {
        if (requested.length < 3) {
          if (!isCurrent()) return;
          setIsChecking(false);
          setIsAvailable(null);
          setError(requested.length > 0 ? 'Username must be at least 3 characters' : null);
          onValidChange(false);
          return;
        }

        if (requested.length > 20) {
          if (!isCurrent()) return;
          setIsChecking(false);
          setIsAvailable(null);
          setError('Username must be 20 characters or less');
          onValidChange(false);
          return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(requested)) {
          if (!isCurrent()) return;
          setIsChecking(false);
          setIsAvailable(null);
          setError('Only letters, numbers, and underscores allowed');
          onValidChange(false);
          return;
        }

        setIsChecking(true);
        setError(null);

        const { data, error: queryError } = await supabase
          .from('athletes')
          .select('id')
          .eq('username', requested.toLowerCase())
          .maybeSingle();

        if (!isCurrent()) return;

        setIsChecking(false);

        if (queryError) {
          setError('Error checking username');
          onValidChange(false);
          return;
        }

        const available = !data;
        setIsAvailable(available);
        setError(available ? null : 'Username is already taken');
        onValidChange(available);
      })();
    }, 300);

    return () => {
      clearTimeout(debounce);
      checkGenRef.current += 1;
    };
  }, [value, onValidChange]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          type="text"
          placeholder="Choose a username"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "h-14 text-lg pr-12 bg-card border-border",
            isAvailable === true && "border-primary focus-visible:ring-primary",
            isAvailable === false && "border-destructive focus-visible:ring-destructive"
          )}
          maxLength={20}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          {isChecking && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          {!isChecking && isAvailable === true && <Check className="w-5 h-5 text-primary" />}
          {!isChecking && isAvailable === false && <X className="w-5 h-5 text-destructive" />}
        </div>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      {isAvailable && (
        <p className="text-sm text-primary">Username is available!</p>
      )}
    </div>
  );
};

export default UsernameInput;
