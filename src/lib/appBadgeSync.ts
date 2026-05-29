import { isDespiaNative } from '@/services/onesignal';
import { supabase } from '@/services/supabase';

/** Sync iOS/Android home-screen badge to match in-app notification count. */
export function syncAppIconBadge(count: number): void {
  if (!isDespiaNative()) return;
  const badgeCount = Math.max(0, Math.min(99, Math.round(count)));
  void supabase.functions
    .invoke('update-app-badge', { body: { badge_count: badgeCount } })
    .then(({ error }) => {
      if (error) {
        console.warn('[badge] update-app-badge failed:', error.message);
      }
    })
    .catch((err) => console.warn('[badge] update-app-badge failed:', err));
}
