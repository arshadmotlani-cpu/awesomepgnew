import { index, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const deployments = pgTable(
  'deployments',
  {
    id: serial('id').primaryKey(),
    deploymentId: text('deployment_id').notNull(),
    status: text('status').notNull(),
    errorSummary: text('error_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('deployments_deployment_id_idx').on(t.deploymentId),
    index('deployments_created_at_idx').on(t.createdAt),
    index('deployments_status_idx').on(t.status),
  ],
);

export type DeploymentRecord = typeof deployments.$inferSelect;
export type NewDeploymentRecord = typeof deployments.$inferInsert;
