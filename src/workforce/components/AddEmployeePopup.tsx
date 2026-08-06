'use client';

import { useActionState, useEffect, useId, useState, useTransition } from 'react';
import {
  createWorkforceEmployeeAction,
  type WorkforceActionState,
} from '@/src/workforce/actions/employees';
import {
  WORKFORCE_ACCESS_ROLES,
  WORKFORCE_PERMISSION_LIBRARY,
  WORKFORCE_PERMISSION_GROUP_LABELS,
} from '@/src/workforce/types';
import {
  WORKFORCE_INCENTIVE_PLAN_TYPES,
  WORKFORCE_PAYMENT_METHODS,
  WORKFORCE_SALARY_FREQUENCIES,
  type WorkforceIncentivePlanType,
} from '@/src/workforce/types/hr';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { WeekOffPicker } from '@/src/workforce/components/WeekOffPicker';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

const initial: WorkforceActionState = {};

const fieldClass = 'fyh-select w-full text-sm text-fyh-text';
const inputClass = '!bg-[color:var(--fyh-bg-surface)]';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-fyh-text-secondary">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Add Employee — minimal form; role templates apply permissions automatically.
 */
export function AddEmployeePopup() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [receiveBookings, setReceiveBookings] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [planType, setPlanType] = useState<WorkforceIncentivePlanType>('none');
  const [state, action, pending] = useActionState(createWorkforceEmployeeAction, initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      setQrPreview(null);
      setReceiveBookings(true);
      setShowAdvanced(false);
    }
  }, [state.success]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, pending]);

  const permissionGroups = WORKFORCE_PERMISSION_LIBRARY.reduce<
    Record<string, Array<(typeof WORKFORCE_PERMISSION_LIBRARY)[number]>>
  >((acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  }, {});

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add employee
      </Button>

      {state.success && !open ? (
        <p className="mt-2 text-sm text-emerald-700">{state.success}</p>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[600]" role="presentation">
          <button
            type="button"
            className="fyh-form-modal-backdrop absolute inset-0"
            aria-label="Close add employee dialog"
            onClick={() => !pending && setOpen(false)}
          />
          <div className="pointer-events-none fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="fyh-form-modal-panel pointer-events-auto flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 id={titleId} className="text-lg font-semibold text-fyh-text">
                    Add employee
                  </h2>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-sm text-fyh-text-secondary hover:bg-[color:var(--fyh-surface-muted)]"
                    onClick={() => !pending && setOpen(false)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <form
                action={(fd) => {
                  startTransition(() => action(fd));
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
                  <Section title="Basic information">
                    <div className="space-y-3">
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium">Full Name</span>
                        <Input name="fullName" required autoFocus className={inputClass} />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium">Email Address</span>
                        <Input
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          placeholder="name@example.com"
                          className={inputClass}
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium">Phone Number</span>
                        <Input
                          name="mobile"
                          placeholder="9876543210"
                          inputMode="tel"
                          className={inputClass}
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium">Password</span>
                        <Input
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          minLength={6}
                          placeholder="Min 6 characters to enable login"
                          className={inputClass}
                        />
                        <span className="text-xs text-fyh-text-secondary">
                          Sign in with email or phone + password
                        </span>
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium">Access Role</span>
                        <select name="accessRole" className={fieldClass} defaultValue="staff">
                          {WORKFORCE_ACCESS_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {workforceAccessRoleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </Section>

                  <Section title="Personal information">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Gender</span>
                        <select name="gender" className={fieldClass} defaultValue="unspecified">
                          <option value="unspecified">Unspecified</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Joining Date</span>
                        <Input name="joiningDate" type="date" className={inputClass} />
                      </label>
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="font-medium">Emergency Contact</span>
                        <Input name="emergencyContact" placeholder="Name / phone" className={inputClass} />
                      </label>
                    </div>
                  </Section>

                  <Section title="Employment">
                    <WeekOffPicker defaultOffDays={[0]} />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Aadhaar</span>
                        <Input name="aadhaarNumber" inputMode="numeric" className={inputClass} />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">PAN</span>
                        <Input name="panNumber" className={`uppercase ${inputClass}`} />
                      </label>
                    </div>
                  </Section>

                  <Section title="Salary">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Base Monthly Salary (₹)</span>
                        <Input
                          name="salaryInr"
                          type="number"
                          min={0}
                          step="1"
                          defaultValue={0}
                          className={inputClass}
                        />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Payment Frequency</span>
                        <select name="salaryFrequency" className={fieldClass} defaultValue="monthly">
                          {WORKFORCE_SALARY_FREQUENCIES.map((f) => (
                            <option key={f} value={f}>
                              {f.charAt(0).toUpperCase() + f.slice(1)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="font-medium">Salary Effective From</span>
                        <Input name="salaryEffectiveFrom" type="date" className={inputClass} />
                      </label>
                    </div>
                  </Section>

                  <Section title="Incentive plan">
                    <label className="block space-y-1 text-sm">
                      <span className="font-medium">Plan type</span>
                      <select
                        name="incentivePlanType"
                        className={fieldClass}
                        value={planType}
                        onChange={(e) => setPlanType(e.target.value as WorkforceIncentivePlanType)}
                      >
                        {WORKFORCE_INCENTIVE_PLAN_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t === 'none'
                              ? 'No Incentive'
                              : t === 'percentage_threshold'
                                ? 'Percentage Incentive'
                                : 'Fixed Bonus'}
                          </option>
                        ))}
                      </select>
                    </label>
                    {planType === 'percentage_threshold' ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Base Salary (₹)</span>
                          <Input name="incentiveBaseSalaryInr" type="number" min={0} className={inputClass} />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Threshold Multiplier</span>
                          <Input
                            name="thresholdMultiplier"
                            type="number"
                            min={0.1}
                            step="0.1"
                            defaultValue={2}
                            className={inputClass}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="font-medium">Above Threshold %</span>
                          <Input
                            name="aboveThresholdPercent"
                            type="number"
                            min={0}
                            max={100}
                            defaultValue={10}
                            className={inputClass}
                          />
                        </label>
                      </div>
                    ) : null}
                    {planType === 'fixed_bonus' ? (
                      <label className="mt-3 block space-y-1 text-sm">
                        <span className="font-medium">Fixed Bonus (₹)</span>
                        <Input name="fixedBonusInr" type="number" min={0} className={inputClass} />
                      </label>
                    ) : null}
                    <label className="mt-3 block space-y-1 text-sm">
                      <span className="font-medium">Effective From</span>
                      <Input name="incentiveEffectiveFrom" type="date" className={inputClass} />
                    </label>
                  </Section>

                  <Section title="Payment details">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="font-medium">Bank Account Holder Name</span>
                        <Input name="bankAccountHolderName" className={inputClass} />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Bank Name</span>
                        <Input name="bankName" className={inputClass} />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">Account Number</span>
                        <Input name="accountNumber" inputMode="numeric" className={inputClass} />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">IFSC Code</span>
                        <Input name="ifscCode" className={`uppercase ${inputClass}`} />
                      </label>
                      <label className="space-y-1 text-sm">
                        <span className="font-medium">UPI ID</span>
                        <Input name="upiId" placeholder="name@upi" className={inputClass} />
                      </label>
                      <fieldset className="space-y-2 sm:col-span-2">
                        <legend className="text-sm font-medium">Primary Payment Method</legend>
                        <div className="flex flex-wrap gap-4 text-sm">
                          {WORKFORCE_PAYMENT_METHODS.map((m) => (
                            <label key={m} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="primaryPaymentMethod"
                                value={m}
                                defaultChecked={m === 'upi'}
                              />
                              <span>{m === 'bank_transfer' ? 'Bank Transfer' : 'UPI'}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="font-medium">QR Code</span>
                        <input
                          type="file"
                          accept="image/*"
                          className={fieldClass}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) {
                              setQrPreview(null);
                              return;
                            }
                            if (file.size > 800_000) {
                              alert('QR image must be under 800KB');
                              e.target.value = '';
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              const dataUrl =
                                typeof reader.result === 'string' ? reader.result : '';
                              setQrPreview(dataUrl);
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        <input type="hidden" name="qrCodeUrl" value={qrPreview ?? ''} />
                      </label>
                    </div>
                  </Section>

                  <Section title="Work">
                    <label className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        name="receiveBookings"
                        value="1"
                        checked={receiveBookings}
                        onChange={(e) => setReceiveBookings(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium">Appointment bookable</span>
                    </label>
                  </Section>

                  <div>
                    <button
                      type="button"
                      className="text-sm text-fyh-accent underline-offset-2 hover:underline"
                      onClick={() => setShowAdvanced((v) => !v)}
                    >
                      Advanced Permission Overrides
                    </button>
                    {showAdvanced ? (
                      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-[color:var(--fyh-border)] p-3">
                        <p className="text-xs text-fyh-text-secondary">
                          Leave unchecked to use the Access Role defaults. Only use when this
                          employee needs different permissions.
                        </p>
                        {Object.entries(permissionGroups).map(([group, defs]) => (
                          <fieldset key={group} className="space-y-1">
                            <legend className="text-xs font-medium text-fyh-text-secondary">
                              {WORKFORCE_PERMISSION_GROUP_LABELS[
                                group as keyof typeof WORKFORCE_PERMISSION_GROUP_LABELS
                              ] ?? group}
                            </legend>
                            <div className="grid gap-1 sm:grid-cols-2">
                              {defs.map((def) => (
                                <label key={def.key} className="flex items-center gap-2 text-xs">
                                  <input type="checkbox" name="permissions" value={def.key} />
                                  <span>{def.label}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
                </div>

                <div className="shrink-0 border-t border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] px-5 py-4">
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => setOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending ? 'Saving…' : 'Create employee'}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** @deprecated Prefer AddEmployeePopup — kept for import compatibility. */
export function WorkforceCreateForm() {
  return <AddEmployeePopup />;
}
