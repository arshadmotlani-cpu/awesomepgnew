import Link from 'next/link';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';
import type { ResidentTabMeta } from '@/src/lib/residentNavigation';
import {
  residentAccountSettingsHref,
  residentBookingsHref,
} from '@/src/lib/residentNavigation';

type Props = {
  meta: ResidentTabMeta;
  /** Optional back link override (sub-pages). */
  backHref?: string;
  backLabel?: string;
};

export function ResidentPageHeader({ meta, backHref, backLabel }: Props) {
  return (
    <header className="mb-5">
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {backHref ? (
          <Link href={backHref} className={ACCOUNT_BACK_LINK}>
            {backLabel ?? '← Back'}
          </Link>
        ) : (
          <>
            <Link href={residentBookingsHref()} className={ACCOUNT_BACK_LINK}>
              Bookings
            </Link>
            <span className="text-apg-muted" aria-hidden>
              /
            </span>
            <Link href={residentAccountSettingsHref()} className={ACCOUNT_BACK_LINK}>
              Settings
            </Link>
          </>
        )}
      </nav>
      <h1 className={`mt-3 ${ACCOUNT_PAGE_TITLE}`}>{meta.title}</h1>
      <p className={ACCOUNT_PAGE_SUBTITLE}>{meta.subtitle}</p>
    </header>
  );
}
