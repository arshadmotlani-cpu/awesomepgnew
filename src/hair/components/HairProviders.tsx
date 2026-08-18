'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  applyFyhAppearanceToDocument,
  FYH_DEFAULT_APPEARANCE,
  type FyhAccentId,
  type FyhAppearance,
  type FyhThemeMode,
  persistFyhAppearance,
  readStoredFyhAppearance,
} from '@/src/hair/lib/appearance';

type AppearanceContextValue = {
  theme: FyhThemeMode;
  accent: FyhAccentId;
  appearance: FyhAppearance;
  setTheme: (theme: FyhThemeMode) => void;
  setAccent: (accent: FyhAccentId) => void;
  setAppearance: (patch: Partial<FyhAppearance>) => void;
  toggleTheme: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function HairProviders({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState<FyhAppearance>(FYH_DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAppearanceState(readStoredFyhAppearance());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyFyhAppearanceToDocument(appearance);
    persistFyhAppearance(appearance);
  }, [appearance, ready]);

  const setTheme = useCallback((theme: FyhThemeMode) => {
    setAppearanceState((prev) => ({ ...prev, theme }));
  }, []);

  const setAccent = useCallback((accent: FyhAccentId) => {
    setAppearanceState((prev) => ({ ...prev, accent }));
  }, []);

  const setAppearance = useCallback((patch: Partial<FyhAppearance>) => {
    setAppearanceState((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleTheme = useCallback(() => {
    setAppearanceState((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const value = useMemo(
    () => ({
      theme: appearance.theme,
      accent: appearance.accent,
      appearance,
      setTheme,
      setAccent,
      setAppearance,
      toggleTheme,
    }),
    [appearance, setAccent, setAppearance, setTheme, toggleTheme],
  );

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}

export function useHairTheme(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useHairTheme must be used within HairProviders');
  return ctx;
}
