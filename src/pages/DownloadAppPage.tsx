import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import { APP_STORE_URL } from '@/lib/nativeShell';

export default function DownloadAppPage() {
  const { pathname } = useLocation();
  const isJoinInvite = pathname.startsWith('/join/');

  useEffect(() => {
    document.title = 'Download RNKX on the App Store';
    return () => {
      document.title = 'RNKX';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex max-h-[100svh] flex-col overflow-hidden bg-black text-foreground">
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pt-[max(1.5rem,calc(env(safe-area-inset-top,0px)+0.75rem))] [-webkit-overflow-scrolling:touch]">
          <div className="my-auto flex w-full max-w-[360px] flex-col items-center gap-7 self-center py-1">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <RNKXLogo size="lg" className="-my-3 h-[4.75rem] w-auto" />
              <p className="text-[8px] font-medium uppercase leading-none tracking-[0.22em] text-neon-lime">
                The digital performance sport
              </p>
            </div>

            <h1 className="w-full shrink-0 text-center font-headline text-[clamp(2.5rem,12vw,3.05rem)] font-black uppercase leading-[0.95] tracking-[-0.04em]">
              <span className="block text-white">Download RNKX</span>
              <span className="block text-neon-lime">on the App Store</span>
            </h1>

            <p className="max-w-[20rem] text-center text-sm leading-relaxed text-white/70">
              {isJoinInvite
                ? 'Club invites open in the RNKX iPhone app. Download it on the App Store to join.'
                : 'RNKX runs as an iPhone app, not in a browser. Get it on the App Store to sign in, train, and compete.'}
            </p>

            <Button
              asChild
              className="h-14 w-full rounded-2xl bg-neon-lime text-[1.05rem] font-bold text-black hover:bg-neon-lime/90 focus-visible:ring-neon-lime"
            >
              <a href={APP_STORE_URL} rel="noopener noreferrer">
                Download on the App Store
              </a>
            </Button>

            <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/40">
              <Link className="transition-colors hover:text-white/70" to="/privacy">
                Privacy
              </Link>
              <span aria-hidden>·</span>
              <Link className="transition-colors hover:text-white/70" to="/terms">
                Terms
              </Link>
              <span aria-hidden>·</span>
              <Link className="transition-colors hover:text-white/70" to="/waiver">
                Waiver
              </Link>
            </nav>
          </div>
        </div>
        <div
          className="h-[max(3.25rem,calc(env(safe-area-inset-bottom,0px)+1.75rem))] shrink-0"
          aria-hidden
        />
      </div>
    </div>
  );
}
