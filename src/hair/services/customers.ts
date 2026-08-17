import { and, asc, count, desc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhCustomerNotes,
  fyhCustomers,
  fyhCustomerTimeline,
  type FyhCustomerGender,
  type FyhCustomerSource,
  type FyhHairType,
  type FyhSkinType,
  type FyhTimelineEventType,
} from '@/src/hair/db/schema';

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '').trim();
}

/** Atomic salon customer code e.g. CL00000175 */
export async function nextCustomerCode(tx: typeof hairDb = hairDb): Promise<string> {
  const rows = await tx.execute<{ customer_code_next_seq: number }>(sql`
    UPDATE fyh_settings
    SET customer_code_next_seq = customer_code_next_seq + 1, updated_at = now()
    WHERE id = (SELECT id FROM fyh_settings LIMIT 1)
    RETURNING customer_code_next_seq
  `);
  const row = Array.isArray(rows)
    ? rows[0]
    : (rows as { rows?: Array<{ customer_code_next_seq: number }> }).rows?.[0];
  if (!row) throw new Error('Salon settings missing');
  const seq = Number(row.customer_code_next_seq) - 1;
  return `CL${String(seq).padStart(8, '0')}`;
}

export type QuickCustomerInput = {
  fullName: string;
  phone: string;
  gender?: FyhCustomerGender | null;
  /** Timeline label e.g. Quick Sale, Appointment booking */
  createdVia?: string;
};

export async function createCustomerQuick(input: QuickCustomerInput) {
  const fullName = input.fullName.trim();
  const phone = normalizePhone(input.phone);
  if (!fullName) throw new Error('Customer name is required');
  if (!phone) throw new Error('Phone number is required');

  return hairDb.transaction(async (tx) => {
    await assertPhoneUnique(phone, undefined, tx);
    const customerCode = await nextCustomerCode(tx as unknown as typeof hairDb);
    const [row] = await tx
      .insert(fyhCustomers)
      .values({
        fullName,
        phone,
        gender: input.gender ?? 'female',
        source: 'walk_in',
        customerCode,
      })
      .returning();
    if (!row) throw new Error('Failed to create customer');
    await tx.insert(fyhCustomerTimeline).values({
      customerId: row.id,
      eventType: 'customer_created',
      title: 'Customer created',
      body: `${row.fullName} · ${input.createdVia ?? 'Quick Sale'}`,
    });
    return row;
  });
}

function parseTags(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(',');
  return [
    ...new Set(
      parts
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 20),
    ),
  ];
}

export type CustomerInput = {
  fullName: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  gender?: FyhCustomerGender | null;
  dateOfBirth?: string | null;
  anniversary?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  occupation?: string | null;
  hairType?: FyhHairType | null;
  skinType?: FyhSkinType | null;
  allergies?: string | null;
  preferredStylist?: string | null;
  referredBy?: string | null;
  tags?: string | string[] | null;
  notes?: string | null;
  importantAlerts?: string | null;
  source?: FyhCustomerSource | null;
  membership?: string | null;
  favouriteService?: string | null;
  favouriteStylist?: string | null;
  /** When true, create even if similar phone/email matches exist (exact phone still blocked). */
  forceCreate?: boolean;
};

export type SimilarCustomer = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  matchReason: string;
};

async function assertPhoneUnique(
  phone: string,
  excludeId?: string,
  db: Pick<typeof hairDb, 'select'> = hairDb,
) {
  const conditions = [eq(fyhCustomers.phone, phone), eq(fyhCustomers.isActive, true)];
  if (excludeId) conditions.push(ne(fyhCustomers.id, excludeId));
  const [existing] = await db
    .select({ id: fyhCustomers.id, fullName: fyhCustomers.fullName })
    .from(fyhCustomers)
    .where(and(...conditions))
    .limit(1);
  if (existing) {
    throw new Error(`Phone already used by ${existing.fullName}`);
  }
}

export async function findSimilarCustomers(input: {
  phone: string;
  email?: string | null;
  whatsapp?: string | null;
  excludeId?: string;
}): Promise<SimilarCustomer[]> {
  const phone = normalizePhone(input.phone);
  const email = input.email?.trim().toLowerCase() || null;
  const whatsapp = input.whatsapp ? normalizePhone(input.whatsapp) : null;
  if (!phone && !email && !whatsapp) return [];

  const orParts = [];
  if (phone) {
    orParts.push(eq(fyhCustomers.phone, phone));
    orParts.push(eq(fyhCustomers.whatsapp, phone));
    if (phone.length >= 8) {
      orParts.push(ilike(fyhCustomers.phone, `%${phone.slice(-10)}%`));
    }
  }
  if (whatsapp) {
    orParts.push(eq(fyhCustomers.whatsapp, whatsapp));
    orParts.push(eq(fyhCustomers.phone, whatsapp));
  }
  if (email) orParts.push(sql`lower(${fyhCustomers.email}) = ${email}`);

  const rows = await hairDb
    .select({
      id: fyhCustomers.id,
      fullName: fyhCustomers.fullName,
      phone: fyhCustomers.phone,
      email: fyhCustomers.email,
      whatsapp: fyhCustomers.whatsapp,
    })
    .from(fyhCustomers)
    .where(
      and(
        eq(fyhCustomers.isActive, true),
        or(...orParts),
        input.excludeId ? ne(fyhCustomers.id, input.excludeId) : undefined,
      ),
    )
    .limit(10);

  return rows.map((r) => {
    const reasons: string[] = [];
    if (phone && (r.phone === phone || r.whatsapp === phone)) reasons.push('phone');
    if (whatsapp && (r.whatsapp === whatsapp || r.phone === whatsapp)) reasons.push('whatsapp');
    if (email && r.email?.toLowerCase() === email) reasons.push('email');
    if (!reasons.length && phone && r.phone.includes(phone.slice(-10))) reasons.push('similar phone');
    return { ...r, matchReason: reasons.join(', ') || 'similar' };
  });
}

export async function listCustomers(opts?: { q?: string; includeInactive?: boolean }) {
  const q = opts?.q?.trim();
  const conditions = [];
  if (!opts?.includeInactive) conditions.push(eq(fyhCustomers.isActive, true));
  if (q) {
    const pattern = `%${q}%`;
    const digits = normalizePhone(q);
    conditions.push(
      or(
        ilike(fyhCustomers.fullName, pattern),
        ilike(fyhCustomers.phone, pattern),
        ilike(fyhCustomers.whatsapp, pattern),
        ilike(fyhCustomers.email, pattern),
        digits.length >= 4 ? ilike(fyhCustomers.phone, `%${digits}%`) : undefined,
        digits.length >= 4 ? ilike(fyhCustomers.whatsapp, `%${digits}%`) : undefined,
      )!,
    );
  }
  return hairDb
    .select()
    .from(fyhCustomers)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(fyhCustomers.updatedAt))
    .limit(200);
}

export async function getCustomer(id: string) {
  const [row] = await hairDb.select().from(fyhCustomers).where(eq(fyhCustomers.id, id)).limit(1);
  return row ?? null;
}

export async function countActiveCustomers(): Promise<number> {
  const [row] = await hairDb
    .select({ total: count() })
    .from(fyhCustomers)
    .where(eq(fyhCustomers.isActive, true));
  return Number(row?.total ?? 0);
}

async function appendTimeline(input: {
  customerId: string;
  eventType: FyhTimelineEventType;
  title: string;
  body?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}) {
  await hairDb.insert(fyhCustomerTimeline).values({
    customerId: input.customerId,
    eventType: input.eventType,
    title: input.title,
    body: input.body ?? null,
    occurredAt: input.occurredAt ?? new Date(),
    metadata: input.metadata ?? null,
  });
}

function customerValues(input: CustomerInput) {
  const fullName = input.fullName.trim();
  const phone = normalizePhone(input.phone);
  if (!fullName) throw new Error('Name is required');
  if (!phone || phone.length < 8) throw new Error('Valid phone number is required');
  return {
    fullName,
    phone,
    whatsapp: input.whatsapp ? normalizePhone(input.whatsapp) : null,
    email: input.email?.trim().toLowerCase() || null,
    gender: input.gender ?? null,
    dateOfBirth: input.dateOfBirth || null,
    anniversary: input.anniversary || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    pincode: input.pincode?.trim() || null,
    occupation: input.occupation?.trim() || null,
    hairType: input.hairType ?? null,
    skinType: input.skinType ?? null,
    allergies: input.allergies?.trim() || null,
    preferredStylist: input.preferredStylist?.trim() || null,
    referredBy: input.referredBy?.trim() || null,
    tags: parseTags(input.tags),
    notes: input.notes?.trim() || null,
    importantAlerts: input.importantAlerts?.trim() || null,
    source: input.source ?? null,
    membership: input.membership?.trim() || null,
    favouriteService: input.favouriteService?.trim() || null,
    favouriteStylist: input.favouriteStylist?.trim() || null,
  };
}

export async function createCustomer(input: CustomerInput) {
  const values = customerValues(input);
  await assertPhoneUnique(values.phone);

  if (!input.forceCreate) {
    const similar = await findSimilarCustomers({
      phone: values.phone,
      email: values.email,
      whatsapp: values.whatsapp,
    });
    if (similar.length) {
      const err = new Error('SIMILAR_CUSTOMER') as Error & { similar: SimilarCustomer[] };
      err.similar = similar;
      throw err;
    }
  }

  const [row] = await hairDb.insert(fyhCustomers).values(values).returning();
  await appendTimeline({
    customerId: row.id,
    eventType: 'customer_created',
    title: 'Customer created',
    body: `${row.fullName} added to salon CRM`,
  });
  return row;
}

export async function updateCustomer(id: string, input: CustomerInput) {
  const values = customerValues(input);
  await assertPhoneUnique(values.phone, id);

  const [row] = await hairDb
    .update(fyhCustomers)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(fyhCustomers.id, id))
    .returning();
  if (!row) throw new Error('Customer not found');

  await appendTimeline({
    customerId: id,
    eventType: 'profile_updated',
    title: 'Profile updated',
    body: 'Customer details saved',
  });
  return row;
}

export async function updateCustomerPhoto(id: string, photoUrl: string | null) {
  const [row] = await hairDb
    .update(fyhCustomers)
    .set({ photoUrl, updatedAt: new Date() })
    .where(eq(fyhCustomers.id, id))
    .returning();
  if (!row) throw new Error('Customer not found');
  await appendTimeline({
    customerId: id,
    eventType: 'profile_updated',
    title: photoUrl ? 'Profile photo updated' : 'Profile photo removed',
  });
  return row;
}

export async function archiveCustomer(id: string) {
  const [row] = await hairDb
    .update(fyhCustomers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(fyhCustomers.id, id))
    .returning();
  if (!row) throw new Error('Customer not found');
  return row;
}

export async function listCustomerNotes(customerId: string) {
  return hairDb
    .select()
    .from(fyhCustomerNotes)
    .where(eq(fyhCustomerNotes.customerId, customerId))
    .orderBy(desc(fyhCustomerNotes.createdAt));
}

export async function addCustomerNote(input: {
  customerId: string;
  body: string;
  isAlert?: boolean;
  adminId?: string | null;
}) {
  const body = input.body.trim();
  if (!body) throw new Error('Note cannot be empty');
  const [note] = await hairDb
    .insert(fyhCustomerNotes)
    .values({
      customerId: input.customerId,
      body,
      isAlert: Boolean(input.isAlert),
      createdByAdminId: input.adminId ?? null,
    })
    .returning();
  await appendTimeline({
    customerId: input.customerId,
    eventType: 'note',
    title: input.isAlert ? 'Alert note added' : 'Note added',
    body: body.slice(0, 200),
  });
  if (input.isAlert) {
    await hairDb
      .update(fyhCustomers)
      .set({
        importantAlerts: body,
        updatedAt: new Date(),
      })
      .where(eq(fyhCustomers.id, input.customerId));
  }
  return note;
}

export async function listCustomerTimeline(customerId: string) {
  return hairDb
    .select()
    .from(fyhCustomerTimeline)
    .where(eq(fyhCustomerTimeline.customerId, customerId))
    .orderBy(asc(fyhCustomerTimeline.occurredAt), asc(fyhCustomerTimeline.createdAt));
}

export async function getCustomerProfile(id: string) {
  const customer = await getCustomer(id);
  if (!customer) return null;
  const [notes, timeline] = await Promise.all([
    listCustomerNotes(id),
    listCustomerTimeline(id),
  ]);
  return { customer, notes, timeline };
}
