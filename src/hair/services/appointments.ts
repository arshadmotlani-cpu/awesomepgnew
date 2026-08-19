import { and, asc, eq, gte, lt, notInArray } from 'drizzle-orm';
import { hairDb } from '@/src/hair/db/client';
import {
  fyhAdminUsers,
  fyhAppointmentServices,
  fyhAppointments,
  fyhCustomerTimeline,
  fyhCustomers,
  fyhResources,
  fyhServices,
  fyhSettings,
  fyhStaff,
  fyhStaffSchedules,
  type FyhAppointmentSource,
  type FyhAppointmentStatus,
} from '@/src/hair/db/schema';
import {
  findConflict,
  isWithinWorkingWindow,
} from '@/src/hair/lib/appointmentEngine';
import {
  canTransitionAppointmentStatus,
  isActiveCalendarStatus,
} from '@/src/hair/lib/appointmentStatus';
import { shouldHideServiceFromBillable } from '@/src/hair/lib/serviceCatalogHygiene';
import type { TenantContext } from '@/src/hair/lib/tenant/types';
import { orgFilter, locationFilter, tenantWriteDefaults, tenantOrgDefaults } from '@/src/hair/lib/tenant/filters';
import { resolveTenantContextForService } from '@/src/hair/lib/tenant/serviceContext';

/** Statuses that do not occupy a bookable slot (excluded from conflict checks). */
const NON_OCCUPYING = ['cancelled', 'no_show', 'completed', 'paid'] as const;

export type AppointmentServiceInput = { serviceId: string };

export type CreateAppointmentInput = {
  customerId: string;
  staffId: string;
  resourceId?: string | null;
  startAt: Date;
  serviceIds: string[];
  notes?: string | null;
  source?: FyhAppointmentSource;
  status?: FyhAppointmentStatus;
  bufferMinutes?: number;
  recurrenceWeeks?: number;
  createdByAdminId?: string | null;
};

export type AppointmentCalendarRow = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  staffId: string;
  staffName: string;
  resourceId: string | null;
  resourceName: string | null;
  startAt: Date;
  endAt: Date;
  status: FyhAppointmentStatus;
  notes: string | null;
  source: FyhAppointmentSource;
  bufferMinutes: number;
  invoiceId: string | null;
  createdByAdminId: string | null;
  createdByName: string | null;
  services: Array<{
    id: string;
    serviceId: string;
    name: string;
    durationMinutes: number;
    pricePaise: number;
  }>;
  durationMinutes: number;
};

async function getSalonSettings(ctx?: TenantContext | null) {
  const [row] = await hairDb
    .select()
    .from(fyhSettings)
    .where(orgFilter(fyhSettings.organizationId, ctx))
    .limit(1);
  return row;
}

async function loadServiceSnapshots(serviceIds: string[], ctx?: TenantContext | null) {
  if (serviceIds.length === 0) throw new Error('Select at least one service');
  const { inArray } = await import('drizzle-orm');
  const services = await hairDb
    .select()
    .from(fyhServices)
    .where(and(orgFilter(fyhServices.organizationId, ctx), eq(fyhServices.isActive, true), inArray(fyhServices.id, serviceIds)));
  const bookable = services.filter((s) => !shouldHideServiceFromBillable(s.name, s.code));
  if (bookable.length !== serviceIds.length) {
    const found = new Set(bookable.map((s) => s.id));
    const missing = serviceIds.filter((id) => !found.has(id));
    throw new Error(
      `One or more services are unavailable${missing.length ? ` (${missing.join(', ')})` : ''}`,
    );
  }
  const map = new Map(bookable.map((s) => [s.id, s]));
  return serviceIds.map((id) => {
    const s = map.get(id)!;
    return {
      serviceId: s.id,
      nameSnapshot: s.name,
      durationMinutes: s.durationMinutes,
      pricePaise: s.pricePaise,
      gstBps: s.gstBps,
    };
  });
}

async function assertStaffCanPerform(_staffId: string, _serviceIds: string[]) {
  // Stylists are chosen at appointment / checkout; service-staff links are legacy seed data only.
}

async function assertNoConflicts(input: {
  staffId: string;
  resourceId?: string | null;
  startAt: Date;
  endAt: Date;
  bufferMinutes: number;
  excludeId?: string;
  ctx?: TenantContext | null;
}) {
  const staffRows = await hairDb
    .select({
      id: fyhAppointments.id,
      startAt: fyhAppointments.startAt,
      endAt: fyhAppointments.endAt,
      bufferMinutes: fyhAppointments.bufferMinutes,
    })
    .from(fyhAppointments)
    .where(
      and(
        ...(input.ctx
          ? [orgFilter(fyhAppointments.organizationId, input.ctx), locationFilter(fyhAppointments.locationId, input.ctx)]
          : []),
        eq(fyhAppointments.staffId, input.staffId),
        notInArray(fyhAppointments.status, [...NON_OCCUPYING]),
      ),
    );

  const staffConflict = findConflict(
    { startMs: input.startAt.getTime(), endMs: input.endAt.getTime() },
    staffRows.map((r) => ({
      id: r.id,
      startMs: r.startAt.getTime(),
      endMs: r.endAt.getTime(),
    })),
    Math.max(input.bufferMinutes, ...staffRows.map((r) => r.bufferMinutes), 0),
    input.excludeId,
  );
  if (staffConflict) throw new Error('Stylist is already booked for this time');

  if (input.resourceId) {
    const resourceRows = await hairDb
      .select({
        id: fyhAppointments.id,
        startAt: fyhAppointments.startAt,
        endAt: fyhAppointments.endAt,
        bufferMinutes: fyhAppointments.bufferMinutes,
      })
      .from(fyhAppointments)
      .where(
        and(
          ...(input.ctx
            ? [orgFilter(fyhAppointments.organizationId, input.ctx), locationFilter(fyhAppointments.locationId, input.ctx)]
            : []),
          eq(fyhAppointments.resourceId, input.resourceId),
          notInArray(fyhAppointments.status, [...NON_OCCUPYING]),
        ),
      );
    const resourceConflict = findConflict(
      { startMs: input.startAt.getTime(), endMs: input.endAt.getTime() },
      resourceRows.map((r) => ({
        id: r.id,
        startMs: r.startAt.getTime(),
        endMs: r.endAt.getTime(),
      })),
      Math.max(input.bufferMinutes, ...resourceRows.map((r) => r.bufferMinutes)),
      input.excludeId,
    );
    if (resourceConflict) throw new Error('Chair / resource is already booked for this time');
  }
}

async function assertWorkingHours(
  staffId: string,
  startAt: Date,
  endAt: Date,
  ctx?: TenantContext | null,
) {
  const settings = await getSalonSettings(ctx);
  const day = startAt.getDay();
  const hours = settings?.businessHours?.find((d) => d.dayOfWeek === day);
  const openHm = hours?.open ?? '10:00';
  const closeHm = hours?.close ?? '20:00';
  const salonCheck = isWithinWorkingWindow({
    startAt,
    endAt,
    openHm,
    closeHm,
    closed: hours?.closed,
  });
  if (!salonCheck.ok) throw new Error(salonCheck.reason);

  const [sched] = await hairDb
    .select()
    .from(fyhStaffSchedules)
    .where(
      and(
        orgFilter(fyhStaffSchedules.organizationId, ctx),
        locationFilter(fyhStaffSchedules.locationId, ctx),
        eq(fyhStaffSchedules.staffId, staffId),
        eq(fyhStaffSchedules.dayOfWeek, day),
      ),
    )
    .limit(1);
  if (sched) {
    const staffCheck = isWithinWorkingWindow({
      startAt,
      endAt,
      openHm: sched.startTime,
      closeHm: sched.endTime,
      lunchStartHm: sched.lunchStart,
      lunchEndHm: sched.lunchEnd,
      closed: sched.isOff,
    });
    if (!staffCheck.ok) throw new Error(staffCheck.reason);
  }
}

async function appendTimeline(
  customerId: string,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  ctx?: TenantContext | null,
) {
  await hairDb.insert(fyhCustomerTimeline).values({
    ...tenantOrgDefaults(ctx),
    customerId,
    eventType: 'appointment',
    title,
    body,
    metadata: metadata ?? null,
  });
}

export async function listResources(ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  return hairDb
    .select()
    .from(fyhResources)
    .where(and(orgFilter(fyhResources.organizationId, ctx), locationFilter(fyhResources.locationId, ctx), eq(fyhResources.isActive, true)))
    .orderBy(asc(fyhResources.sortOrder), asc(fyhResources.name));
}

export async function listAppointmentsInRange(
  from: Date,
  to: Date,
  opts?: { staffId?: string | null },
  ctx?: TenantContext | null,
): Promise<AppointmentCalendarRow[]> {
  ctx = await resolveTenantContextForService(ctx);
  const conditions = [
    orgFilter(fyhAppointments.organizationId, ctx),
    locationFilter(fyhAppointments.locationId, ctx),
    gte(fyhAppointments.startAt, from),
    lt(fyhAppointments.startAt, to),
  ];
  if (opts?.staffId) {
    conditions.push(eq(fyhAppointments.staffId, opts.staffId));
  }

  const appts = await hairDb
    .select({
      id: fyhAppointments.id,
      customerId: fyhAppointments.customerId,
      customerName: fyhCustomers.fullName,
      customerPhone: fyhCustomers.phone,
      staffId: fyhAppointments.staffId,
      staffName: fyhStaff.fullName,
      resourceId: fyhAppointments.resourceId,
      resourceName: fyhResources.name,
      startAt: fyhAppointments.startAt,
      endAt: fyhAppointments.endAt,
      status: fyhAppointments.status,
      notes: fyhAppointments.notes,
      source: fyhAppointments.source,
      bufferMinutes: fyhAppointments.bufferMinutes,
      invoiceId: fyhAppointments.invoiceId,
      createdByAdminId: fyhAppointments.createdByAdminId,
      createdByName: fyhAdminUsers.displayName,
    })
    .from(fyhAppointments)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhAppointments.customerId))
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhAppointments.staffId))
    .leftJoin(fyhResources, eq(fyhResources.id, fyhAppointments.resourceId))
    .leftJoin(fyhAdminUsers, eq(fyhAdminUsers.id, fyhAppointments.createdByAdminId))
    .where(and(...conditions))
    .orderBy(asc(fyhAppointments.startAt));

  if (appts.length === 0) return [];

  const { inArray } = await import('drizzle-orm');
  const services = await hairDb
    .select()
    .from(fyhAppointmentServices)
    .where(
      and(
        orgFilter(fyhAppointmentServices.organizationId, ctx),
        locationFilter(fyhAppointmentServices.locationId, ctx),
        inArray(
          fyhAppointmentServices.appointmentId,
          appts.map((a) => a.id),
        ),
      ),
    )
    .orderBy(asc(fyhAppointmentServices.sortOrder));

  const byAppt = new Map<string, typeof services>();
  for (const s of services) {
    const list = byAppt.get(s.appointmentId) ?? [];
    list.push(s);
    byAppt.set(s.appointmentId, list);
  }

  return appts.map((a) => {
    const svc = byAppt.get(a.id) ?? [];
    const durationMinutes = Math.max(
      1,
      Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000),
    );
    return {
      ...a,
      resourceId: a.resourceId ?? null,
      resourceName: a.resourceName ?? null,
      services: svc.map((s) => ({
        id: s.id,
        serviceId: s.serviceId,
        name: s.nameSnapshot,
        durationMinutes: s.durationMinutes,
        pricePaise: s.pricePaise,
      })),
      durationMinutes,
    };
  });
}

export async function getAppointmentById(id: string, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const { inArray } = await import('drizzle-orm');
  const appts = await hairDb
    .select({
      id: fyhAppointments.id,
      customerId: fyhAppointments.customerId,
      customerName: fyhCustomers.fullName,
      customerPhone: fyhCustomers.phone,
      staffId: fyhAppointments.staffId,
      staffName: fyhStaff.fullName,
      resourceId: fyhAppointments.resourceId,
      resourceName: fyhResources.name,
      startAt: fyhAppointments.startAt,
      endAt: fyhAppointments.endAt,
      status: fyhAppointments.status,
      notes: fyhAppointments.notes,
      source: fyhAppointments.source,
      bufferMinutes: fyhAppointments.bufferMinutes,
      invoiceId: fyhAppointments.invoiceId,
      createdByAdminId: fyhAppointments.createdByAdminId,
      createdByName: fyhAdminUsers.displayName,
    })
    .from(fyhAppointments)
    .innerJoin(fyhCustomers, eq(fyhCustomers.id, fyhAppointments.customerId))
    .innerJoin(fyhStaff, eq(fyhStaff.id, fyhAppointments.staffId))
    .leftJoin(fyhResources, eq(fyhResources.id, fyhAppointments.resourceId))
    .leftJoin(fyhAdminUsers, eq(fyhAdminUsers.id, fyhAppointments.createdByAdminId))
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, id)))
    .limit(1);

  const a = appts[0];
  if (!a) return null;

  const services = await hairDb
    .select()
    .from(fyhAppointmentServices)
    .where(and(orgFilter(fyhAppointmentServices.organizationId, ctx), locationFilter(fyhAppointmentServices.locationId, ctx), eq(fyhAppointmentServices.appointmentId, id)))
    .orderBy(asc(fyhAppointmentServices.sortOrder));

  const durationMinutes = Math.max(
    1,
    Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60_000),
  );

  return {
    ...a,
    resourceId: a.resourceId ?? null,
    resourceName: a.resourceName ?? null,
    services: services.map((s) => ({
      id: s.id,
      serviceId: s.serviceId,
      name: s.nameSnapshot,
      durationMinutes: s.durationMinutes,
      pricePaise: s.pricePaise,
    })),
    durationMinutes,
  };
}

export async function createAppointment(input: CreateAppointmentInput, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const settings = await getSalonSettings(ctx);
  const buffer = input.bufferMinutes ?? settings?.defaultBufferMinutes ?? 0;
  const snapshots = await loadServiceSnapshots(input.serviceIds, ctx);
  await assertStaffCanPerform(input.staffId, input.serviceIds);

  const duration = snapshots.reduce((sum, s) => sum + s.durationMinutes, 0);
  const startAt = input.startAt;
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  const status: FyhAppointmentStatus =
    input.status ?? (input.source === 'walk_in' ? 'arrived' : 'booked');

  await assertWorkingHours(input.staffId, startAt, endAt, ctx);
  await assertNoConflicts({
    staffId: input.staffId,
    resourceId: input.resourceId,
    startAt,
    endAt,
    bufferMinutes: buffer,
    ctx,
  });

  const weeks = Math.max(1, Math.min(input.recurrenceWeeks ?? 1, 12));
  const createdIds: string[] = [];

  for (let w = 0; w < weeks; w++) {
    const s = new Date(startAt.getTime() + w * 7 * 24 * 60 * 60 * 1000);
    const e = new Date(endAt.getTime() + w * 7 * 24 * 60 * 60 * 1000);
    if (w > 0) {
      try {
        await assertWorkingHours(input.staffId, s, e, ctx);
        await assertNoConflicts({
          staffId: input.staffId,
          resourceId: input.resourceId,
          startAt: s,
          endAt: e,
          bufferMinutes: buffer,
          ctx,
        });
      } catch {
        continue; // skip conflicting recurrence occurrences
      }
    }

    const [row] = await hairDb
      .insert(fyhAppointments)
      .values({
        ...tenantWriteDefaults(ctx),
        customerId: input.customerId,
        staffId: input.staffId,
        resourceId: input.resourceId ?? null,
        startAt: s,
        endAt: e,
        status: w === 0 ? status : 'booked',
        notes: input.notes ?? null,
        source: input.source ?? 'booking',
        bufferMinutes: buffer,
        recurrenceParentId: createdIds[0] ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
      })
      .returning();

    if (!row) continue;
    createdIds.push(row.id);
    if (createdIds.length === 1) {
      // fix parent self-ref later if needed
    }
    await hairDb.insert(fyhAppointmentServices).values(
      snapshots.map((snap, idx) => ({
        ...tenantWriteDefaults(ctx),
        appointmentId: row.id,
        serviceId: snap.serviceId,
        nameSnapshot: snap.nameSnapshot,
        durationMinutes: snap.durationMinutes,
        pricePaise: snap.pricePaise,
        gstBps: snap.gstBps,
        sortOrder: idx,
      })),
    );
  }

  if (createdIds.length === 0) throw new Error('Could not create appointment');

  const [customer] = await hairDb
    .select({ fullName: fyhCustomers.fullName })
    .from(fyhCustomers)
    .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, input.customerId)))
    .limit(1);

  await appendTimeline(
    input.customerId,
    'Appointment booked',
    `${customer?.fullName ?? 'Customer'} · ${snapshots.map((s) => s.nameSnapshot).join(', ')}`,
    { appointmentId: createdIds[0], status },
    ctx,
  );

  try {
    const [cust] = await hairDb
      .select({
        phone: fyhCustomers.phone,
        whatsapp: fyhCustomers.whatsapp,
        fullName: fyhCustomers.fullName,
      })
      .from(fyhCustomers)
      .where(and(orgFilter(fyhCustomers.organizationId, ctx), eq(fyhCustomers.id, input.customerId)))
      .limit(1);
    const recipient = cust?.whatsapp?.trim() || cust?.phone?.trim();
    if (cust && recipient) {
      const { renderTemplate, formatSalonDateTime } = await import(
        '@/src/hair/services/notifications'
      );
      const { enqueueNotification } = await import('@/src/hair/services/loyaltyOps');
      const { getSalonSettings } = await import('@/src/hair/services/settings');
      const settings = await getSalonSettings(ctx);
      const time = formatSalonDateTime(startAt, settings.timezone || 'Asia/Kolkata');
      const body = await renderTemplate(
        'appointment_confirmation',
        { name: cust.fullName, time },
        settings.communicationSettings,
      );
      await enqueueNotification({
        kind: 'appointment_confirmation',
        recipient,
        subject: 'Appointment confirmation',
        body,
      });
    }
  } catch {
    // Outbox is best-effort; never fail booking on notification errors.
  }

  return createdIds[0]!;
}

export async function rescheduleAppointment(
  input: {
    id: string;
    startAt: Date;
    endAt?: Date;
    staffId?: string;
    resourceId?: string | null;
  },
  ctx?: TenantContext | null,
) {
  ctx = await resolveTenantContextForService(ctx);
  const [existing] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, input.id)))
    .limit(1);
  if (!existing) throw new Error('Appointment not found');
  if (!isActiveCalendarStatus(existing.status) && existing.status !== 'completed') {
    throw new Error('Cannot move a cancelled or paid appointment');
  }

  const staffId = input.staffId ?? existing.staffId;
  const resourceId = input.resourceId === undefined ? existing.resourceId : input.resourceId;
  const startAt = input.startAt;
  const endAt =
    input.endAt ??
    new Date(startAt.getTime() + (existing.endAt.getTime() - existing.startAt.getTime()));

  await assertWorkingHours(staffId, startAt, endAt, ctx);
  await assertNoConflicts({
    staffId,
    resourceId,
    startAt,
    endAt,
    bufferMinutes: existing.bufferMinutes,
    excludeId: existing.id,
    ctx,
  });

  await hairDb
    .update(fyhAppointments)
    .set({
      staffId,
      resourceId,
      startAt,
      endAt,
      updatedAt: new Date(),
    })
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, input.id)));

  return input.id;
}

export async function updateAppointmentStatus(id: string, status: FyhAppointmentStatus, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  if (status === 'paid') {
    throw new Error('Mark paid via invoice payment — not a manual status');
  }
  const [existing] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, id)))
    .limit(1);
  if (!existing) throw new Error('Appointment not found');
  if (!canTransitionAppointmentStatus(existing.status, status)) {
    throw new Error(`Cannot change status from ${existing.status} to ${status}`);
  }
  await hairDb
    .update(fyhAppointments)
    .set({ status, updatedAt: new Date() })
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, id)));

  await appendTimeline(existing.customerId, `Appointment ${status.replace(/_/g, ' ')}`, `Status → ${status}`, {
    appointmentId: id,
    status,
  }, ctx);

  return id;
}

export async function updateAppointmentNotes(id: string, notes: string | null, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  await hairDb
    .update(fyhAppointments)
    .set({ notes, updatedAt: new Date() })
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, id)));
}

export type UpdateAppointmentInput = {
  id: string;
  customerId?: string;
  staffId?: string;
  resourceId?: string | null;
  startAt?: Date;
  endAt?: Date;
  serviceIds?: string[];
  notes?: string | null;
  status?: FyhAppointmentStatus;
};

export async function updateAppointment(input: UpdateAppointmentInput, ctx?: TenantContext | null) {
  ctx = await resolveTenantContextForService(ctx);
  const [existing] = await hairDb
    .select()
    .from(fyhAppointments)
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, input.id)))
    .limit(1);
  if (!existing) throw new Error('Appointment not found');

  if (existing.invoiceId) {
    if (input.customerId && input.customerId !== existing.customerId) {
      throw new Error('Cannot change customer on an invoiced appointment');
    }
    if (input.serviceIds) {
      const currentIds = (
        await hairDb
          .select({ serviceId: fyhAppointmentServices.serviceId })
          .from(fyhAppointmentServices)
          .where(and(orgFilter(fyhAppointmentServices.organizationId, ctx), locationFilter(fyhAppointmentServices.locationId, ctx), eq(fyhAppointmentServices.appointmentId, input.id)))
          .orderBy(asc(fyhAppointmentServices.sortOrder))
      ).map((r) => r.serviceId);
      const same =
        currentIds.length === input.serviceIds.length &&
        currentIds.every((id, i) => id === input.serviceIds![i]);
      if (!same) {
        throw new Error('Cannot change services on an invoiced appointment');
      }
    }
  }

  const staffId = input.staffId ?? existing.staffId;
  const resourceId = input.resourceId === undefined ? existing.resourceId : input.resourceId;
  const startAt = input.startAt ?? existing.startAt;
  let endAt = input.endAt ?? existing.endAt;

  if (input.serviceIds && !existing.invoiceId) {
    const snapshots = await loadServiceSnapshots(input.serviceIds, ctx);
    await assertStaffCanPerform(staffId, input.serviceIds);

    const currentServices = await hairDb
      .select()
      .from(fyhAppointmentServices)
      .where(and(orgFilter(fyhAppointmentServices.organizationId, ctx), locationFilter(fyhAppointmentServices.locationId, ctx), eq(fyhAppointmentServices.appointmentId, input.id)));
    const snapshotDuration = snapshots.reduce((sum, s) => sum + s.durationMinutes, 0);
    const slotDuration = Math.round((existing.endAt.getTime() - existing.startAt.getTime()) / 60_000);
    const hadCustomDuration = slotDuration !== currentServices.reduce((sum, s) => sum + s.durationMinutes, 0);

    if (!hadCustomDuration) {
      endAt = new Date(startAt.getTime() + snapshotDuration * 60_000);
    }

    await hairDb.delete(fyhAppointmentServices).where(and(orgFilter(fyhAppointmentServices.organizationId, ctx), locationFilter(fyhAppointmentServices.locationId, ctx), eq(fyhAppointmentServices.appointmentId, input.id)));
    await hairDb.insert(fyhAppointmentServices).values(
      snapshots.map((snap, idx) => ({
        appointmentId: input.id,
        serviceId: snap.serviceId,
        nameSnapshot: snap.nameSnapshot,
        durationMinutes: snap.durationMinutes,
        pricePaise: snap.pricePaise,
        gstBps: snap.gstBps,
        sortOrder: idx,
      })),
    );
  }

  if (endAt.getTime() <= startAt.getTime()) {
    throw new Error('End time must be after start time');
  }

  if (!isActiveCalendarStatus(existing.status) && existing.status !== 'completed') {
    if (input.startAt || input.endAt || input.staffId || input.resourceId !== undefined) {
      throw new Error('Cannot reschedule a cancelled or paid appointment');
    }
  }

  await assertWorkingHours(staffId, startAt, endAt, ctx);
  await assertNoConflicts({
    staffId,
    resourceId,
    startAt,
    endAt,
    bufferMinutes: existing.bufferMinutes,
    excludeId: existing.id,
    ctx,
  });

  if (input.status && input.status !== existing.status) {
    if (input.status === 'paid') {
      throw new Error('Mark paid via invoice payment — not a manual status');
    }
    if (!canTransitionAppointmentStatus(existing.status, input.status)) {
      throw new Error(`Cannot change status from ${existing.status} to ${input.status}`);
    }
  }

  await hairDb
    .update(fyhAppointments)
    .set({
      customerId: input.customerId ?? existing.customerId,
      staffId,
      resourceId,
      startAt,
      endAt,
      notes: input.notes === undefined ? existing.notes : input.notes,
      status: input.status ?? existing.status,
      updatedAt: new Date(),
    })
    .where(and(orgFilter(fyhAppointments.organizationId, ctx), locationFilter(fyhAppointments.locationId, ctx), eq(fyhAppointments.id, input.id)));

  if (input.status && input.status !== existing.status) {
    await appendTimeline(existing.customerId, `Appointment ${input.status.replace(/_/g, ' ')}`, `Status → ${input.status}`, {
      appointmentId: input.id,
      status: input.status,
    }, ctx);
  }

  return input.id;
}
