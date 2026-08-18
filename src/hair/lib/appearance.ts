/** FYHAIR global appearance — theme mode + accent colour. */

export const FYH_APPEARANCE_STORAGE_KEY = 'fyh-appearance';
export const FYH_THEME_STORAGE_KEY_LEGACY = 'fyh-theme';

export type FyhThemeMode = 'dark' | 'light';

export type FyhAccentId =
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green';

export type FyhAppearance = {
  theme: FyhThemeMode;
  accent: FyhAccentId;
};

export const FYH_DEFAULT_APPEARANCE: FyhAppearance = {
  theme: 'dark',
  accent: 'cyan',
};

export const FYH_ACCENT_IDS: FyhAccentId[] = [
  'cyan',
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
];

export const FYH_ACCENT_OPTIONS: Array<{ id: FyhAccentId; label: string; hex: string }> = [
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'purple', label: 'Purple', hex: '#a855f7' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'red', label: 'Red', hex: '#ef4444' },
  { id: 'orange', label: 'Orange', hex: '#f97316' },
  { id: 'yellow', label: 'Yellow', hex: '#eab308' },
  { id: 'green', label: 'Green', hex: '#22c55e' },
];

export function isFyhThemeMode(value: string): value is FyhThemeMode {
  return value === 'dark' || value === 'light';
}

export function isFyhAccentId(value: string): value is FyhAccentId {
  return (FYH_ACCENT_IDS as string[]).includes(value);
}

export function parseFyhAppearanceJson(raw: string | null): FyhAppearance | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FyhAppearance>;
    if (!parsed || typeof parsed !== 'object') return null;
    const theme = parsed.theme;
    const accent = parsed.accent;
    if (!isFyhThemeMode(theme ?? '')) return null;
    const themeMode = theme as FyhThemeMode;
    return {
      theme: themeMode,
      accent: accent && isFyhAccentId(accent) ? accent : FYH_DEFAULT_APPEARANCE.accent,
    };
  } catch {
    return null;
  }
}

/** Read persisted appearance (localStorage + legacy theme key migration). */
export function readStoredFyhAppearance(): FyhAppearance {
  if (typeof window === 'undefined') return FYH_DEFAULT_APPEARANCE;

  const fromJson = parseFyhAppearanceJson(
    window.localStorage.getItem(FYH_APPEARANCE_STORAGE_KEY),
  );
  if (fromJson) return fromJson;

  const legacy = window.localStorage.getItem(FYH_THEME_STORAGE_KEY_LEGACY);
  if (isFyhThemeMode(legacy ?? '')) {
    return { theme: legacy as FyhThemeMode, accent: FYH_DEFAULT_APPEARANCE.accent };
  }

  return FYH_DEFAULT_APPEARANCE;
}

export function persistFyhAppearance(appearance: FyhAppearance): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FYH_APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  window.localStorage.setItem(FYH_THEME_STORAGE_KEY_LEGACY, appearance.theme);
}

export function applyFyhAppearanceToDocument(appearance: FyhAppearance): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('fyh-theme-light', 'fyh-theme-dark');
  root.classList.add(
    appearance.theme === 'light' ? 'fyh-theme-light' : 'fyh-theme-dark',
  );
  root.setAttribute('data-fyh-accent', appearance.accent);
}

/** Inline script for before-hydration paint (hair layout). */
export const FYH_APPEARANCE_BLOCKING_SCRIPT = `(function(){
  var KEY='${FYH_APPEARANCE_STORAGE_KEY}',LEG='${FYH_THEME_STORAGE_KEY_LEGACY}',accent='cyan',theme='dark';
  try{
    var raw=localStorage.getItem(KEY);
    if(raw){
      var p=JSON.parse(raw);
      if(p.theme==='light'||p.theme==='dark')theme=p.theme;
      if(p.accent)accent=p.accent;
    }else{
      var leg=localStorage.getItem(LEG);
      if(leg==='light'||leg==='dark')theme=leg;
    }
  }catch(e){}
  var d=document.documentElement;
  d.classList.remove('fyh-theme-light','fyh-theme-dark');
  d.classList.add(theme==='light'?'fyh-theme-light':'fyh-theme-dark');
  d.setAttribute('data-fyh-accent',accent);
})();`;
