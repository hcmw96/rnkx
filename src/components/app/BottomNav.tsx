import { Link, useLocation } from "react-router-dom";
import { Home, Trophy, User, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const navItems = [
  { path: "/app", icon: Home, label: "Dashboard" },
  { path: "/app/leaderboard", icon: Trophy, label: "Leaderboard" },
  { path: "/app/social", icon: UsersRound, label: "Social" },
  { path: "/app/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="app-footer border-t border-border bg-background">
      <div className="flex h-16 items-center justify-around px-4">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive =
            path === "/app"
              ? location.pathname === "/app"
              : path === "/app/social"
                ? location.pathname.startsWith("/app/social") ||
                  location.pathname.startsWith("/app/friends") ||
                  location.pathname.startsWith("/app/leagues") ||
                  location.pathname.startsWith("/app/chat")
                : path === "/app/profile"
                  ? location.pathname === "/app/profile"
                  : location.pathname === path || location.pathname.startsWith(`${path}/`);
          return (
            <Link
              key={path}
              to={path}
              onClick={() => haptic('light')}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 transition-colors",
                isActive
                  ? "text-secondary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "glow-cyan")} />
              <span className={cn("text-xs font-medium", isActive && "text-secondary")}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
