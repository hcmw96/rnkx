export function formatSyncAgo(lastSynced: string | null | undefined): string {
  if (!lastSynced) return 'Not synced yet';
  const t = new Date(lastSynced).getTime();
  if (Number.isNaN(t)) return 'Not synced yet';

  const ms = Date.now() - t;
  if (ms < 60_000) return 'Synced just now';

  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `Synced ${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Synced ${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `Synced ${days}d ago`;
}

export function formatLeaguesSubtitle(leagues: string[]): string {
  const parts: string[] = [];
  if (leagues.includes('engine')) parts.push('Engine');
  if (leagues.includes('run')) parts.push('Run');
  return parts.length ? parts.join(' & ') : 'None selected';
}

export function maxHrSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'manual':
      return 'Set manually';
    case 'whoop_historic':
    case 'whoop_live':
      return 'Detected from WHOOP';
    case 'terra_live':
      return 'Detected from your wearable';
    case 'apple_watch':
      return 'Auto-detected';
    default:
      return source ? `Source: ${source}` : 'Auto-detected';
  }
}
