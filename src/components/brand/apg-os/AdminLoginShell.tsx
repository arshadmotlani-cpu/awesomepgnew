import type { ReactNode } from 'react';
import { ApgOsMark } from '@/src/components/brand/apg-os/ApgOsMark';
import { APG_OS_BRAND } from '@/src/lib/brand/apgOsTokens';

/** Premium split login — distinct from customer marketing site. */
export function AdminLoginShell({ children }: { children: ReactNode }) {
  return (
    <div className="apg-os-auth flex min-h-[100dvh] bg-[var(--apg-os-bg-shell,#f8fafc)] text-slate-900 scheme-light">
      <aside
        className="relative hidden w-[min(440px,42vw)] shrink-0 flex-col justify-center overflow-hidden border-r border-white/10 p-10 lg:flex"
        style={{ background: APG_OS_BRAND.color.bgShell }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: APG_OS_BRAND.color.gradient }}
          aria-hidden
        />
        <div className="relative z-10 flex justify-center">
          <ApgOsMark size={48} style="filled" surface="dark" title="PG" />
        </div>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="mb-8 flex flex-col items-center lg:hidden">
          <ApgOsMark size={48} style="filled" surface="light" title="PG" />
        </div>
        {children}
      </main>
    </div>
  );
}
