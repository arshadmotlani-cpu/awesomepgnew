'use client';

import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';
import {
  createWorkforceEmployeeAction,
  type WorkforceActionState,
} from '@/src/workforce/actions/employees';
import {
  WORKFORCE_ACCESS_ROLES,
  WORKFORCE_PERMISSION_LIBRARY,
  WORKFORCE_PERMISSION_GROUP_LABELS,
} from '@/src/workforce/types';
import { WORKFORCE_PAYMENT_METHODS, type WorkforcePaymentMethod } from '@/src/workforce/types/hr';
import { defaultSalonRulesConfig } from '@/src/workforce/lib/incentiveRuleEngine';
import { IncentiveRuleBuilder } from '@/src/workforce/components/IncentiveRuleBuilder';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { WeekOffPicker } from '@/src/workforce/components/WeekOffPicker';
import { WorkingHoursFields } from '@/src/workforce/components/WorkingHoursFields';
import {
  EmployeeProfileNav,
  EMPLOYEE_PROFILE_SECTIONS,
  type EmployeeProfileSectionId,
} from '@/src/workforce/components/EmployeeProfileNav';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

const initial: WorkforceActionState = {};
const fieldClass = 'fyh-select w-full text-sm text-fyh-text';

const SECTION_ORDER = EMPLOYEE_PROFILE_SECTIONS.map((s) => s.id);

const CREATE_CONTINUE_LABELS: Record<EmployeeProfileSectionId, string> = {
  'staff-details': 'Continue to credentials',
  credentials: 'Continue to salary & incentives',
  salary: 'Continue to additional rights',
  rights: 'Continue to shift schedule',
  schedule: 'Create employee',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
        {title}
      </h3>
      {children}
    </section>
  );
}

function panelClass(active: boolean) {
  return active ? 'space-y-6' : 'hidden';
}

/**
 * Add Employee — professional five-section configuration UI.
 * Same tab structure as the employee profile for create and future editing.
 */
export function AddEmployeePopup() {
  const titleId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<EmployeeProfileSectionId>('staff-details');
  const [receiveBookings, setReceiveBookings] = useState(true);
  const [salaryInr, setSalaryInr] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createWorkforceEmployeeAction, initial);
  const [, startTransition] = useTransition();

  const salaryPaise = salaryInr ? Math.round(Number(salaryInr) * 100) : 0;
  const defaultRules = defaultSalonRulesConfig();
  const sectionIndex = SECTION_ORDER.indexOf(activeSection);
  const isLastSection = sectionIndex === SECTION_ORDER.length - 1;

  const permissionGroups = WORKFORCE_PERMISSION_LIBRARY.reduce<
    Record<string, Array<(typeof WORKFORCE_PERMISSION_LIBRARY)[number]>>
  >((acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  }, {});

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      setActiveSection('staff-details');
      setReceiveBookings(true);
      setSalaryInr('');
      setShowAdvanced(false);
      setQrPreview(null);
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

  function validateStaffDetails(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const required = form.querySelectorAll<HTMLInputElement>(
      '[data-staff-required="true"]',
    );
    for (const el of required) {
      if (!el.reportValidity()) return false;
    }
    return true;
  }

  function handleContinue() {
    if (activeSection === 'staff-details' && !validateStaffDetails()) return;
    if (!isLastSection) {
      setActiveSection(SECTION_ORDER[sectionIndex + 1]!);
    }
  }

  function handleBack() {
    if (sectionIndex > 0) {
      setActiveSection(SECTION_ORDER[sectionIndex - 1]!);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add employee
      </Button>

      {state.success && !open ? (
        <p className="fyh-alert-success mt-2 text-sm">{state.success}</p>
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
              className="fyh-form-modal-panel pointer-events-auto flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
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
                <p className="mt-1 text-sm text-fyh-text-secondary">
                  Configure the new employee across staff details, credentials, salary, permissions,
                  and schedule.
                </p>
              </div>

              <div className="shrink-0 border-b border-[color:var(--fyh-border)] px-5 pt-3">
                <EmployeeProfileNav active={activeSection} onChange={setActiveSection} />
              </div>

              <form
                ref={formRef}
                action={(fd) => {
                  startTransition(() => action(fd));
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <input type="hidden" name="qrCodeUrl" value={qrPreview ?? ''} />
                <input type="hidden" name="salaryFrequency" value="monthly" />

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                  <div className={panelClass(activeSection === 'staff-details')}>
                    <Section title="Basic information">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="fyh-form-label">Full Name</span>
                          <Input name="fullName" required autoFocus data-staff-required="true" />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Email Address</span>
                          <Input
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            data-staff-required="true"
                            placeholder="name@example.com"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Phone Number</span>
                          <Input name="mobile" placeholder="9876543210" inputMode="tel" />
                        </label>
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="fyh-form-label">Password</span>
                          <Input
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            minLength={6}
                            placeholder="Min 6 characters to enable login"
                          />
                          <span className="fyh-form-helper">
                            Sign in with email or phone + password
                          </span>
                        </label>
                      </div>
                    </Section>

                    <Section title="Employment">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Access Role</span>
                          <select name="accessRole" className={fieldClass} defaultValue="staff">
                            {WORKFORCE_ACCESS_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {workforceAccessRoleLabel(r)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Joining Date</span>
                          <Input
                            name="joiningDate"
                            type="date"
                            required
                            data-staff-required="true"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Gender</span>
                          <select name="gender" className={fieldClass} defaultValue="unspecified">
                            <option value="unspecified">Unspecified</option>
                            <option value="female">Female</option>
                            <option value="male">Male</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Emergency Contact</span>
                          <Input name="emergencyContact" placeholder="Name / phone" />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Status</span>
                          <select name="status" className={fieldClass} defaultValue="active">
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-3 text-sm sm:col-span-2">
                          <input
                            type="checkbox"
                            name="receiveBookings"
                            value="1"
                            checked={receiveBookings}
                            onChange={(e) => setReceiveBookings(e.target.checked)}
                            className="fyh-checkbox"
                          />
                          <span className="fyh-form-label">Appointment bookable</span>
                        </label>
                      </div>
                    </Section>

                    <Section title="Documents">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Aadhaar</span>
                          <Input name="aadhaarNumber" />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">PAN</span>
                          <Input name="panNumber" className="uppercase" />
                        </label>
                      </div>
                    </Section>
                  </div>

                  <div className={panelClass(activeSection === 'credentials')}>
                    <Section title="Payment credentials">
                      <p className="text-xs text-fyh-text-secondary">Used for salary payouts only.</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="fyh-form-label">Bank Account Holder Name</span>
                          <Input name="bankAccountHolderName" />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Bank Name</span>
                          <Input name="bankName" />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Account Number</span>
                          <Input name="accountNumber" inputMode="numeric" />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">IFSC Code</span>
                          <Input name="ifscCode" className="uppercase" />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">UPI ID</span>
                          <Input name="upiId" />
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
                                  className="fyh-radio"
                                />
                                <span>{m === 'bank_transfer' ? 'Bank Transfer' : 'UPI'}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="fyh-form-label">QR Code</span>
                          <input
                            type="file"
                            accept="image/*"
                            className={fieldClass}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 800_000) {
                                alert('QR image must be under 800KB');
                                e.target.value = '';
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === 'string') setQrPreview(reader.result);
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                          {qrPreview ? (
                            <img
                              src={qrPreview}
                              alt="Payment QR"
                              className="mt-2 h-24 w-24 rounded border"
                            />
                          ) : null}
                        </label>
                      </div>
                    </Section>
                  </div>

                  <div className={panelClass(activeSection === 'salary')}>
                    <Section title="Base salary">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="fyh-form-label">Base Monthly Salary (₹)</span>
                          <Input
                            name="salaryInr"
                            type="number"
                            min={0}
                            step="1"
                            placeholder="0"
                            value={salaryInr}
                            onChange={(e) => setSalaryInr(e.target.value)}
                          />
                        </label>
                        <div className="space-y-1 text-sm">
                          <span className="fyh-form-label">Payment Frequency</span>
                          <p className="flex h-10 items-center rounded-[var(--fyh-radius)] border border-[color:var(--fyh-border-strong)] bg-black/25 px-3.5 text-sm text-fyh-text">
                            Monthly
                          </p>
                        </div>
                      </div>
                      <p className="fyh-form-helper">
                        Salary is generated between the 7th and 10th for the previous month, based on
                        joining date.
                      </p>
                    </Section>

                    <IncentiveRuleBuilder
                      kind="service"
                      title="Service incentive"
                      initialEnabled={defaultRules.serviceEnabled}
                      initialRules={defaultRules.serviceRules}
                      salaryPaise={salaryPaise}
                    />

                    <IncentiveRuleBuilder
                      kind="product"
                      title="Product incentive"
                      initialEnabled={defaultRules.productEnabled}
                      initialRules={defaultRules.productRules}
                      salaryPaise={salaryPaise}
                    />
                  </div>

                  <div className={panelClass(activeSection === 'rights')}>
                    <Section title="Additional rights">
                      <p className="text-sm text-fyh-text-secondary">
                        Default permissions apply from the access role. Override only when needed.
                      </p>
                      <button
                        type="button"
                        className="text-sm text-fyh-accent underline-offset-2 hover:underline"
                        onClick={() => setShowAdvanced((v) => !v)}
                      >
                        Advanced Permission Overrides
                      </button>
                      {showAdvanced ? (
                        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-[color:var(--fyh-border)] p-3">
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
                    </Section>
                  </div>

                  <div className={panelClass(activeSection === 'schedule')}>
                    <Section title="Weekly off days">
                      <WeekOffPicker defaultOffDays={[0]} />
                    </Section>
                    <Section title="Working hours">
                      <p className="text-xs text-fyh-text-secondary">
                        Set start and end times for each day. Use Off for days the employee does not
                        work.
                      </p>
                      <WorkingHoursFields />
                    </Section>
                  </div>

                  {state.error ? <p className="fyh-alert-danger mt-4 text-sm">{state.error}</p> : null}
                </div>

                <div className="shrink-0 border-t border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] px-5 py-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => setOpen(false)}
                      >
                        Cancel
                      </Button>
                      {sectionIndex > 0 ? (
                        <Button type="button" variant="secondary" disabled={pending} onClick={handleBack}>
                          Back
                        </Button>
                      ) : null}
                    </div>
                    {isLastSection ? (
                      <Button type="submit" disabled={pending}>
                        {pending ? 'Creating…' : CREATE_CONTINUE_LABELS.schedule}
                      </Button>
                    ) : (
                      <Button type="button" disabled={pending} onClick={handleContinue}>
                        {CREATE_CONTINUE_LABELS[activeSection]}
                      </Button>
                    )}
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
