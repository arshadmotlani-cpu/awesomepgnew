import { ownerDb } from '@/src/owner/db/client';
import { ooAuditLog } from '@/src/owner/db/schema';

export async function writeAuditLog(input: {
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  actorId?: string | null;
}) {
  await ownerDb.insert(ooAuditLog).values({
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    beforeJson: input.beforeJson ?? null,
    afterJson: input.afterJson ?? null,
    actorId: input.actorId ?? null,
  });
}
