import { capitalDb } from '@/src/capital/db/client';
import { acActivityLog } from '@/src/capital/db/schema';
import type { CapitalDbClient } from '@/src/capital/lib/db/types';

type LogParams = {
  action: string;
  entityType?: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function logActivity(params: LogParams, db: CapitalDbClient = capitalDb): Promise<void> {
  await db.insert(acActivityLog).values({
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    beforeState: params.beforeState,
    afterState: params.afterState,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });
}
