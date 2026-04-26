import { cn } from '@/lib/utils';

interface GenderSelectProps {
  value: string | null;
  onChange: (gender: string) => void;
}

const genderOptions = [
  { value: 'male', label: 'Male', icon: '♂' },
  { value: 'female', label: 'Female', icon: '♀' },
];

const GenderSelect = ({ value, onChange }: GenderSelectProps) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {genderOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex flex-col items-center justify-center p-4 sm:p-6 rounded-xl border-2 transition-all duration-200",
            value === option.value
              ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
              : "border-border bg-card hover:border-muted-foreground/50 hover:bg-muted/50"
          )}
        >
          <span className="text-2xl sm:text-3xl mb-1 sm:mb-2">{option.icon}</span>
          <span className={cn(
            "font-medium text-xs sm:text-sm text-center leading-tight",
            value === option.value ? "text-primary" : "text-foreground"
          )}>
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
};

export default GenderSelect;
