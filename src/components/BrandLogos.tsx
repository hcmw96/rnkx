import { cn } from '@/lib/utils';
import stravaImg from '@/assets/wearables/strava.png';
import whoopImg from '@/assets/wearables/whoop.png';
import appleImg from '@/assets/wearables/apple.png';
import garminImg from '@/assets/wearables/garmin.png';
import polarImg from '@/assets/wearables/polar.png';
import corosImg from '@/assets/wearables/coros.png';
import fitbitImg from '@/assets/wearables/fitbit.png';
import ouraImg from '@/assets/wearables/oura.png';
import samsungImg from '@/assets/wearables/samsung.png';
import myzoneImg from '@/assets/wearables/myzone.png';

const WHITE_LOGO_FILTER = 'brightness(0) invert(1)';

interface BrandImgLogoProps {
  className?: string;
  src: string;
  alt: string;
}

function BrandImgLogo({ className, src, alt }: BrandImgLogoProps) {
  return (
    <div
      className={cn(
        'flex h-full w-full max-w-full min-w-0 shrink-0 items-center justify-center text-center',
        className
      )}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full w-auto max-w-full object-contain"
        style={{ filter: WHITE_LOGO_FILTER }}
      />
    </div>
  );
}

export function StravaLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={stravaImg} alt="Strava" />;
}

export function WhoopLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={whoopImg} alt="WHOOP" />;
}

export function AppleLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={appleImg} alt="Apple" />;
}

export function GarminLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={garminImg} alt="Garmin" />;
}

export function PolarLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={polarImg} alt="Polar" />;
}

export function CorosLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={corosImg} alt="COROS" />;
}

export function FitbitLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={fitbitImg} alt="Fitbit" />;
}

export function OuraLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={ouraImg} alt="Oura" />;
}

export function SamsungLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={samsungImg} alt="Samsung" />;
}

/** Used when Myzone appears in wearable flows */
export function MyzoneLogo({ className }: { className?: string }) {
  return <BrandImgLogo className={className} src={myzoneImg} alt="Myzone" />;
}
