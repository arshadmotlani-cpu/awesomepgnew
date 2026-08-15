'use client';

import { useState } from 'react';
import { AdminOpsDialog } from '@/src/components/admin/rooms/AdminOpsDialog';
import { BedManagementTable } from '@/src/components/admin/rooms/BedManagementTable';
import type { PgInventoryBedRow } from '@/src/services/pgInventory';

type MoveTarget = { roomId: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  pgId: string;
  roomId: string;
  roomNumber: string;
  beds: PgInventoryBedRow[];
  moveTargets: MoveTarget[];
  onToast: (message: string, tone: 'success' | 'error') => void;
};

export function RoomBedsDrawer({
  open,
  onClose,
  pgId,
  roomId,
  roomNumber,
  beds,
  moveTargets,
  onToast,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  return (
    <AdminOpsDialog
      open={open}
      onClose={onClose}
      title={`Manage beds — Room ${roomNumber}`}
      subtitle={`${beds.length} bed${beds.length === 1 ? '' : 's'}`}
      variant="drawer"
      width="lg"
    >
      <p className="mb-4 text-sm text-zinc-400">
        Enable, disable, rename, or move beds. Actions that would break an active resident booking
        are blocked by the system.
      </p>
      <BedManagementTable
        pgId={pgId}
        beds={beds}
        moveTargets={moveTargets.filter((t) => t.roomId !== roomId)}
        onError={setError}
        onSuccess={(msg) => onToast(msg, 'success')}
      />
      {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
    </AdminOpsDialog>
  );
}
