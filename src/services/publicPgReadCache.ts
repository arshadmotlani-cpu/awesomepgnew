/**
 * Cached public read paths — PG listings, room details, amenities, pricing.
 * Never used for bookings, payments, KYC, electricity, deposits, or check-ins.
 */
import type {
  CustomerPgDetail,
  CustomerPgListRow,
  CustomerRoomCard,
  CustomerRoomDetail,
  QueryResult,
} from '@/src/db/queries/customer';
export type {
  CustomerPgDetail,
  CustomerPgListRow,
  CustomerRoomCard,
  CustomerRoomDetail,
  QueryResult,
};
import {
  getPgBySlug as getPgBySlugDb,
  getRoomDetail as getRoomDetailDb,
  listPublicPgs as listPublicPgsDb,
  listRoomsForPg as listRoomsForPgDb,
} from '@/src/db/queries/customer';
import { cacheKeys, cacheTtl } from '@/src/lib/cache/keys';
import { cacheReadThrough } from '@/src/lib/cache/readThrough';
import { todayString } from '@/src/lib/dates';

export function listPublicPgs(): Promise<QueryResult<CustomerPgListRow[]>> {
  return cacheReadThrough({
    key: cacheKeys.publicPgList(),
    ttlSeconds: cacheTtl.publicPgList,
    namespace: 'public.pg_list',
    fetch: () => listPublicPgsDb(),
  });
}

export function getPgBySlug(slug: string): Promise<QueryResult<CustomerPgDetail | null>> {
  return cacheReadThrough({
    key: cacheKeys.publicPgBySlug(slug),
    ttlSeconds: cacheTtl.publicPgDetail,
    namespace: 'public.pg_detail',
    fetch: () => getPgBySlugDb(slug),
  });
}

export function listRoomsForPg(
  pgId: string,
  referenceDate?: string,
): Promise<QueryResult<CustomerRoomCard[]>> {
  const refDate = referenceDate ?? todayString();
  return cacheReadThrough({
    key: cacheKeys.publicRoomsForPg(pgId, refDate),
    ttlSeconds: cacheTtl.publicRooms,
    namespace: 'public.rooms',
    fetch: () => listRoomsForPgDb(pgId, referenceDate),
  });
}

export function getRoomDetail(
  pgSlug: string,
  roomId: string,
  referenceDate?: string,
): Promise<QueryResult<CustomerRoomDetail | null>> {
  const refDate = referenceDate ?? todayString();
  return cacheReadThrough({
    key: cacheKeys.publicRoomDetail(pgSlug, roomId, refDate),
    ttlSeconds: cacheTtl.publicRoomDetail,
    namespace: 'public.room_detail',
    fetch: () => getRoomDetailDb(pgSlug, roomId, referenceDate),
  });
}
