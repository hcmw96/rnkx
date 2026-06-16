import { cn } from '@/lib/utils';

type AppleSignInButtonProps = {
  mode: 'login' | 'signup';
  disabled?: boolean;
  onClick: () => void;
  className?: string;
};

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn('h-5 w-5 shrink-0', className)}
      fill="currentColor"
    >
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

export function AppleSignInButton({ mode, disabled, onClick, className }: AppleSignInButtonProps) {
  const label = mode === 'signup' ? 'Sign up with Apple' : 'Sign in with Apple';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-black text-[15px] font-medium text-white ring-1 ring-white/10 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <AppleLogo />
      <span>{label}</span>
    </button>
  );
}
