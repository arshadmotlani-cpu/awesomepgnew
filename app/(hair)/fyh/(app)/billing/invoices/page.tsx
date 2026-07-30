import { Suspense } from 'react';
import { InvoiceRegisterUi } from '@/src/hair/components/billing/InvoiceRegisterUi';
import {
  parseRegisterFiltersFromSearchParams,
  queryInvoiceRegister,
} from '@/src/hair/services/invoiceRegisterQueries';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function filtersToRecord(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

async function InvoiceRegisterPageInner({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseRegisterFiltersFromSearchParams(params);
  const result = await queryInvoiceRegister(filters);

  return (
    <InvoiceRegisterUi
      rows={result.rows}
      totalCount={result.totalCount}
      page={result.page}
      pageSize={result.pageSize}
      filters={filtersToRecord(params)}
    />
  );
}

export default function InvoiceRegisterPage(props: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="fyh-glass px-6 py-16 text-center text-sm text-fyh-text-muted">
          Loading invoice register…
        </div>
      }
    >
      <InvoiceRegisterPageInner {...props} />
    </Suspense>
  );
}
