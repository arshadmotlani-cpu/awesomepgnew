/**
 * Customer identity merge — reassign all customer-scoped FKs to canonical row.
 * Used by auth integrity repair; never deletes history.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  actionItems,
  adminNotifications,
  automationEvents,
  bedReserveHolds,
  billingGenerationFailures,
  bookings,
  checkoutSettlements,
  couponRedemptions,
  customers,
  depositLedger,
  depositSettlements,
  electricityInvoices,
  emailDeliveryLog,
  financialInvoices,
  kycSubmissions,
  operationsQueueDismissals,
  paymentLinks,
  pgPaymentRecords,
  playstationMemberships,
  referralRedemptions,
  referralEarnings,
  rentInvoices,
  residentBillingProfiles,
  residentRequests,
  residentResidencies,
  residentUploadEvents,
  roomChangeRequests,
  roomElectricityLedgerEntries,
  electricitySettlementLedger,
  unresolvedActions,
  vacatingRequests,
  visitorSessions,
} from '@/src/db/schema';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbExecutor = typeof db | DbTx;

export async function reassignCustomerForeignKeys(
  fromCustomerId: string,
  toCustomerId: string,
  tx: DbExecutor,
): Promise<void> {
  if (fromCustomerId === toCustomerId) return;
  const now = new Date();

  await tx.update(bookings).set({ customerId: toCustomerId, updatedAt: now }).where(eq(bookings.customerId, fromCustomerId));
  await tx.update(bedReserveHolds).set({ customerId: toCustomerId }).where(eq(bedReserveHolds.customerId, fromCustomerId));
  await tx.update(kycSubmissions).set({ customerId: toCustomerId }).where(eq(kycSubmissions.customerId, fromCustomerId));
  await tx.update(residentBillingProfiles).set({ customerId: toCustomerId, updatedAt: now }).where(eq(residentBillingProfiles.customerId, fromCustomerId));
  await tx.update(residentResidencies).set({ customerId: toCustomerId, updatedAt: now }).where(eq(residentResidencies.customerId, fromCustomerId));
  await tx.update(depositSettlements).set({ customerId: toCustomerId }).where(eq(depositSettlements.customerId, fromCustomerId));
  await tx.update(vacatingRequests).set({ customerId: toCustomerId, updatedAt: now }).where(eq(vacatingRequests.customerId, fromCustomerId));
  await tx.update(depositLedger).set({ customerId: toCustomerId }).where(eq(depositLedger.customerId, fromCustomerId));
  await tx.update(roomChangeRequests).set({ customerId: toCustomerId, updatedAt: now }).where(eq(roomChangeRequests.customerId, fromCustomerId));
  await tx.update(couponRedemptions).set({ customerId: toCustomerId }).where(eq(couponRedemptions.customerId, fromCustomerId));
  await tx.update(financialInvoices).set({ customerId: toCustomerId, updatedAt: now }).where(eq(financialInvoices.customerId, fromCustomerId));
  await tx.update(roomElectricityLedgerEntries).set({ customerId: toCustomerId }).where(eq(roomElectricityLedgerEntries.customerId, fromCustomerId));
  await tx.update(electricitySettlementLedger).set({ customerId: toCustomerId }).where(eq(electricitySettlementLedger.customerId, fromCustomerId));
  await tx.update(rentInvoices).set({ customerId: toCustomerId, updatedAt: now }).where(eq(rentInvoices.customerId, fromCustomerId));
  await tx.update(electricityInvoices).set({ customerId: toCustomerId, updatedAt: now }).where(eq(electricityInvoices.customerId, fromCustomerId));
  await tx.update(pgPaymentRecords).set({ customerId: toCustomerId, updatedAt: now }).where(eq(pgPaymentRecords.customerId, fromCustomerId));
  await tx.update(operationsQueueDismissals).set({ customerId: toCustomerId }).where(eq(operationsQueueDismissals.customerId, fromCustomerId));
  await tx.update(residentUploadEvents).set({ customerId: toCustomerId }).where(eq(residentUploadEvents.customerId, fromCustomerId));
  await tx.update(checkoutSettlements).set({ customerId: toCustomerId, updatedAt: now }).where(eq(checkoutSettlements.customerId, fromCustomerId));
  await tx.update(playstationMemberships).set({ customerId: toCustomerId, updatedAt: now }).where(eq(playstationMemberships.customerId, fromCustomerId));
  await tx.update(residentRequests).set({ customerId: toCustomerId, updatedAt: now }).where(eq(residentRequests.customerId, fromCustomerId));
  await tx.update(paymentLinks).set({ residentId: toCustomerId }).where(eq(paymentLinks.residentId, fromCustomerId));
  await tx.update(unresolvedActions).set({ residentId: toCustomerId, updatedAt: now }).where(eq(unresolvedActions.residentId, fromCustomerId));
  await tx.update(actionItems).set({ residentId: toCustomerId, updatedAt: now }).where(eq(actionItems.residentId, fromCustomerId));
  await tx.update(adminNotifications).set({ residentId: toCustomerId }).where(eq(adminNotifications.residentId, fromCustomerId));
  await tx.update(visitorSessions).set({ customerId: toCustomerId }).where(eq(visitorSessions.customerId, fromCustomerId));
  await tx.update(automationEvents).set({ customerId: toCustomerId }).where(eq(automationEvents.customerId, fromCustomerId));
  await tx.update(billingGenerationFailures).set({ customerId: toCustomerId }).where(eq(billingGenerationFailures.customerId, fromCustomerId));
  await tx.update(emailDeliveryLog).set({ customerId: toCustomerId }).where(eq(emailDeliveryLog.customerId, fromCustomerId));
  await tx.update(referralRedemptions).set({ referrerCustomerId: toCustomerId }).where(eq(referralRedemptions.referrerCustomerId, fromCustomerId));
  await tx.update(referralRedemptions).set({ refereeCustomerId: toCustomerId }).where(eq(referralRedemptions.refereeCustomerId, fromCustomerId));
  await tx.update(referralEarnings).set({ referrerCustomerId: toCustomerId }).where(eq(referralEarnings.referrerCustomerId, fromCustomerId));
}

/** Merge phone/email/password from duplicates onto canonical when canonical is missing them. */
export async function mergeIdentityFieldsOntoCanonical(
  canonicalId: string,
  duplicateIds: string[],
  tx: DbExecutor,
): Promise<void> {
  const [canonical] = await tx
    .select()
    .from(customers)
    .where(eq(customers.id, canonicalId))
    .limit(1);
  if (!canonical || duplicateIds.length === 0) return;

  const dupRows = await tx
    .select()
    .from(customers)
    .where(inArray(customers.id, duplicateIds));

  let phone = canonical.phone;
  let email = canonical.email;
  let passwordHash = canonical.passwordHash;
  let mustSetPassword = canonical.mustSetPassword;
  let fullName = canonical.fullName;
  let kycStatus = canonical.kycStatus;

  for (const dup of dupRows) {
    if (!phone?.trim() && dup.phone?.trim()) phone = dup.phone;
    if (!email?.trim() && dup.email?.trim()) email = dup.email;
    if (!passwordHash && dup.passwordHash) {
      passwordHash = dup.passwordHash;
      mustSetPassword = dup.mustSetPassword;
    }
    if ((!fullName?.trim() || fullName === 'Resident') && dup.fullName?.trim()) {
      fullName = dup.fullName;
    }
    if (kycStatus !== 'approved' && dup.kycStatus === 'approved') {
      kycStatus = dup.kycStatus;
    }
  }

  await tx
    .update(customers)
    .set({
      phone,
      email,
      passwordHash,
      mustSetPassword,
      fullName,
      kycStatus,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, canonicalId));
}

/** Collect all active customer ids in the same phone/email cluster. */
export async function collectSplitIdentityClusterIds(
  seedCustomerId: string,
): Promise<string[]> {
  const [seed] = await db
    .select({ id: customers.id, phone: customers.phone, email: customers.email })
    .from(customers)
    .where(eq(customers.id, seedCustomerId))
    .limit(1);
  if (!seed) return [];

  const rows = await db.execute<{ id: string }>(sql`
    SELECT DISTINCT c.id
    FROM customers c
    WHERE c.archived_at IS NULL
      AND (
        (c.phone IS NOT NULL AND c.phone != '' AND c.phone = ${seed.phone})
        OR c.email = ${seed.email}
      )
  `);
  return rows.map((r) => r.id);
}
