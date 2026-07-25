'use client';

import { useActionState } from 'react';
import {
  cancelAssetAction,
  updateStatusAction,
  type ActionState,
} from '@/src/capital/actions/assets';
import { Badge } from '@/src/capital/components/ui/badge';
import { Button } from '@/src/capital/components/ui/button';
import {
  canArchive,
  derivedBadges,
  lifecycleLabel,
  manualLifecycleTargets,
} from '@/src/capital/lib/vehicleLifecycle';

const initialState: ActionState = {};

export function LifecycleControl({
  assetId,
  currentStatus,
  purchasePricePaise,
  milestonesPaidPaise,
  fundingGapPaise = 0,
}: {
  assetId: string;
  currentStatus: string;
  purchasePricePaise: number;
  milestonesPaidPaise: number;
  fundingGapPaise?: number;
}) {
  const [state, formAction, pending] = useActionState(updateStatusAction, initialState);
  const [archiveState, archiveAction, archivePending] = useActionState(
    cancelAssetAction,
    initialState,
  );

  const targets = manualLifecycleTargets(currentStatus);
  const badges = derivedBadges({
    status: currentStatus,
    purchasePricePaise,
    milestonesPaidPaise,
    fundingGapPaise,
  });
  const closed =
    currentStatus === 'sold' ||
    currentStatus === 'settled' ||
    currentStatus === 'cancelled';

  return (
    <div className="ac-glass-card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Lifecycle</h3>
        <Badge variant="secondary">{lifecycleLabel(currentStatus)}</Badge>
        {badges.map((b) => (
          <Badge key={b.id} variant="warning">
            {b.label}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-ac-text-muted">
        Current state answers where this vehicle is now. Purchase activities stay on the Timeline.
      </p>

      {closed ? (
        <p className="text-sm text-ac-text-secondary">
          {currentStatus === 'sold'
            ? 'Sold — record payments, then settle from the Sale tab.'
            : `This vehicle is ${lifecycleLabel(currentStatus)}.`}
        </p>
      ) : (
        <>
          {targets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {targets.map((status) => (
                <form key={status} action={formAction}>
                  <input type="hidden" name="assetId" value={assetId} />
                  <input type="hidden" name="status" value={status} />
                  <Button type="submit" size="sm" variant="secondary" disabled={pending}>
                    → {lifecycleLabel(status)}
                  </Button>
                </form>
              ))}
            </div>
          ) : null}

          {canArchive(currentStatus) ? (
            <form action={archiveAction} className="border-t border-white/10 pt-3">
              <input type="hidden" name="assetId" value={assetId} />
              <input type="hidden" name="reason" value="Archived by dealer" />
              <Button type="submit" size="sm" variant="ghost" disabled={archivePending}>
                Archive vehicle
              </Button>
            </form>
          ) : null}
        </>
      )}

      {state.error ? <p className="text-sm text-ac-danger">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-ac-success">{state.success}</p> : null}
      {archiveState.error ? <p className="text-sm text-ac-danger">{archiveState.error}</p> : null}
      {archiveState.success ? (
        <p className="text-sm text-ac-success">{archiveState.success}</p>
      ) : null}
    </div>
  );
}
