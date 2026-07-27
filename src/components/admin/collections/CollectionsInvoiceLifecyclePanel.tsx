import { formatDate } from '@/src/lib/format';
import type {
  CollectionsInvoiceHistoryEvent,
  CollectionsInvoiceHistoryRow,
} from '@/src/services/collectionsInvoiceHistory';

/**
 * Admin Collections lifecycle strip — label from invoiceLifecycleLabel + recent billing_events.
 */
export function CollectionsInvoiceLifecyclePanel({
  row,
  events,
}: {
  row: CollectionsInvoiceHistoryRow;
  events: CollectionsInvoiceHistoryEvent[];
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-[#1A1F27] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Collections lifecycle</h2>
          <p className="mt-1 text-xs text-apg-silver">
            Labels from Resident Financial Engine · events are append-only audit.
          </p>
        </div>
        <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">
          {row.lifecycleLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-apg-silver">Stored status</dt>
          <dd className="mt-0.5 font-medium text-white">{row.status}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Effective</dt>
          <dd className="mt-0.5 font-medium text-white">{row.effectiveStatus}</dd>
        </div>
        <div>
          <dt className="text-apg-silver">Due</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-white">
            {formatDate(row.dueDate)}
          </dd>
        </div>
        <div>
          <dt className="text-apg-silver">Billing month</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-white">
            {formatDate(row.billingMonth)}
          </dd>
        </div>
      </dl>

      {events.length === 0 ? (
        <p className="mt-4 text-xs text-apg-silver">No billing events recorded yet.</p>
      ) : (
        <ul className="mt-4 space-y-2 border-t border-white/10 pt-4">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
            >
              <span className="font-medium text-white">{ev.eventLabel}</span>
              <span className="tabular-nums text-apg-silver">
                {formatDate(ev.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
