import type { VacatingDateChangePreview } from '@/src/services/vacatingDateChange';

export type VacatingDateChangeActionState =
  | { ok: true; preview?: VacatingDateChangePreview }
  | { ok: false; error: string };
