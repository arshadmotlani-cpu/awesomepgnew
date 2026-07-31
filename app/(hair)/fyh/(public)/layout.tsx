import type { ReactNode } from 'react';

export const metadata = {
  robots: { index: false, follow: false },
};

/** Minimal shell — no ERP sidebar, header, or auth. */
export default function FyhPublicLayout({ children }: { children: ReactNode }) {
  return children;
}
