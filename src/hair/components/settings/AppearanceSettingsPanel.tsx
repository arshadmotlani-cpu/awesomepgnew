'use client';

import { useHairTheme } from '@/src/hair/components/HairProviders';
import { Button } from '@/src/hair/components/ui/button';
import {
  FYH_ACCENT_OPTIONS,
  type FyhAccentId,
  type FyhThemeMode,
} from '@/src/hair/lib/appearance';
import { cn } from '@/src/hair/lib/utils';

const THEME_OPTIONS: Array<{
  id: FyhThemeMode;
  title: string;
  description: string;
}> = [
  {
    id: 'dark',
    title: 'Dark',
    description: 'Professional dark FYHAIR interface',
  },
  {
    id: 'light',
    title: 'Light',
    description: 'Clean bright interface',
  },
];

export function AppearanceSettingsPanel() {
  const { theme, accent, setTheme, setAccent } = useHairTheme();

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
            Theme
          </h3>
          <p className="mt-1 text-sm text-fyh-text-muted">
            Choose a complete appearance mode. Surfaces, text, and borders all adapt together.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {THEME_OPTIONS.map((option) => {
            const selected = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  'rounded-xl border p-4 text-left transition',
                  selected
                    ? 'border-[color:var(--fyh-accent)] bg-[color-mix(in_srgb,var(--fyh-accent)_10%,var(--fyh-bg-surface))] ring-2 ring-[color:var(--fyh-accent)]'
                    : 'border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] hover:border-[color:var(--fyh-border-hover)]',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                      selected
                        ? 'border-[color:var(--fyh-accent)]'
                        : 'border-[color:var(--fyh-border-strong)]',
                    )}
                  >
                    {selected ? (
                      <span
                        className="h-2 w-2 rounded-full bg-[color:var(--fyh-accent)]"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                  <div>
                    <p className="font-semibold text-fyh-text">{option.title}</p>
                    <p className="mt-1 text-sm text-fyh-text-secondary">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
            Accent colour
          </h3>
          <p className="mt-1 text-sm text-fyh-text-muted">
            Primary interaction colour across navigation, buttons, links, and highlights.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {FYH_ACCENT_OPTIONS.map((option) => {
            const selected = accent === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-label={option.label}
                aria-pressed={selected}
                onClick={() => setAccent(option.id as FyhAccentId)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border p-2 transition',
                  selected
                    ? 'border-[color:var(--fyh-accent)] ring-2 ring-[color:var(--fyh-accent)]'
                    : 'border-[color:var(--fyh-border)] hover:border-[color:var(--fyh-border-hover)]',
                )}
              >
                <span
                  className="h-8 w-8 rounded-full border border-[color:var(--fyh-border-strong)] shadow-sm"
                  style={{ backgroundColor: option.hex }}
                />
                <span className="text-xs font-medium text-fyh-text-secondary">{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
          Preview
        </h3>
        <div
          className="rounded-xl border border-[color:var(--fyh-border-strong)] p-4"
          style={{
            background: 'var(--fyh-bg-surface)',
            color: 'var(--fyh-text-primary)',
          }}
        >
          <div className="fyh-panel-muted !p-4">
            <p className="text-sm font-semibold text-fyh-on-panel">Dashboard</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs text-fyh-on-panel-muted">Revenue</p>
                <p className="fyh-money-value-accent text-2xl font-bold tabular-nums">₹75,000</p>
              </div>
              <Button type="button" size="sm">New appointment</Button>
            </div>
            <div className="mt-3 flex gap-2">
              <span
                className="rounded-md px-2 py-1 text-xs font-semibold"
                style={{
                  background: 'var(--fyh-nav-active-bg)',
                  color: 'var(--fyh-accent)',
                }}
              >
                Active tab
              </span>
              <span className="rounded-md border border-[color:var(--fyh-border)] px-2 py-1 text-xs text-fyh-on-panel-muted">
                Secondary
              </span>
            </div>
          </div>
        </div>
        <p className="text-xs text-fyh-text-muted">
          Changes apply immediately and persist across sessions on this device.
        </p>
      </section>
    </div>
  );
}
