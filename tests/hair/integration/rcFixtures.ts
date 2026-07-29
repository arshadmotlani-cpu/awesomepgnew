import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCommissionEntries,
  fyhCustomerPackages,
  fyhCustomerTimeline,
  fyhCustomers,
  fyhInvoicePayments,
  fyhInvoices,
  fyhMembershipPlans,
  fyhNotificationOutbox,
  fyhPackagePlans,
  fyhProducts,
  fyhResources,
  fyhServices,
  fyhStaff,
  fyhStockMovements,
} from '@/src/hair/db/schema';

export async function requireRcFixtures() {
  const [staff] = await hairDb
    .select()
    .from(fyhStaff)
    .where(eq(fyhStaff.fullName, 'RC Stylist Asha'))
    .limit(1);
  const [staff2] = await hairDb
    .select()
    .from(fyhStaff)
    .where(eq(fyhStaff.fullName, 'RC Stylist Rohan'))
    .limit(1);
  const [chair] = await hairDb
    .select()
    .from(fyhResources)
    .where(eq(fyhResources.name, 'RC Chair 1'))
    .limit(1);
  const [cut] = await hairDb.select().from(fyhServices).where(eq(fyhServices.code, 'RC-CUT')).limit(1);
  const [blow] = await hairDb
    .select()
    .from(fyhServices)
    .where(eq(fyhServices.code, 'RC-BLOW'))
    .limit(1);
  const [product] = await hairDb
    .select()
    .from(fyhProducts)
    .where(eq(fyhProducts.sku, 'RC-SHAMPOO'))
    .limit(1);
  const [membership] = await hairDb.select().from(fyhMembershipPlans).limit(1);
  const [pkgPlan] = await hairDb
    .select()
    .from(fyhPackagePlans)
    .where(eq(fyhPackagePlans.name, 'RC Cut Pack 5'))
    .limit(1);

  if (!staff || !staff2 || !chair || !cut || !blow || !product || !membership || !pkgPlan) {
    throw new Error('RC fixtures missing — run npm run hair:db:seed');
  }

  return { staff, staff2, chair, cut, blow, product, membership, pkgPlan };
}

export async function createRcCustomer(suffix: string) {
  const phone = `9${String(Date.now()).slice(-9)}`.slice(0, 10);
  const [row] = await hairDb
    .insert(fyhCustomers)
    .values({
      fullName: `RC Customer ${suffix}`,
      phone,
      isActive: true,
    })
    .returning();
  return row!;
}

export async function getInvoice(id: string) {
  const [row] = await hairDb.select().from(fyhInvoices).where(eq(fyhInvoices.id, id)).limit(1);
  return row ?? null;
}

export async function listPayments(invoiceId: string) {
  return hairDb.select().from(fyhInvoicePayments).where(eq(fyhInvoicePayments.invoiceId, invoiceId));
}

export async function timelineFor(customerId: string) {
  return hairDb
    .select()
    .from(fyhCustomerTimeline)
    .where(eq(fyhCustomerTimeline.customerId, customerId));
}

export async function commissionsForStaff(staffId: string) {
  return hairDb
    .select()
    .from(fyhCommissionEntries)
    .where(eq(fyhCommissionEntries.staffId, staffId));
}

export async function stockMovementsFor(productId: string) {
  return hairDb
    .select()
    .from(fyhStockMovements)
    .where(eq(fyhStockMovements.productId, productId));
}

export async function customerPackage(customerId: string) {
  const [row] = await hairDb
    .select()
    .from(fyhCustomerPackages)
    .where(eq(fyhCustomerPackages.customerId, customerId))
    .limit(1);
  return row ?? null;
}

export async function pendingOutboxCount() {
  const rows = await hairDb
    .select()
    .from(fyhNotificationOutbox)
    .where(eq(fyhNotificationOutbox.status, 'pending'));
  return rows.length;
}

let slotSeq = 0;
// Per-run entropy so successive `node --test` invocations don't re-collide with
// stale appointments from prior runs against the shared Hair DB.
const RUN_OFFSET_DAYS = 30 + (Math.floor(Date.now() / 1000) % 60);

/**
 * Unique future slot inside salon hours, avoiding lunch 13:00–13:30.
 * Each call reserves a fresh future day at 11:00 sharp, guaranteeing no
 * collisions across serial tests even when many appointments accumulate.
 */
export function nextSlot(_hoursFromNow = 2) {
  slotSeq += 1;
  const start = new Date();
  start.setSeconds(0, 0);
  start.setDate(start.getDate() + RUN_OFFSET_DAYS + slotSeq);
  start.setHours(11, 0, 0, 0);
  // Skip Sundays (salon closed in seed).
  if (start.getDay() === 0) start.setDate(start.getDate() + 1);
  return start;
}
