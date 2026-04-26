import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DateOfBirthPickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

const currentYear = new Date().getFullYear();
const MIN_AGE = 13;
const MAX_AGE = 100;
const MIN_YEAR = currentYear - MAX_AGE;
const MAX_YEAR = currentYear - MIN_AGE;

const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MAX_YEAR - i);

const DateOfBirthPicker = ({ value, onChange }: DateOfBirthPickerProps) => {
  const [month, setMonth] = useState(value ? value.getMonth() : 0);
  const [day, setDay] = useState(value ? value.getDate() : 1);
  const [year, setYear] = useState(value ? value.getFullYear() : currentYear - 18);
  const [touched, setTouched] = useState(!!value);

  const daysInMonth = getDaysInMonth(month, year);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleMonthChange = (m: number) => {
    setMonth(m);
    setTouched(true);
    const maxDay = getDaysInMonth(m, year);
    if (day > maxDay) setDay(maxDay);
  };

  const handleYearChange = (y: number) => {
    setYear(y);
    setTouched(true);
    const maxDay = getDaysInMonth(month, y);
    if (day > maxDay) setDay(maxDay);
  };

  const handleDayChange = (d: number) => {
    setDay(d);
    setTouched(true);
  };

  // Auto-confirm whenever any value changes
  useEffect(() => {
    if (touched) {
      onChange(new Date(year, month, day));
    }
  }, [month, day, year, touched]);

  const selectClass =
    "flex-1 h-12 rounded-lg border border-input bg-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer";

  return (
    <div className="flex gap-2">
      {/* Month */}
      <select
        value={month}
        onChange={(e) => handleMonthChange(Number(e.target.value))}
        className={cn(selectClass, "flex-[2]")}
      >
        {MONTHS.map((name, i) => (
          <option key={i} value={i}>{name}</option>
        ))}
      </select>

      {/* Day */}
      <select
        value={day}
        onChange={(e) => handleDayChange(Number(e.target.value))}
        className={selectClass}
      >
        {days.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* Year */}
      <select
        value={year}
        onChange={(e) => handleYearChange(Number(e.target.value))}
        className={cn(selectClass, "flex-[1.5]")}
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
};

export default DateOfBirthPicker;
