import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/app/AppShell';
import { HowItWorksScrollBody } from '@/components/HowItWorksContent';
import { Button } from '@/components/ui/button';

export default function HowItWorksPage() {
  const navigate = useNavigate();

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-4">
        <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>
        <header className="space-y-1">
          <h1 className="font-display text-xl text-foreground">How it works</h1>
          <p className="text-sm text-muted-foreground">Scoring rules & fair play guidelines</p>
        </header>
        <HowItWorksScrollBody />
      </section>
    </AppShell>
  );
}
