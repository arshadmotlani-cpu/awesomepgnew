'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import {
  AlertTriangle,
  CalendarPlus,
  CreditCard,
  Gift,
  NotebookPen,
  Receipt,
  UserRound,
} from 'lucide-react';
import {
  addCustomerNoteAction,
  archiveCustomerAction,
  updateCustomerAction,
  uploadCustomerPhotoAction,
  type CustomerActionState,
} from '@/src/hair/actions/customers';
import { topUpWalletAction } from '@/src/hair/actions/loyalty';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { ImageFileInputInline } from '@/src/components/shared/ImageFileInput';
import {
  FYH_CUSTOMER_GENDERS,
  FYH_CUSTOMER_SOURCES,
  FYH_HAIR_TYPES,
  FYH_SKIN_TYPES,
  type FyhCustomer,
  type FyhCustomerNote,
} from '@/src/hair/db/schema';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import { cn } from '@/src/hair/lib/utils';
import type {
  CustomerFinancialSummary,
  UnifiedTimelineEvent,
  UnifiedTimelineFilter,
} from '@/src/hair/domain/customerTimeline/types';
import {
  DEFAULT_TIMELINE_PAGE_SIZE,
  filterUnifiedTimeline,
  paginateUnifiedTimeline,
} from '@/src/hair/domain/customerTimeline/types';

const initialState: CustomerActionState = {};

const fieldClass =
  'flex h-11 w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 text-sm text-fyh-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fyh-accent/40 fyh-theme-light:bg-white/70';

const TIMELINE_FILTERS: { id: UnifiedTimelineFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'visits', label: 'Visits' },
  { id: 'bills', label: 'Bills' },
  { id: 'payments', label: 'Payments' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'loyalty', label: 'Loyalty' },
];

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
  { id: 'salon', label: 'Salon' },
  { id: 'loyalty', label: 'Loyalty' },
  { id: 'notes', label: 'Notes' },
  { id: 'timeline', label: 'Timeline' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="fyh-glass p-3">
      <p className="fyh-kpi-label">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-fyh-text">{value}</p>
    </div>
  );
}

export function CustomerProfile({
  customer,
  notes,
  unifiedTimeline,
  financialSummary,
  timelineLoading = false,
}: {
  customer: FyhCustomer;
  notes: FyhCustomerNote[];
  unifiedTimeline: UnifiedTimelineEvent[];
  financialSummary: CustomerFinancialSummary;
  timelineLoading?: boolean;
}) {
  const [tab, setTab] = useState<TabId>('overview');
  const [timelineFilter, setTimelineFilter] = useState<UnifiedTimelineFilter>('all');
  const [timelineVisibleCount, setTimelineVisibleCount] = useState(DEFAULT_TIMELINE_PAGE_SIZE);
  const [updateState, updateAction, updatePending] = useActionState(
    updateCustomerAction,
    initialState,
  );
  const [noteState, noteAction, notePending] = useActionState(addCustomerNoteAction, initialState);
  const [photoState, photoAction, photoPending] = useActionState(
    uploadCustomerPhotoAction,
    initialState,
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveCustomerAction,
    initialState,
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const alertNotes = useMemo(() => notes.filter((n) => n.isAlert), [notes]);
  const filteredTimeline = useMemo(
    () => filterUnifiedTimeline(unifiedTimeline, timelineFilter),
    [unifiedTimeline, timelineFilter],
  );
  const visibleTimeline = useMemo(
    () => paginateUnifiedTimeline(filteredTimeline, { limit: timelineVisibleCount }),
    [filteredTimeline, timelineVisibleCount],
  );
  const hasMoreTimeline = visibleTimeline.length < filteredTimeline.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="fyh-glass flex flex-wrap items-start gap-5 p-5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-fyh-accent/30 bg-fyh-forest/20">
          {customer.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={customer.photoUrl}
              alt={customer.fullName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-fyh-accent">
              <UserRound className="h-10 w-10" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="fyh-section-eyebrow">Customer profile</p>
              <h1 className="fyh-display mt-1 font-semibold tracking-tight">
                {customer.fullName}
              </h1>
              <p className="mt-1 text-sm text-fyh-text-secondary">
                {customer.phone}
                {customer.whatsapp ? ` · WA ${customer.whatsapp}` : ''}
                {customer.email ? ` · ${customer.email}` : ''}
                {!customer.isActive ? ' · Archived' : ''}
              </p>
              {customer.tags?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customer.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-fyh-accent/25 bg-fyh-forest/15 px-2 py-0.5 text-xs text-fyh-accent"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <Link href="/customers">
              <Button type="button" variant="ghost" size="sm">
                Back to list
              </Button>
            </Link>
          </div>

          <form
            action={(fd: FormData) => {
              if (photoFile) fd.set('photo', photoFile);
              photoAction(fd);
            }}
            className="mt-3 flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="customerId" value={customer.id} />
            <ImageFileInputInline
              name="photo"
              accept="image/*"
              className="max-w-xs"
              onFileSelected={(f) => setPhotoFile(f ?? null)}
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={photoPending || !photoFile}
            >
              {photoPending ? 'Uploading…' : 'Update photo'}
            </Button>
            {photoState.error ? (
              <span className="text-sm text-fyh-danger">{photoState.error}</span>
            ) : null}
            {photoState.success ? (
              <span className="text-sm text-fyh-success">{photoState.success}</span>
            ) : null}
          </form>
        </div>
      </div>

      {customer.importantAlerts || alertNotes.length > 0 ? (
        <div className="flex gap-3 rounded-2xl border border-fyh-danger/30 bg-fyh-danger/10 px-4 py-3 text-sm text-fyh-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-fyh-danger" />
          <div>
            <p className="font-medium text-fyh-danger">Billing alert</p>
            <p className="mt-0.5 text-fyh-text-secondary">
              {customer.importantAlerts || alertNotes[0]?.body}
            </p>
          </div>
        </div>
      ) : null}

      {/* Account summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Due" value={formatInrFromPaise(financialSummary.duePaise)} />
        <Stat label="Advance" value={formatInrFromPaise(financialSummary.advancePaise)} />
        <Stat label="Wallet" value={formatInrFromPaise(financialSummary.walletPaise)} />
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Stat label="Visits" value={String(customer.totalVisits ?? 0)} />
        <Stat label="Lifetime spend" value={formatInrFromPaise(customer.lifetimeSpendPaise ?? 0)} />
        <Stat label="Avg bill" value={formatInrFromPaise(customer.averageBillPaise ?? 0)} />
        <Stat label="Points" value={String(customer.rewardPoints ?? 0)} />
        <Stat label="Packages" value={String(customer.packagesPurchased ?? 0)} />
        <Stat
          label="Membership"
          value={(financialSummary.activeMembership?.planName ?? customer.membership) || 'None'}
        />
        {financialSummary.activePackage ? (
          <Stat
            label="Active package"
            value={`${financialSummary.activePackage.planName} (${financialSummary.activePackage.remainingSessions} left)`}
          />
        ) : null}
      </div>

      {/* Quick actions */}
      <div className="fyh-glass flex flex-wrap gap-2 p-3">
        <Link href={`/appointments?customerId=${customer.id}`}>
          <Button type="button" size="sm" variant="secondary">
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
            New Appointment
          </Button>
        </Link>
        <Link href="/billing">
          <Button type="button" size="sm" variant="secondary">
            <Receipt className="mr-1.5 h-3.5 w-3.5" />
            Billing
          </Button>
        </Link>
        <Link href="/loyalty">
          <Button type="button" size="sm" variant="secondary">
            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
            Memberships
          </Button>
        </Link>
        <Link href="/loyalty">
          <Button type="button" size="sm" variant="secondary">
            <Gift className="mr-1.5 h-3.5 w-3.5" />
            Packages
          </Button>
        </Link>
        <Button type="button" size="sm" variant="secondary" onClick={() => setTab('notes')}>
          <NotebookPen className="mr-1.5 h-3.5 w-3.5" />
          Add Note
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[color:var(--fyh-border)] pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded-xl px-3 py-2 text-sm transition',
              tab === t.id
                ? 'bg-fyh-forest/25 text-fyh-accent'
                : 'text-fyh-text-secondary hover:bg-white/5 hover:text-fyh-text',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="fyh-glass space-y-3 p-4 text-sm">
            <h2 className="fyh-display text-lg font-semibold">Basics</h2>
            <Row label="Gender" value={customer.gender?.replace(/_/g, ' ') || '—'} />
            <Row label="DOB" value={customer.dateOfBirth || '—'} />
            <Row label="Anniversary" value={customer.anniversary || '—'} />
            <Row label="Occupation" value={customer.occupation || '—'} />
            <Row label="Source" value={customer.source?.replace(/_/g, ' ') || '—'} />
            <Row label="Referred by" value={customer.referredBy || '—'} />
            <Row
              label="Address"
              value={
                [customer.address, customer.city, customer.state, customer.pincode]
                  .filter(Boolean)
                  .join(', ') || '—'
              }
            />
          </section>
          <section className="fyh-glass space-y-3 p-4 text-sm">
            <h2 className="fyh-display text-lg font-semibold">Salon snapshot</h2>
            <Row label="First visit" value={customer.firstVisitAt || '—'} />
            <Row label="Last visit" value={customer.lastVisitAt || '—'} />
            <Row label="Last service" value={customer.lastService || '—'} />
            <Row label="Favourite service" value={customer.favouriteService || '—'} />
            <Row label="Favourite stylist" value={customer.favouriteStylist || '—'} />
            <Row label="Preferred stylist" value={customer.preferredStylist || '—'} />
            <Row label="Hair type" value={customer.hairType || '—'} />
            <Row label="Skin type" value={customer.skinType || '—'} />
            <Row label="Allergies" value={customer.allergies || '—'} />
          </section>
        </div>
      ) : null}

      {tab === 'details' || tab === 'salon' || tab === 'loyalty' ? (
        <form action={updateAction} className="fyh-glass space-y-5 p-5">
          <input type="hidden" name="id" value={customer.id} />
          {tab === 'details' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name *" name="fullName" defaultValue={customer.fullName} required />
              <Field label="Phone *" name="phone" defaultValue={customer.phone} required />
              <Field label="WhatsApp" name="whatsapp" defaultValue={customer.whatsapp ?? ''} />
              <Field label="Email" name="email" type="email" defaultValue={customer.email ?? ''} />
              <Select
                label="Gender"
                name="gender"
                defaultValue={customer.gender ?? ''}
                options={FYH_CUSTOMER_GENDERS.map((g) => ({
                  value: g,
                  label: g.replace(/_/g, ' '),
                }))}
              />
              <Field
                label="Date of birth"
                name="dateOfBirth"
                type="date"
                defaultValue={customer.dateOfBirth ?? ''}
              />
              <Field
                label="Anniversary"
                name="anniversary"
                type="date"
                defaultValue={customer.anniversary ?? ''}
              />
              <Field label="Occupation" name="occupation" defaultValue={customer.occupation ?? ''} />
              <Field
                label="Address"
                name="address"
                defaultValue={customer.address ?? ''}
                className="sm:col-span-2"
              />
              <Field label="City" name="city" defaultValue={customer.city ?? ''} />
              <Field label="State" name="state" defaultValue={customer.state ?? ''} />
              <Field label="Pincode" name="pincode" defaultValue={customer.pincode ?? ''} />
              <Select
                label="Source"
                name="source"
                defaultValue={customer.source ?? ''}
                options={FYH_CUSTOMER_SOURCES.map((s) => ({
                  value: s,
                  label: s.replace(/_/g, ' '),
                }))}
              />
              <Field label="Referred by" name="referredBy" defaultValue={customer.referredBy ?? ''} />
              <Field
                label="Tags (comma-separated)"
                name="tags"
                defaultValue={(customer.tags ?? []).join(', ')}
                className="sm:col-span-2"
              />
              <TextArea
                label="Internal notes"
                name="notes"
                defaultValue={customer.notes ?? ''}
                className="sm:col-span-2"
              />
              <TextArea
                label="Important alerts (shown at billing)"
                name="importantAlerts"
                defaultValue={customer.importantAlerts ?? ''}
                className="sm:col-span-2"
              />
              {/* preserve salon/loyalty fields when saving from details tab */}
              <HiddenDefaults customer={customer} includeSalon includeLoyalty />
            </div>
          ) : null}

          {tab === 'salon' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Hair type"
                name="hairType"
                defaultValue={customer.hairType ?? ''}
                options={FYH_HAIR_TYPES.map((v) => ({ value: v, label: v }))}
              />
              <Select
                label="Skin type"
                name="skinType"
                defaultValue={customer.skinType ?? ''}
                options={FYH_SKIN_TYPES.map((v) => ({ value: v, label: v }))}
              />
              <TextArea
                label="Allergies"
                name="allergies"
                defaultValue={customer.allergies ?? ''}
                className="sm:col-span-2"
              />
              <Field
                label="Preferred stylist"
                name="preferredStylist"
                defaultValue={customer.preferredStylist ?? ''}
              />
              <Field
                label="Favourite stylist"
                name="favouriteStylist"
                defaultValue={customer.favouriteStylist ?? ''}
              />
              <Field
                label="Favourite service"
                name="favouriteService"
                defaultValue={customer.favouriteService ?? ''}
              />
              <Field label="Last service" name="lastService" defaultValue={customer.lastService ?? ''} />
              <HiddenDefaults customer={customer} includeBasics includeLoyalty />
            </div>
          ) : null}

          {tab === 'loyalty' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Membership" name="membership" defaultValue={customer.membership ?? ''} />
              <p className="sm:col-span-2 text-sm text-fyh-text-muted">
                Wallet balance {formatInrFromPaise(financialSummary.walletPaise)} · advance credited{' '}
                {formatInrFromPaise(financialSummary.advancePaise)} · packages{' '}
                {customer.packagesPurchased ?? 0}.
              </p>
              <WalletTopUp customerId={customer.id} />
              <HiddenDefaults customer={customer} includeBasics includeSalon />
            </div>
          ) : null}

          {updateState.error ? <p className="text-sm text-fyh-danger">{updateState.error}</p> : null}
          {updateState.success ? (
            <p className="text-sm text-fyh-success">{updateState.success}</p>
          ) : null}
          <Button type="submit" disabled={updatePending}>
            {updatePending ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      ) : null}

      {tab === 'notes' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form action={noteAction} className="fyh-glass space-y-3 p-4">
            <h2 className="fyh-display text-lg font-semibold">Add note</h2>
            <input type="hidden" name="customerId" value={customer.id} />
            <textarea
              name="body"
              required
              rows={4}
              placeholder="Internal note…"
              className="w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-fyh-text-secondary">
              <input type="checkbox" name="isAlert" className="accent-fyh-forest" />
              Mark as billing alert
            </label>
            {noteState.error ? <p className="text-sm text-fyh-danger">{noteState.error}</p> : null}
            {noteState.success ? (
              <p className="text-sm text-fyh-success">{noteState.success}</p>
            ) : null}
            <Button type="submit" disabled={notePending}>
              {notePending ? 'Saving…' : 'Add note'}
            </Button>
          </form>
          <div className="fyh-glass space-y-3 p-4">
            <h2 className="fyh-display text-lg font-semibold">Notes history</h2>
            {notes.length === 0 ? (
              <p className="text-sm text-fyh-text-muted">No notes yet.</p>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-[color:var(--fyh-border)] bg-black/10 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-fyh-text-muted">
                        {new Date(n.createdAt).toLocaleString('en-IN')}
                      </span>
                      {n.isAlert ? (
                        <span className="text-xs uppercase tracking-wide text-fyh-danger">
                          Alert
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-fyh-text">{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'timeline' ? (
        <div className="fyh-glass p-4">
          <h2 className="fyh-display mb-4 text-lg font-semibold">Timeline</h2>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TIMELINE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setTimelineFilter(f.id);
                  setTimelineVisibleCount(DEFAULT_TIMELINE_PAGE_SIZE);
                }}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  timelineFilter === f.id
                    ? 'border-fyh-accent/40 bg-fyh-forest/25 text-fyh-accent'
                    : 'border-[color:var(--fyh-border)] text-fyh-text-secondary hover:text-fyh-text',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {timelineLoading ? (
            <div className="space-y-4 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse space-y-2 border-l border-fyh-accent/15 pl-6">
                  <div className="h-3 w-32 rounded bg-white/10" />
                  <div className="h-4 w-48 rounded bg-white/10" />
                </div>
              ))}
            </div>
          ) : filteredTimeline.length === 0 ? (
            <p className="text-sm text-fyh-text-muted">
              {unifiedTimeline.length === 0
                ? 'No activity yet — visits, bills, payments, and wallet events will appear here.'
                : `No ${TIMELINE_FILTERS.find((f) => f.id === timelineFilter)?.label.toLowerCase()} events yet.`}
            </p>
          ) : (
            <ol className="relative space-y-0 border-l border-fyh-accent/25 pl-6">
              {visibleTimeline.map((ev) => (
                <li key={ev.id} className="relative pb-6 last:pb-0">
                  <span className="absolute -left-[1.55rem] top-1 h-2.5 w-2.5 rounded-full bg-fyh-accent" />
                  <p className="text-xs text-fyh-text-muted">
                    {new Date(ev.occurredAt).toLocaleString('en-IN')} · {ev.category}
                  </p>
                  <p className="mt-0.5 font-medium text-fyh-text">{ev.title}</p>
                  {ev.body ? <p className="mt-1 text-sm text-fyh-text-secondary">{ev.body}</p> : null}
                  {ev.amountPaise != null && ev.amountPaise > 0 ? (
                    <p className="mt-1 text-xs font-medium text-fyh-accent">
                      {formatInrFromPaise(ev.amountPaise)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
          {hasMoreTimeline ? (
            <div className="mt-4 text-center">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setTimelineVisibleCount((n) => n + DEFAULT_TIMELINE_PAGE_SIZE)
                }
              >
                Load more ({filteredTimeline.length - visibleTimeline.length} remaining)
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {customer.isActive ? (
        <form action={archiveAction} className="fyh-glass space-y-2 p-4">
          <input type="hidden" name="id" value={customer.id} />
          <h3 className="font-medium">Archive customer</h3>
          <p className="text-sm text-fyh-text-muted">
            Hides from active search. Phone uniqueness is freed for a new profile.
          </p>
          {archiveState.error ? (
            <p className="text-sm text-fyh-danger">{archiveState.error}</p>
          ) : null}
          <Button type="submit" variant="secondary" disabled={archivePending}>
            {archivePending ? 'Archiving…' : 'Archive'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[color:var(--fyh-border)] py-2 capitalize last:border-0">
      <span className="text-fyh-text-muted">{label}</span>
      <span className="text-right text-fyh-text normal-case">{value}</span>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = 'text',
  required,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="fyh-label" htmlFor={name}>
        {label}
      </label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} />
    </div>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="fyh-label" htmlFor={name}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-[color:var(--fyh-border)] bg-black/20 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <label className="fyh-label" htmlFor={name}>
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue} className={fieldClass}>
        <option value="">Not specified</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Keep non-visible tab fields when saving a partial form. */
function WalletTopUp({ customerId }: { customerId: string }) {
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="text-xs text-fyh-text-muted">Top up wallet ₹</label>
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="500"
          className="w-32"
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const res = await topUpWalletAction(customerId, Number(amount || 0));
            setMsg(res.error ?? res.success ?? null);
            if (res.success) setAmount('');
          });
        }}
      >
        Top up
      </Button>
      {msg ? <p className="text-xs text-fyh-text-secondary w-full">{msg}</p> : null}
    </div>
  );
}

function HiddenDefaults({
  customer,
  includeBasics,
  includeSalon,
  includeLoyalty,
}: {
  customer: FyhCustomer;
  includeBasics?: boolean;
  includeSalon?: boolean;
  includeLoyalty?: boolean;
}) {
  return (
    <>
      {includeBasics ? (
        <>
          <input type="hidden" name="fullName" value={customer.fullName} />
          <input type="hidden" name="phone" value={customer.phone} />
          <input type="hidden" name="whatsapp" value={customer.whatsapp ?? ''} />
          <input type="hidden" name="email" value={customer.email ?? ''} />
          <input type="hidden" name="gender" value={customer.gender ?? ''} />
          <input type="hidden" name="dateOfBirth" value={customer.dateOfBirth ?? ''} />
          <input type="hidden" name="anniversary" value={customer.anniversary ?? ''} />
          <input type="hidden" name="address" value={customer.address ?? ''} />
          <input type="hidden" name="city" value={customer.city ?? ''} />
          <input type="hidden" name="state" value={customer.state ?? ''} />
          <input type="hidden" name="pincode" value={customer.pincode ?? ''} />
          <input type="hidden" name="occupation" value={customer.occupation ?? ''} />
          <input type="hidden" name="source" value={customer.source ?? ''} />
          <input type="hidden" name="referredBy" value={customer.referredBy ?? ''} />
          <input type="hidden" name="tags" value={(customer.tags ?? []).join(', ')} />
          <input type="hidden" name="notes" value={customer.notes ?? ''} />
          <input type="hidden" name="importantAlerts" value={customer.importantAlerts ?? ''} />
        </>
      ) : null}
      {includeSalon ? (
        <>
          <input type="hidden" name="hairType" value={customer.hairType ?? ''} />
          <input type="hidden" name="skinType" value={customer.skinType ?? ''} />
          <input type="hidden" name="allergies" value={customer.allergies ?? ''} />
          <input type="hidden" name="preferredStylist" value={customer.preferredStylist ?? ''} />
          <input type="hidden" name="favouriteStylist" value={customer.favouriteStylist ?? ''} />
          <input type="hidden" name="favouriteService" value={customer.favouriteService ?? ''} />
          <input type="hidden" name="lastService" value={customer.lastService ?? ''} />
        </>
      ) : null}
      {includeLoyalty ? (
        <input type="hidden" name="membership" value={customer.membership ?? ''} />
      ) : null}
    </>
  );
}
