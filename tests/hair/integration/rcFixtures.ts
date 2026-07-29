import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import { eq } from 'drizzle-orm';
import { ensureRcCutConsumableKit } from '@/src/hair/db/rcConsumableKit';
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

  await ensureRcCutConsumableKit(hairDb, cut.id, product.id, 10);

  if (Number(product.stockQty) < 50) {
    await hairDb
      .update(fyhProducts)
      .set({ stockQty: 100, updatedAt: new Date() })
      .where(eq(fyhProducts.id, product.id));
    product.stockQty = 100;
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
/** Per-process offset so back-to-back test runs do not reuse the same 2099 calendar days. */
const RUN_DAY_OFFSET = 1 + ((process.pid * 997 + Date.now()) % 8000);

/**
 * Monotonic appointment start: one slot per calendar day at 11:00 **local** time,
 * anchored in 2099 so rows never collide with real/dev DB appointments.
 */
export function nextSlot(_hoursFromNow = 2) {
  slotSeq += 1;
  const start = new Date(2099, 5, 1, 11, 0, 0, 0);
  start.setDate(RUN_DAY_OFFSET + slotSeq);
  if (start.getDay() === 0) start.setDate(start.getDate() + 1);
  return start;
}
