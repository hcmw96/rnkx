import rnkxLogo from '@/assets/rnkx-logo.svg';

interface RNKXLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const RNKXLogo = ({ className = '', size = 'lg' }: RNKXLogoProps) => {
  const sizes = {
    sm: 'h-10 sm:h-12',
    md: 'h-14 sm:h-16',
    lg: 'h-16 sm:h-20 md:h-24',
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <img 
        src={rnkxLogo} 
        alt="RNKX" 
        className={`${sizes[size]} w-auto`}
      />
    </div>
  );
};

export default RNKXLogo;
