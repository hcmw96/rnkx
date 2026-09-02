import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countries } from "@/data/countries";

interface CountrySelectProps {
  value: string;
  onChange: (value: string) => void;
  /** Adds a "Not set" option. Onboarding omits this. */
  allowUnset?: boolean;
}

const UNSET_VALUE = '__unset__';

const CountrySelect = ({ value, onChange, allowUnset = false }: CountrySelectProps) => {
  const selectValue = allowUnset ? (value.trim() ? value : UNSET_VALUE) : value;

  return (
    <Select
      value={selectValue}
      onValueChange={(next) => onChange(next === UNSET_VALUE ? '' : next)}
    >
      <SelectTrigger className="h-14 text-lg bg-card border-border">
        <SelectValue placeholder="Select your country" />
      </SelectTrigger>
      <SelectContent 
        className="max-h-[300px] bg-popover z-[100]" 
        position="popper" 
        side="bottom" 
        align="center"
        sideOffset={4}
        avoidCollisions={true}
        collisionPadding={16}
      >
        {allowUnset ? (
          <SelectItem value={UNSET_VALUE} className="text-base pl-3">
            Not set
          </SelectItem>
        ) : null}
        {countries.map((country) => (
          <SelectItem 
            key={country.name} 
            value={country.name} 
            className="text-base pl-3 [&>span]:flex [&>span]:items-center [&>span]:gap-3"
          >
            <span className="text-xl">{country.flag}</span>
            <span>{country.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default CountrySelect;
