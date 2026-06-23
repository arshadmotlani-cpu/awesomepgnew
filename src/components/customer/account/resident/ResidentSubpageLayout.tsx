import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ACCOUNT_BACK_LINK,
  ACCOUNT_PAGE_SUBTITLE,
  ACCOUNT_PAGE_TITLE,
} from '@/src/components/customer/accountStyles';

type Props = {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

/** Consistent shell for pay-rent, pay-electricity, history, vacating sub-routes. */
export function ResidentSubpageLayout({
  backHref,
  backLabel,
  title,
  subtitle,
  children,
}: Props) {
  return (
    <div className="apg-resident-subpage mx-auto w-full max-w-xl space-y-5 px-4 py-10 sm:px-6">
      <header>
        <Link href={backHref} className={ACCOUNT_BACK_LINK}>
          {backLabel}
        </Link>
        <h1 className={`mt-2 ${ACCOUNT_PAGE_TITLE}`}>{title}</h1>
        {subtitle ? <p className={ACCOUNT_PAGE_SUBTITLE}>{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}
