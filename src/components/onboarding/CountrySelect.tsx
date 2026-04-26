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
}

const CountrySelect = ({ value, onChange }: CountrySelectProps) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-14 text-lg bg-card border-border">
        <SelectValue placeholder="Select your country" />
      </SelectTrigger>
      <SelectContent 
        className="max-h-[300px] bg-popover z-50" 
        position="popper" 
        side="bottom" 
        align="center"
        sideOffset={4}
        avoidCollisions={true}
        collisionPadding={16}
      >
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
