import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  financialInvoices,
  floors,
  rentInvoices,
  residentRequests,
  rooms,
  vacatingRequests,
} from '@/src/db/schema';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';

export class AdminPgAccessError extends Error {
  constructor(message = 'Access denied for this PG.') {
    super(message);
    this.name = 'AdminPgAccessError';
  }
}

export function assertAdminCanAccessPg(session: AdminSession, pgId: string): void {
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, pgId)) {
    throw new AdminPgAccessError();
  }
}

export async function resolvePgIdForBooking(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({ pgId: floors.pgId })
    .from(bedReservations)
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .where(eq(bedReservations.bookingId, bookingId))
    .limit(1);
  return row?.pgId ?? null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function assertAdminBookingAccess(
  session: AdminSession,
  bookingId: string,
): Promise<{ pgId: string; customerId: string }> {
  if (!UUID_RE.test(bookingId.trim())) {
    throw new AdminPgAccessError('Booking not found.');
  }
  const [booking] = await db
    .select({ customerId: bookings.customerId })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!booking) throw new AdminPgAccessError('Booking not found.');
  const pgId = await resolvePgIdForBooking(bookingId);
  if (!pgId) throw new AdminPgAccessError('Could not resolve PG for booking.');
  assertAdminCanAccessPg(session, pgId);
  return { pgId, customerId: booking.customerId };
}

export async function assertAdminBookingCodeAccess(
  session: AdminSession,
  bookingCode: string,
): Promise<{ bookingId: string; pgId: string }> {
  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) throw new AdminPgAccessError('Booking not found.');
  const { pgId } = await assertAdminBookingAccess(session, booking.id);
  return { bookingId: booking.id, pgId };
}

export async function assertAdminResidentRequestAccess(
  session: AdminSession,
  requestId: string,
): Promise<{ pgId: string; bookingId: string }> {
  const [row] = await db
    .select({ pgId: residentRequests.pgId, bookingId: residentRequests.bookingId })
    .from(residentRequests)
    .where(eq(residentRequests.id, requestId))
    .limit(1);
  if (!row) throw new AdminPgAccessError('Request not found.');
  assertAdminCanAccessPg(session, row.pgId);
  return { pgId: row.pgId, bookingId: row.bookingId };
}

export async function assertAdminVacatingRequestAccess(
  session: AdminSession,
  requestId: string,
): Promise<{ pgId: string; bookingId: string }> {
  const [row] = await db
    .select({ bookingId: vacatingRequests.bookingId })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, requestId))
    .limit(1);
  if (!row) throw new AdminPgAccessError('Vacating request not found.');
  const { pgId } = await assertAdminBookingAccess(session, row.bookingId);
  return { pgId, bookingId: row.bookingId };
}

export async function assertAdminFinancialInvoiceAccess(
  session: AdminSession,
  invoiceId: string,
): Promise<{ pgId: string }> {
  const [row] = await db
    .select({ pgId: financialInvoices.pgId })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);
  if (!row) throw new AdminPgAccessError('Invoice not found.');
  assertAdminCanAccessPg(session, row.pgId);
  return { pgId: row.pgId };
}

export async function assertAdminRentInvoiceAccess(
  session: AdminSession,
  invoiceId: string,
): Promise<{ pgId: string }> {
  const [row] = await db
    .select({ pgId: rentInvoices.pgId })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  if (!row) throw new AdminPgAccessError('Invoice not found.');
  assertAdminCanAccessPg(session, row.pgId);
  return { pgId: row.pgId };
}

export async function assertAdminCustomerBookingAccess(
  session: AdminSession,
  customerId: string,
  bookingId?: string | null,
): Promise<{ pgId: string; bookingId: string }> {
  if (bookingId) {
    const [row] = await db
      .select({ customerId: bookings.customerId })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!row || row.customerId !== customerId) {
      throw new AdminPgAccessError('Booking does not belong to resident.');
    }
    const { pgId } = await assertAdminBookingAccess(session, bookingId);
    return { pgId, bookingId };
  }

  const [row] = await db
    .select({ bookingId: bookings.id })
    .from(bookings)
    .where(eq(bookings.customerId, customerId))
    .orderBy(desc(bookings.createdAt))
    .limit(1);
  if (!row) throw new AdminPgAccessError('No booking found for resident.');
  const { pgId } = await assertAdminBookingAccess(session, row.bookingId);
  return { pgId, bookingId: row.bookingId };
}
