import type { ReactNode } from 'react';
import { apgOsAdminMetadata } from '@/src/lib/brand/apgOsAdminMetadata';
import '@/src/styles/apg-os-tokens.css';

export const metadata = apgOsAdminMetadata;

export default function AdminAuthLayout({ children }: { children: ReactNode }) {
  return children;
}
