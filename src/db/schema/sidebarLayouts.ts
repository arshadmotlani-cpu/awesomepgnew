import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminUsers } from './adminUsers';
import { sidebarLayoutTypeEnum } from './enums';

export const sidebarLayouts = pgTable(
  'sidebar_layouts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => adminUsers.id, { onDelete: 'cascade' }),
    layoutType: sidebarLayoutTypeEnum('layout_type').notNull(),
    moduleKey: text('module_key').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    hidden: boolean('hidden').notNull().default(false),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sidebar_layouts_user_type_idx').on(t.userId, t.layoutType, t.sortOrder),
    uniqueIndex('sidebar_layouts_global_module_unique')
      .on(t.moduleKey)
      .where(sql`${t.layoutType} = 'global' AND ${t.userId} IS NULL`),
    uniqueIndex('sidebar_layouts_personal_module_unique')
      .on(t.userId, t.moduleKey)
      .where(sql`${t.layoutType} = 'personal' AND ${t.userId} IS NOT NULL`),
  ],
);

export type SidebarLayoutRow = typeof sidebarLayouts.$inferSelect;
export type NewSidebarLayoutRow = typeof sidebarLayouts.$inferInsert;
