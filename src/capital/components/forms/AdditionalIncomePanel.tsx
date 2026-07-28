'use client';

import { useActionState, useEffect, useState } from 'react';
import {
  recordAdditionalIncomeAction,
  reverseAdditionalIncomeAction,
  updateAdditionalIncomeAction,
  type ActionState,
} from '@/src/capital/actions/assets';
import { CurrencyInput } from '@/src/capital/components/forms/CurrencyInput';
import { MoneyDisplay } from '@/src/capital/components/MoneyDisplay';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import { useRefreshCapitalView } from '@/src/capital/hooks/useRefreshCapitalView';
import {
  VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS,
  VEHICLE_ADDITIONAL_INCOME_TYPES,
  type VehicleAdditionalIncomeType,
} from '@/src/capital/db/schema';

const initialState: ActionState = {};

export type AdditionalIncomeRow = {
  id: string;
  incomeType: string;
  amountPaise: number;
  occurredAt: string;
  notes?: string | null;
};

function incomeLabel(type: string): string {
  return (
    VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS[type as VehicleAdditionalIncomeType] ?? type
  );
}

export function AdditionalIncomePanel({
  assetId,
  totalAdditionalIncomePaise,
  rows,
  canEdit,
}: {
  assetId: string;
  totalAdditionalIncomePaise: number;
  rows: AdditionalIncomeRow[];
  canEdit: boolean;
}) {
  const refresh = useRefreshCapitalView();
  const [createState, createAction, createPending] = useActionState(
    recordAdditionalIncomeAction,
    initialState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateAdditionalIncomeAction,
    initialState,
  );
  const [reverseState, reverseAction] = useActionState(
    reverseAdditionalIncomeAction,
    initialState,
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [editAmount, setEditAmount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (createState.success || updateState.success || reverseState.success) {
      refresh();
      if (createState.success) {
        setAmount(undefined);
      }
      if (updateState.success) {
        setEditingId(null);
        setEditAmount(undefined);
      }
    }
  }, [createState.success, updateState.success, reverseState.success, refresh]);

  return (
    <div className="ac-glass-card space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold">Additional Income</h3>
          <p className="mt-0.5 text-xs text-ac-text-muted">
            Earnings outside investment — does not change TVI or Active Capital.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-ac-text-muted">Total Additional Income</p>
          <MoneyDisplay
            paise={totalAdditionalIncomePaise}
            className="text-base font-semibold text-ac-accent"
          />
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-ac-text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                {canEdit ? <th className="px-3 py-2 text-right font-medium"> </th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row) =>
                editingId === row.id ? (
                  <tr key={row.id} className="bg-white/[0.02]">
                    <td colSpan={canEdit ? 5 : 4} className="px-3 py-3">
                      <form action={updateAction} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="assetId" value={assetId} />
                        <Input name="occurredAt" type="date" defaultValue={row.occurredAt} required />
                        <select
                          name="incomeType"
                          defaultValue={row.incomeType}
                          className="h-10 rounded-md border border-white/10 bg-black/40 px-2 text-sm"
                          required
                        >
                          {VEHICLE_ADDITIONAL_INCOME_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                        <Input name="notes" defaultValue={row.notes ?? ''} placeholder="Notes" />
                        <CurrencyInput
                          name="amount"
                          allowNegative={false}
                          value={editAmount ?? row.amountPaise / 100}
                          onValueChange={setEditAmount}
                          required
                        />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" disabled={updatePending}>
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setEditAmount(undefined);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                      {updateState.error ? (
                        <p className="mt-2 text-sm text-ac-danger">{updateState.error}</p>
                      ) : null}
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td className="px-3 py-2 tabular-nums text-ac-text-secondary">{row.occurredAt}</td>
                    <td className="px-3 py-2">{incomeLabel(row.incomeType)}</td>
                    <td className="max-w-[12rem] truncate px-3 py-2 text-ac-text-muted">
                      {row.notes || '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MoneyDisplay paise={row.amountPaise} />
                    </td>
                    {canEdit ? (
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(row.id);
                              setEditAmount(row.amountPaise / 100);
                            }}
                          >
                            Edit
                          </Button>
                          <form action={reverseAction}>
                            <input type="hidden" name="incomeId" value={row.id} />
                            <input type="hidden" name="assetId" value={assetId} />
                            <Button type="submit" size="sm" variant="ghost">
                              Delete
                            </Button>
                          </form>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-ac-text-muted">No additional income recorded yet.</p>
      )}

      {canEdit ? (
        <form action={createAction} className="grid gap-2 border-t border-white/5 pt-4 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="assetId" value={assetId} />
          <div>
            <label className="mb-1 block text-xs text-ac-text-muted">Date</label>
            <Input name="occurredAt" type="date" required />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ac-text-muted">Type</label>
            <select
              name="incomeType"
              className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-2 text-sm"
              defaultValue="brokerage"
              required
            >
              {VEHICLE_ADDITIONAL_INCOME_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VEHICLE_ADDITIONAL_INCOME_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-ac-text-muted">Notes</label>
            <Input name="notes" placeholder="Optional" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ac-text-muted">Amount (₹)</label>
            <CurrencyInput
              name="amount"
              allowNegative={false}
              value={amount ?? ''}
              onValueChange={setAmount}
              required
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={createPending}>
              {createPending ? 'Saving…' : 'Add income'}
            </Button>
          </div>
          {createState.error ? (
            <p className="text-sm text-ac-danger sm:col-span-2 lg:col-span-5">{createState.error}</p>
          ) : null}
          {createState.success ? (
            <p className="text-sm text-ac-success sm:col-span-2 lg:col-span-5">{createState.success}</p>
          ) : null}
          {reverseState.error ? (
            <p className="text-sm text-ac-danger sm:col-span-2 lg:col-span-5">{reverseState.error}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
