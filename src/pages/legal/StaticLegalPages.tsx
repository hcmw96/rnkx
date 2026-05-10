import type { ReactNode } from 'react';

function LegalDoc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-lg space-y-4">
        <h1 className="font-display text-2xl text-neon-lime">{title}</h1>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </article>
    </div>
  );
}

export function PrivacyPolicyPageRoute() {
  return (
    <LegalDoc title="Privacy Policy">
      <p>
        RNKX respects your privacy. This page will host the full privacy policy. Until then, contact support if you
        have questions about how we use account and workout data.
      </p>
    </LegalDoc>
  );
}

export function TermsPageRoute() {
  return (
    <LegalDoc title="Terms & Conditions">
      <p>The full RNKX terms of use will be published here.</p>
    </LegalDoc>
  );
}

export function WaiverPageRoute() {
  return (
    <LegalDoc title="User Waiver">
      <p>The participation and liability waiver associated with RNKX leagues will be listed here.</p>
    </LegalDoc>
  );
}

export function CookiesPageRoute() {
  return (
    <LegalDoc title="Cookies Policy">
      <p>Information about cookies and tracking technologies used by RNKX will appear here.</p>
    </LegalDoc>
  );
}
