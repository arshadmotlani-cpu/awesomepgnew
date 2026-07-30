'use client';

import { useTransition } from 'react';
import {
  processOutboxBatchAction,
  runNotificationAutomationsAction,
} from '@/src/hair/actions/notifications';
import { Button } from '@/src/hair/components/ui/button';
import type { FyhNotificationOutbox } from '@/src/hair/db/schema/notifications';

function statusLabel(status: FyhNotificationOutbox['status']) {
  if (status === 'pending') return 'queued';
  if (status === 'sent') return 'sent (stub)';
  return 'failed';
}

function truncate(text: string, max = 72) {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

export function NotificationOutboxPanel({ rows }: { rows: FyhNotificationOutbox[] }) {
  const [pending, startTransition] = useTransition();
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <section className="rounded-2xl border border-[color:var(--fyh-border)] bg-[color:var(--fyh-surface)] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fyh-text">Notification outbox</h2>
          <p className="text-xs text-fyh-text-muted mt-1">
            Template-driven queue — delivery stub marks rows sent when WhatsApp is enabled.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending || pendingCount === 0}
            onClick={() => {
              startTransition(async () => {
                await processOutboxBatchAction(20);
              });
            }}
          >
            {pending ? 'Processing…' : `Process queue (${pendingCount})`}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await runNotificationAutomationsAction();
              });
            }}
          >
            Run automations
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-fyh-text-muted">No queued messages.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((o) => (
            <li
              key={o.id}
              className="rounded-xl border border-[color:var(--fyh-border)]/60 px-3 py-2 text-sm"
            >
              <div className="flex justify-between gap-3">
                <span className="truncate text-fyh-text">
                  {o.kind} → {o.recipient}
                </span>
                <span className="shrink-0 text-fyh-text-secondary">{statusLabel(o.status)}</span>
              </div>
              <p className="mt-1 text-xs text-fyh-text-muted">{truncate(o.body)}</p>
              {o.error ? <p className="mt-1 text-xs text-fyh-danger">{o.error}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
