import { cn } from '@/lib/utils';

interface ProgressDotsProps {
  currentStep: number;
  totalSteps: number;
}

const ProgressDots = ({ currentStep, totalSteps }: ProgressDotsProps) => {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "transition-all duration-300 rounded-full",
            index === currentStep
              ? "w-8 h-2 bg-primary"
              : index < currentStep
              ? "w-2 h-2 bg-primary/60"
              : "w-2 h-2 bg-muted"
          )}
        />
      ))}
    </div>
  );
};

export default ProgressDots;
