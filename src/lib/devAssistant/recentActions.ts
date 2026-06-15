const KEY = 'apg-dev-assistant-actions';
const MAX = 20;

export type RecentAction = { label: string; at: string };

export function pushRecentAction(label: string) {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(KEY);
    const list: RecentAction[] = raw ? (JSON.parse(raw) as RecentAction[]) : [];
    const next = [...list, { label, at: new Date().toISOString() }].slice(-MAX);
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getRecentActions(): RecentAction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentAction[]) : [];
  } catch {
    return [];
  }
}

export function trackNavigation(pathname: string) {
  pushRecentAction(`Navigated to ${pathname}`);
}
