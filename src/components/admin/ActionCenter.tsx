'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, toneForStatus } from '@/src/components/admin/Badge';
import { EmptyState } from '@/src/components/admin/EmptyState';
import { IconClipboard } from '@/src/components/admin/icons';
import { TBody, TD, TH, THead, TR, Table } from '@/src/components/admin/Table';
import {
  ACTION_ITEM_GROUP_LABELS,
  ACTION_ITEM_GROUP_ORDER,
} from '@/src/lib/actionCenter/constants';
import { formatDate, paiseToInr, titleCase } from '@/src/lib/format';
import type { ActionItemRow } from '@/src/services/actionItems';
import { ActionDrawer } from './ActionDrawer';

type Props = {
  items: ActionItemRow[];
};

function priorityTone(p: ActionItemRow['priority']) {
  if (p === 'high') return 'rose' as const;
  if (p === 'medium') return 'amber' as const;
  return 'zinc' as const;
}

export function ActionCenter({ items }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, ActionItemRow[]>();
    for (const type of ACTION_ITEM_GROUP_ORDER) {
      map.set(type, []);
    }
    for (const item of items) {
      const list = map.get(item.type) ?? [];
      list.push(item);
      map.set(item.type, list);
    }
    return ACTION_ITEM_GROUP_ORDER.map((type) => ({
      type,
      label: ACTION_ITEM_GROUP_LABELS[type],
      items: map.get(type) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [items]);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconClipboard className="text-apg-silver" width={32} height={32} />}
        title="All clear"
        description="No open action items. Sync will pick up rent, electricity, KYC, vacating, refunds, and payment reviews."
      />
    );
  }

  return (
    <>
      <div className="space-y-8">
        {grouped.map((group) => (
          <section key={group.type} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">{group.label}</h2>
                <p className="text-xs text-apg-silver">{group.items.length} open</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-[#1A1F27]">
              <Table>
                <THead>
                  <TR>
                    <TH>Resident / title</TH>
                    <TH className="hidden sm:table-cell">PG · room · bed</TH>
                    <TH className="hidden md:table-cell">Amount</TH>
                    <TH className="hidden lg:table-cell">Due</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {group.items.map((item) => (
                    <TR
                      key={item.id}
                      className="cursor-pointer transition hover:bg-white/[0.03]"
                      onClick={() => setSelectedId(item.id)}
                    >
                      <TD>
                        <button
                          type="button"
                          className="text-left"
                          onClick={() => setSelectedId(item.id)}
                        >
                          <p className="font-medium text-white">
                            {item.residentName ?? item.title}
                          </p>
                          {item.residentName ? (
                            <p className="mt-0.5 text-xs text-apg-silver">{item.title}</p>
                          ) : null}
                        </button>
                      </TD>
                      <TD className="hidden text-apg-silver sm:table-cell">
                        {[item.pgName, item.roomNumber ? `R${item.roomNumber}` : null, item.bedCode]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </TD>
                      <TD className="hidden md:table-cell">
                        {item.amount != null ? (
                          <span className="font-medium text-white">{paiseToInr(item.amount)}</span>
                        ) : (
                          <span className="text-apg-silver">—</span>
                        )}
                      </TD>
                      <TD className="hidden text-apg-silver lg:table-cell">
                        {item.dueDate ? formatDate(item.dueDate) : '—'}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge>
                          <Badge tone={toneForStatus(item.status)}>{titleCase(item.status)}</Badge>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </section>
        ))}
      </div>

      {selectedId ? (
        <ActionDrawer
          actionItemId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={refresh}
        />
      ) : null}
    </>
  );
}
