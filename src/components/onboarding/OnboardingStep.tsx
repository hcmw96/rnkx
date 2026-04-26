import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface OnboardingStepProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const OnboardingStep = ({ title, subtitle, children }: OnboardingStepProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center w-full"
    >
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-2">
        {title}
      </h1>
      {subtitle && (
        <p className="text-muted-foreground text-center mb-6">
          {subtitle}
        </p>
      )}
      <div className="w-full">
        {children}
      </div>
    </motion.div>
  );
};

export default OnboardingStep;
