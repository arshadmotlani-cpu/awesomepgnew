import Link from 'next/link';
import type { ResidentHomePrimaryAction } from '@/src/lib/residents/residentHomeState';

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white shadow-sm hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A1F]/50';

/** Single primary call-to-action for resident home — no competing buttons. */
export function ResidentHomePrimaryAction({ action }: { action: ResidentHomePrimaryAction }) {
  return (
    <Link href={action.href} className={PRIMARY_BTN}>
      {action.label}
    </Link>
  );
}
