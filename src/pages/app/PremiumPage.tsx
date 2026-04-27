import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

const BENEFITS = [
  'Private leagues',
  'Friend challenges',
  'Group messaging',
  'Priority support',
] as const;

export default function PremiumPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg space-y-8">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>

        <header className="space-y-2 text-center sm:text-left">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">RNKX Premium</h1>
          <p className="text-sm text-muted-foreground">Unlock the full experience.</p>
        </header>

        <ul className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          {BENEFITS.map((line) => (
            <li key={line} className="flex gap-3 text-sm text-foreground">
              <span className="mt-0.5 text-primary" aria-hidden>
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            className="flex-1 font-semibold"
            onClick={() => toast.message('Apple IAP via Despia will be available soon.')}
          >
            Upgrade
          </Button>
          <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
            Not now
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Apple In-App Purchase via Despia will be wired here later.
        </p>
      </div>
    </div>
  );
}
