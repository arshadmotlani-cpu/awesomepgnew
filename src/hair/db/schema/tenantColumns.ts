import { uuid } from 'drizzle-orm/pg-core';

/** Mirrored Platform org UUID — no cross-DB FK. */
export const organizationIdCol = () => uuid('organization_id');

/** Mirrored Platform location UUID — no cross-DB FK. */
export const locationIdCol = () => uuid('location_id');

/** Mirrored Platform user UUID — no cross-DB FK. */
export const userIdCol = () => uuid('user_id');
