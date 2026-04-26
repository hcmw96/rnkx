import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface LegalConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const LegalConsent = ({ checked, onChange }: LegalConsentProps) => {
  return (
    <div className="space-y-6">
      <div className="bg-muted/50 border border-border rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <Checkbox
            id="legal-consent"
            checked={checked}
            onCheckedChange={(value) => onChange(value === true)}
            className="mt-1"
          />
          <Label 
            htmlFor="legal-consent" 
            className="text-sm text-muted-foreground leading-relaxed cursor-pointer"
          >
            I agree to the RNKX{' '}
            <a 
              href="/terms" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              Terms & Conditions
            </a>
            ,{' '}
            <a 
              href="/privacy" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              Privacy Policy
            </a>
            {' & '}
            <a 
              href="/waiver" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
              onClick={(e) => e.stopPropagation()}
            >
              User Waiver
            </a>
            .
          </Label>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        By continuing, you confirm that you have read and understood our policies.
      </p>
    </div>
  );
};

export default LegalConsent;
