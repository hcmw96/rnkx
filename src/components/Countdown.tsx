import { useState, useEffect } from 'react';

interface CountdownProps {
  targetDate: Date;
}

const Countdown = ({ targetDate }: CountdownProps) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = targetDate.getTime() - new Date().getTime();
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  const TimeUnit = ({ value, label }: { value: number; label: string }) => (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div className="text-3xl sm:text-4xl md:text-5xl font-black text-cyan-400 tabular-nums tracking-tight"
             style={{ fontFamily: 'Anton, sans-serif', textShadow: '0 0 30px hsl(188 100% 50% / 0.5)' }}>
          {String(value).padStart(2, '0')}
        </div>
      </div>
      <span className="text-[10px] sm:text-xs uppercase tracking-widest text-muted-foreground mt-1">
        {label}
      </span>
    </div>
  );

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-6">
      <TimeUnit value={timeLeft.days} label="Days" />
      <span className="text-2xl sm:text-3xl text-cyan-400/50 font-light">:</span>
      <TimeUnit value={timeLeft.hours} label="Hours" />
      <span className="text-2xl sm:text-3xl text-cyan-400/50 font-light">:</span>
      <TimeUnit value={timeLeft.minutes} label="Mins" />
      <span className="text-2xl sm:text-3xl text-cyan-400/50 font-light">:</span>
      <TimeUnit value={timeLeft.seconds} label="Secs" />
    </div>
  );
};

export default Countdown;
