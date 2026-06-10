import rnkxWordmark from '@/assets/rnkx-wordmark-yellow.png';
import { cn } from '@/lib/utils';

interface RNKXLogoProps {
  className?: string;
  size?: 'header' | 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  header: 'h-7 w-auto sm:h-8',
  sm: 'h-8 w-auto sm:h-9',
  md: 'h-12 w-auto sm:h-14',
  lg: 'h-16 w-auto sm:h-20',
} as const;

export default function RNKXLogo({ className = '', size = 'lg' }: RNKXLogoProps) {
  return (
    <img
      src={rnkxWordmark}
      alt="RNKX"
      className={cn(
        sizeClasses[size],
        size === 'header' && 'translate-y-0.5',
        className,
      )}
    />
  );
}
