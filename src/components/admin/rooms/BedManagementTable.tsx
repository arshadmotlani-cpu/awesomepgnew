'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  archiveBedAction,
  moveBedToRoomAction,
  renameBedCodeAction,
  updateBedStatusInventoryAction,
} from '@/app/(admin)/admin/pgs/inventory-actions';
import { paiseToInr } from '@/src/lib/format';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

type MoveTarget = { roomId: string; label: string };

export function BedManagementTable({
  pgId,
  beds,
  moveTargets,
  onError,
  onSuccess,
}: {
  pgId: string;
  beds: PgInventoryBedRow[];
  moveTargets: MoveTarget[];
  onError?: (msg: string | null) => void;
  onSuccess?: (msg: string) => void;
}) {
  const router = useRouter();
  const [busyBedId, setBusyBedId] = useState<string | null>(null);
  const [renameBedId, setRenameBedId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveBedId, setMoveBedId] = useState<string | null>(null);
  const [moveTargetRoomId, setMoveTargetRoomId] = useState('');

  async function runBedAction(
    bedId: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg?: string,
  ) {
    setBusyBedId(bedId);
    onError?.(null);
    const result = await fn();
    setBusyBedId(null);
    if (!result.ok) {
      onError?.(result.error ?? 'Action failed');
      return;
    }
    if (successMsg) onSuccess?.(successMsg);
    router.refresh();
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="pb-2 pr-3">Bed</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3">Rent</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {beds.map((bed) => (
              <tr key={bed.bedId} className="border-t border-zinc-800/80">
                <td className="py-2 pr-3 font-medium text-white">
                  {renameBedId === bed.bedId ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void runBedAction(
                          bed.bedId,
                          () => renameBedCodeAction(pgId, bed.bedId, renameValue),
                          `✓ Bed renamed to ${renameValue}`,
                        ).then(() => setRenameBedId(null));
                      }}
                    >
                      <input
                        required
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                      />
                      <button type="submit" className="text-xs text-[#FF5A1F]">
                        Save
                      </button>
                    </form>
                  ) : (
                    bed.bedCode
                  )}
                </td>
                <td className="py-2 pr-3 capitalize">
                  {bed.bedStatus === 'maintenance' ? 'disabled' : bed.bedStatus}
                </td>
                <td className="py-2 pr-3">{paiseToInr(bed.monthlyRatePaise)}</td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    {bed.bedStatus === 'available' ? (
                      <button
                        type="button"
                        disabled={busyBedId === bed.bedId}
                        onClick={() =>
                          runBedAction(
                            bed.bedId,
                            () => updateBedStatusInventoryAction(pgId, bed.bedId, 'maintenance'),
                            `✓ ${bed.bedCode} disabled`,
                          )
                        }
                        className="text-amber-400 hover:underline disabled:opacity-50"
                      >
                        Disable
                      </button>
                    ) : bed.bedStatus === 'maintenance' || bed.bedStatus === 'blocked' ? (
                      <button
                        type="button"
                        disabled={busyBedId === bed.bedId}
                        onClick={() =>
                          runBedAction(
                            bed.bedId,
                            () => updateBedStatusInventoryAction(pgId, bed.bedId, 'available'),
                            `✓ ${bed.bedCode} enabled`,
                          )
                        }
                        className="text-emerald-400 hover:underline disabled:opacity-50"
                      >
                        Enable
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyBedId === bed.bedId}
                      onClick={() => {
                        setRenameBedId(bed.bedId);
                        setRenameValue(bed.bedCode);
                      }}
                      className="text-zinc-400 hover:underline disabled:opacity-50"
                    >
                      Rename
                    </button>
                    {moveTargets.length > 0 ? (
                      <button
                        type="button"
                        disabled={busyBedId === bed.bedId}
                        onClick={() => {
                          setMoveBedId(bed.bedId);
                          setMoveTargetRoomId(moveTargets[0]?.roomId ?? '');
                        }}
                        className="text-zinc-400 hover:underline disabled:opacity-50"
                      >
                        Move
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyBedId === bed.bedId}
                      onClick={() => {
                        if (!window.confirm(`Archive bed ${bed.bedCode}?`)) return;
                        void runBedAction(
                          bed.bedId,
                          () => archiveBedAction(pgId, bed.bedId),
                          `✓ ${bed.bedCode} archived`,
                        );
                      }}
                      className="text-rose-400 hover:underline disabled:opacity-50"
                    >
                      Archive
                    </button>
                  </div>
                  {moveBedId === bed.bedId ? (
                    <form
                      className="mt-2 flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void runBedAction(
                          bed.bedId,
                          () => moveBedToRoomAction(pgId, bed.bedId, moveTargetRoomId),
                          `✓ ${bed.bedCode} moved`,
                        ).then(() => setMoveBedId(null));
                      }}
                    >
                      <select
                        required
                        value={moveTargetRoomId}
                        onChange={(e) => setMoveTargetRoomId(e.target.value)}
                        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-white"
                      >
                        {moveTargets.map((t) => (
                          <option key={t.roomId} value={t.roomId}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-xs text-[#FF5A1F]">
                        Move bed
                      </button>
                      <button
                        type="button"
                        onClick={() => setMoveBedId(null)}
                        className="text-xs text-zinc-500"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
