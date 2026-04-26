import { Input } from '@/components/ui/input';

interface DisplayNameInputProps {
  value: string;
  onChange: (value: string) => void;
}

const DisplayNameInput = ({ value, onChange }: DisplayNameInputProps) => {
  return (
    <div className="space-y-2">
      <Input
        type="text"
        placeholder="e.g. Jake Smith"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 text-lg bg-card border-border"
        maxLength={50}
      />
      {value.length > 0 && value.trim().length < 2 && (
        <p className="text-sm text-destructive">Name must be at least 2 characters</p>
      )}
    </div>
  );
};

export default DisplayNameInput;
