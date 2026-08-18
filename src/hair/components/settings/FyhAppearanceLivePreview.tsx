'use client';

import { CalendarDays, LayoutDashboard, Receipt, Users } from 'lucide-react';
import type { FyhAccentId, FyhThemeMode } from '@/src/hair/lib/appearance';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { cn } from '@/src/hair/lib/utils';

type Props = {
  theme: FyhThemeMode;
  accent: FyhAccentId;
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, active: false },
  { id: 'customers', label: 'Customers', icon: Users, active: false },
  { id: 'appointments', label: 'Appointments', icon: CalendarDays, active: true },
  { id: 'billing', label: 'Billing', icon: Receipt, active: false },
] as const;

const TIME_SLOTS = ['10:00', '10:30', '11:00'];
const STAFF = ['Priya', 'Ravi'];

/**
 * Miniature FYHAIR shell — uses the same semantic CSS tokens/classes as production.
 * Theme + accent are applied on this root so the preview matches global appearance state.
 */
export function FyhAppearanceLivePreview({ theme, accent }: Props) {
  return (
    <div
      className={cn(
        'fyh-appearance-preview',
        theme === 'light' ? 'fyh-theme-light' : 'fyh-theme-dark',
      )}
      data-fyh-accent={accent}
      data-preview-theme={theme}
      data-preview-accent={accent}
      aria-label="Appearance live preview"
    >
      <header className="fyh-appearance-preview-header">
        <div className="fyh-appearance-preview-logo">
          <span className="fyh-appearance-preview-logo-mark" aria-hidden />
          <span className="font-semibold text-fyh-text">For Your Hair</span>
        </div>
        <div className="fyh-appearance-preview-search">
          <Input readOnly placeholder="Search customers, invoices…" className="!h-7 !min-h-7 text-xs" />
        </div>
        <div className="fyh-appearance-preview-admin">
          <span className="text-fyh-text-secondary">Admin</span>
          <span className="fyh-appearance-preview-avatar" aria-hidden>A</span>
        </div>
      </header>

      <div className="fyh-appearance-preview-body">
        <aside className="fyh-appearance-preview-sidebar">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <span
                key={item.id}
                className={cn('fyh-nav-link !min-h-8 !text-[10px]', item.active && 'fyh-nav-link-active')}
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </span>
            );
          })}
        </aside>

        <main className="fyh-appearance-preview-main">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fyh-text">Appointments</p>
            <div className="flex gap-0.5">
              <span className="fyh-scheduler-tab-active rounded px-2 py-0.5 text-[10px]">Day</span>
              <span className="fyh-scheduler-tab rounded px-2 py-0.5 text-[10px]">Week</span>
            </div>
          </div>

          <div className="fyh-scheduler fyh-appearance-preview-scheduler mt-2">
            <div className="fyh-scheduler-header fyh-appearance-preview-scheduler-header">
              <div className="fyh-scheduler-time-label fyh-appearance-preview-time">10:00</div>
              {STAFF.map((name) => (
                <div key={name} className="fyh-scheduler-staff-label truncate px-1 text-center">
                  {name}
                </div>
              ))}
            </div>
            {TIME_SLOTS.map((time, rowIdx) => (
              <div key={time} className="fyh-scheduler-row fyh-appearance-preview-scheduler-row">
                <div className="fyh-scheduler-time-label fyh-appearance-preview-time">{time}</div>
                {STAFF.map((name, colIdx) => (
                  <div
                    key={`${time}-${name}`}
                    className="fyh-scheduler-grid-slot fyh-appearance-preview-slot relative"
                  >
                    {rowIdx === 1 && colIdx === 0 ? (
                      <span className="fyh-appearance-preview-appt">Hair Cut · 45m</span>
                    ) : null}
                    {rowIdx === 0 && colIdx === 1 ? (
                      <span className="fyh-appearance-preview-now-line" aria-hidden />
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="fyh-panel-financial !p-2">
              <p className="fyh-panel-label !text-[10px]">Today revenue</p>
              <p className="fyh-money-value-accent text-sm font-bold tabular-nums">₹75,000</p>
              <p className="mt-0.5 text-[10px] text-fyh-on-panel-muted">Available credit ₹2,500</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button type="button" size="sm" className="!h-7 !min-h-7 text-[10px]">
                New appointment
              </Button>
              <Button type="button" variant="secondary" size="sm" className="!h-7 !min-h-7 text-[10px]">
                Secondary
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
