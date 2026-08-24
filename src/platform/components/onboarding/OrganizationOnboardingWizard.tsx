'use client';

import { useState } from 'react';
import { createOrganizationAction } from '@/src/platform/actions/admin';
import type { PlatformPlanRecord } from '@/src/platform/services/admin';

type Props = {
  plans: PlatformPlanRecord[];
};

const STEPS = ['Salon', 'Location', 'Subscription', 'Owner', 'Review'] as const;

export function OrganizationOnboardingWizard({ plans }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    organizationName: '',
    businessEmail: '',
    defaultTimezone: 'Asia/Kolkata',
    gstin: '',
    invoicePrefix: 'FYH',
    primaryLocationName: '',
    primaryLocationAddress: '',
    planId: '',
    subscriptionStatus: 'trial',
    firstOwnerName: '',
    firstOwnerEmail: '',
    firstOwnerPhone: '',
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function canNext(): boolean {
    if (step === 0) return Boolean(form.organizationName && form.businessEmail);
    if (step === 1) return Boolean(form.primaryLocationName);
    if (step === 2) return Boolean(form.planId);
    if (step === 3) return Boolean(form.firstOwnerName && form.firstOwnerEmail);
    return true;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex gap-1">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={[
              'flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium',
              i === step
                ? 'bg-[var(--plt-accent)]/15 text-[var(--plt-accent)]'
                : i < step
                  ? 'bg-white/5 text-[var(--plt-text-muted)]'
                  : 'text-[var(--plt-text-subtle)]',
            ].join(' ')}
          >
            {label}
          </div>
        ))}
      </div>

      <form action={createOrganizationAction} className="rounded-lg border border-[var(--plt-border)] bg-[var(--plt-bg-surface)] p-6">
        <input type="hidden" name="organizationName" value={form.organizationName} />
        <input type="hidden" name="businessEmail" value={form.businessEmail} />
        <input type="hidden" name="defaultTimezone" value={form.defaultTimezone} />
        <input type="hidden" name="gstin" value={form.gstin} />
        <input type="hidden" name="invoicePrefix" value={form.invoicePrefix} />
        <input type="hidden" name="primaryLocationName" value={form.primaryLocationName} />
        <input type="hidden" name="primaryLocationAddress" value={form.primaryLocationAddress} />
        <input type="hidden" name="planId" value={form.planId} />
        <input type="hidden" name="subscriptionStatus" value={form.subscriptionStatus} />
        <input type="hidden" name="firstOwnerName" value={form.firstOwnerName} />
        <input type="hidden" name="firstOwnerEmail" value={form.firstOwnerEmail} />
        <input type="hidden" name="firstOwnerPhone" value={form.firstOwnerPhone} />

        {step === 0 && (
          <div className="grid gap-4">
            <h2 className="text-sm font-semibold">Salon details</h2>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Salon name</span>
              <input required value={form.organizationName} onChange={(e) => update('organizationName', e.target.value)} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Business email</span>
              <input type="email" required value={form.businessEmail} onChange={(e) => update('businessEmail', e.target.value)} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Timezone</span>
              <input value={form.defaultTimezone} onChange={(e) => update('defaultTimezone', e.target.value)} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">GSTIN</span>
              <input value={form.gstin} onChange={(e) => update('gstin', e.target.value)} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Invoice prefix</span>
              <input value={form.invoicePrefix} onChange={(e) => update('invoicePrefix', e.target.value)} className="plt-input" />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            <h2 className="text-sm font-semibold">Primary location</h2>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Location name</span>
              <input required value={form.primaryLocationName} onChange={(e) => update('primaryLocationName', e.target.value)} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Address</span>
              <textarea rows={3} value={form.primaryLocationAddress} onChange={(e) => update('primaryLocationAddress', e.target.value)} className="plt-input" />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <h2 className="text-sm font-semibold">Plan & subscription</h2>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Plan</span>
              <select required value={form.planId} onChange={(e) => update('planId', e.target.value)} className="plt-input">
                <option value="">Select a plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name} ({plan.slug})</option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 rounded-md border border-[var(--plt-border)] bg-black/10 px-3 py-3 text-sm">
              <span className="text-[var(--plt-text-muted)]">Trial</span>
              <p className="text-[var(--plt-text)]">30-day free trial starts when the salon is created.</p>
              <p className="text-xs text-[var(--plt-text-subtle)]">
                After that, the salon will land on the existing subscribe screen until payment is approved.
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <h2 className="text-sm font-semibold">Owner information</h2>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Owner name</span>
              <input required value={form.firstOwnerName} onChange={(e) => update('firstOwnerName', e.target.value)} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Owner email</span>
              <input type="email" required value={form.firstOwnerEmail} onChange={(e) => update('firstOwnerEmail', e.target.value)} className="plt-input" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-[var(--plt-text-muted)]">Phone</span>
              <input value={form.firstOwnerPhone} onChange={(e) => update('firstOwnerPhone', e.target.value)} className="plt-input" />
            </label>
            <p className="text-xs text-[var(--plt-text-subtle)]">
              An owner invitation will be created. The owner sets their password when accepting the invite.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <h2 className="font-semibold">Review & provision</h2>
            <dl className="grid gap-2 text-[var(--plt-text-muted)]">
              <div><dt className="text-xs text-[var(--plt-text-subtle)]">Salon</dt><dd className="text-[var(--plt-text)]">{form.organizationName}</dd></div>
              <div><dt className="text-xs text-[var(--plt-text-subtle)]">Location</dt><dd className="text-[var(--plt-text)]">{form.primaryLocationName}</dd></div>
              <div><dt className="text-xs text-[var(--plt-text-subtle)]">Plan</dt><dd className="text-[var(--plt-text)]">{plans.find((p) => p.id === form.planId)?.name ?? form.planId}</dd></div>
              <div><dt className="text-xs text-[var(--plt-text-subtle)]">Owner</dt><dd className="text-[var(--plt-text)]">{form.firstOwnerName} · {form.firstOwnerEmail}</dd></div>
            </dl>
          </div>
        )}

        <div className="mt-6 flex justify-between gap-3">
          {step > 0 ? (
            <button type="button" className="plt-btn-secondary" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="plt-btn-primary"
              disabled={!canNext()}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </button>
          ) : (
            <button type="submit" className="plt-btn-primary">
              Provision organization
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
