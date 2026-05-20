/** Default league avatar — three lime chevrons (reference UI). */
export function LeagueChevronLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="20" fill="hsla(0,0%,12%,1)" />
      <path
        d="M10 28V12l6 4-6 4v8l6-4-6-4z"
        fill="hsl(72 100% 50%)"
        opacity="0.35"
      />
      <path d="M16 28V12l6 4-6 4v8l6-4-6-4z" fill="hsl(72 100% 50%)" opacity="0.65" />
      <path d="M22 28V12l6 4-6 4v8l6-4-6-4z" fill="hsl(72 100% 50%)" />
    </svg>
  );
}
