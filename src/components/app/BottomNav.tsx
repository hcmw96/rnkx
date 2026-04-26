import { Link, useLocation } from "react-router-dom";
import { Home, Trophy, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

const navItems = [
  { path: "/app", icon: Home, label: "Dashboard" },
  { path: "/app/leaderboard", icon: Trophy, label: "Leaderboard" },
  { path: "/app/recovery", icon: Heart, label: "Recovery" },
  { path: "/app/profile", icon: User, label: "Profile" },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="app-footer border-t border-border bg-background">
      <div className="flex h-16 items-center justify-around px-4">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              onClick={() => haptic('light')}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 transition-colors",
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
