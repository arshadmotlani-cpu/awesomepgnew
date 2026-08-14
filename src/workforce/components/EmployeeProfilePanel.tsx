'use client';

import { useActionState, useEffect, useId, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  updateWorkforceEmployeeAction,
  type WorkforceActionState,
} from '@/src/workforce/actions/employees';
import {
  WORKFORCE_ACCESS_ROLES,
  WORKFORCE_PERMISSION_LIBRARY,
  WORKFORCE_PERMISSION_GROUP_LABELS,
} from '@/src/workforce/types';
import { WORKFORCE_PAYMENT_METHODS, type WorkforcePaymentMethod } from '@/src/workforce/types/hr';
import {
  defaultSalonRulesConfig,
  normalizeIncentivePlan,
} from '@/src/workforce/lib/incentiveRuleEngine';
import { IncentiveRuleBuilder } from '@/src/workforce/components/IncentiveRuleBuilder';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { formatWeekOffDays } from '@/src/workforce/lib/weekOff';
import { WeekOffPicker } from '@/src/workforce/components/WeekOffPicker';
import {
  WorkingHoursEditor,
  type ScheduleDayValue,
} from '@/src/workforce/components/WorkingHoursEditor';
import {
  EmployeeProfileNav,
  type EmployeeProfileSectionId,
} from '@/src/workforce/components/EmployeeProfileNav';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { formatInrFromPaise } from '@/src/hair/lib/money';
import type { WfEmployee, WfEngineMembership, WfIncentivePlan } from '@/src/workforce/db/schema';
import type { WorkforcePermissionGrants } from '@/src/workforce/types';
import type { SalonPeriodIncentiveResult } from '@/src/workforce/services/salonIncentive';

const initial: WorkforceActionState = {};
const fieldClass = 'fyh-select w-full text-sm text-fyh-text';

function SectionSaveFooter({
  canEdit,
  pending,
  label,
}: {
  canEdit: boolean;
  pending: boolean;
  label: string;
}) {
  if (!canEdit) return null;
  return (
    <div className="flex justify-end border-t border-[color:var(--fyh-border)] pt-4">
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  );
}

const SECTION_SAVE_LABELS: Record<EmployeeProfileSectionId, string> = {
  'staff-details': 'Save staff details',
  credentials: 'Save credentials',
  salary: 'Save salary & incentives',
  rights: 'Save permissions',
  schedule: 'Save week-off days',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
        {title}
      </h2>
      {children}
    </section>
  );
}

type Props = {
  employee: WfEmployee;
  membership: WfEngineMembership;
  grants: WorkforcePermissionGrants;
  incentivePlan: WfIncentivePlan | null;
  weekOffDays: number[];
  canEdit: boolean;
  canToggleIncentive: boolean;
  periodIncentive: SalonPeriodIncentiveResult | null;
  scheduleDays: ScheduleDayValue[];
};

export function EmployeeProfilePanel({
  employee,
  membership,
  grants,
  incentivePlan,
  weekOffDays,
  canEdit,
  canToggleIncentive,
  periodIncentive,
  scheduleDays,
}: Props) {
  const formId = useId();
  const [activeSection, setActiveSection] = useState<EmployeeProfileSectionId>('staff-details');
  const [state, action, pending] = useActionState(updateWorkforceEmployeeAction, initial);
  const [, startTransition] = useTransition();
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [qrPreview, setQrPreview] = useState<string | null>(employee.qrCodeUrl);
  const [receiveBookings, setReceiveBookings] = useState(
    grants.permissions.includes('appointments.receive_bookings'),
  );
  const salonRulesConfig =
    normalizeIncentivePlan(incentivePlan?.planType ?? 'none', incentivePlan?.config ?? {}) ??
    defaultSalonRulesConfig();
  const canEditIncentiveRules = canEdit && canToggleIncentive;

  useEffect(() => {
    if (state.success) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [state.success]);

  const permissionGroups = WORKFORCE_PERMISSION_LIBRARY.reduce<
    Record<string, Array<(typeof WORKFORCE_PERMISSION_LIBRARY)[number]>>
  >((acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/staff" className="text-sm text-fyh-accent hover:underline">
            ← Back to staff
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-fyh-text">{employee.fullName}</h1>
          <p className="text-sm text-fyh-text-secondary">
            {workforceAccessRoleLabel(membership.jobRole)} · {employee.status}
          </p>
        </div>
      </div>

      {state.success ? (
        <p className="fyh-alert-success-box text-sm">{state.success}</p>
      ) : null}
      {state.error ? (
        <p className="fyh-alert-danger-box text-sm">{state.error}</p>
      ) : null}

      <EmployeeProfileNav active={activeSection} onChange={setActiveSection} />

      <form
        id={formId}
        action={(fd) => startTransition(() => action(fd))}
        className="space-y-6 rounded-xl border border-[color:var(--fyh-border)] p-4"
      >
        <input type="hidden" name="employeeId" value={employee.id} />
        <input type="hidden" name="saveSection" value={activeSection} />
        <input type="hidden" name="qrCodeUrl" value={qrPreview ?? employee.qrCodeUrl ?? ''} />
        <input type="hidden" name="salaryFrequency" value="monthly" />
        {(!canEditIncentiveRules || activeSection !== 'salary') ? (
          <input
            type="hidden"
            name="incentiveConfigPreserve"
            value={JSON.stringify(salonRulesConfig)}
          />
        ) : null}

        {activeSection === 'staff-details' ? (
          <div className="space-y-6">
            <Section title="Basic information">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium">Full Name</span>
                  <Input
                    name="fullName"
                    defaultValue={employee.fullName}
                    required
                    disabled={!canEdit}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Email</span>
                  <Input
                    name="email"
                    type="email"
                    defaultValue={employee.email ?? ''}
                    required
                    disabled={!canEdit}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Phone</span>
                  <Input name="mobile" defaultValue={employee.mobile ?? ''} disabled={!canEdit} />
                </label>
                <label className="space-y-1 text-sm sm:col-span-2">
                  <span className="font-medium">New password</span>
                  <Input
                    name="password"
                    type="password"
                    minLength={6}
                    placeholder="Leave blank to keep current"
                    disabled={!canEdit}
                  />
                </label>
              </div>
            </Section>

            <Section title="Employment">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Access Role</span>
                  <select
                    name="accessRole"
                    className={fieldClass}
                    defaultValue={membership.jobRole}
                    disabled={!canEdit}
                  >
                    {WORKFORCE_ACCESS_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {workforceAccessRoleLabel(r)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Joining Date</span>
                  <Input
                    name="joiningDate"
                    type="date"
                    defaultValue={employee.joiningDate ?? ''}
                    disabled={!canEdit}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Gender</span>
                  <select
                    name="gender"
                    className={fieldClass}
                    defaultValue={employee.gender}
                    disabled={!canEdit}
                  >
                    <option value="unspecified">Unspecified</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Emergency Contact</span>
                  <Input
                    name="emergencyContact"
                    defaultValue={employee.emergencyContact ?? ''}
                    disabled={!canEdit}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Status</span>
                  <select
                    name="status"
                    className={fieldClass}
                    defaultValue={employee.status}
                    disabled={!canEdit}
                  >
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
                    disabled={!canEdit}
                    className="fyh-checkbox"
                  />
                  <span className="font-medium">Appointment bookable</span>
                </label>
              </div>
            </Section>

            <Section title="Documents">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Aadhaar</span>
                  <Input
                    name="aadhaarNumber"
                    defaultValue={employee.aadhaarNumber ?? ''}
                    disabled={!canEdit}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">PAN</span>
                  <Input
                    name="panNumber"
                    defaultValue={employee.panNumber ?? ''}
                    disabled={!canEdit}
                    className="uppercase"
                  />
                </label>
              </div>
            </Section>

            <SectionSaveFooter
              canEdit={canEdit}
              pending={pending}
              label={SECTION_SAVE_LABELS['staff-details']}
            />
          </div>
        ) : null}

        {activeSection === 'credentials' ? (
          <div className="space-y-6">
            <Section title="Payment credentials">
            <p className="text-xs text-fyh-text-secondary">Used for salary payouts only.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">Bank Account Holder Name</span>
                <Input
                  name="bankAccountHolderName"
                  defaultValue={employee.bankAccountHolderName ?? ''}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Bank Name</span>
                <Input name="bankName" defaultValue={employee.bankName ?? ''} disabled={!canEdit} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Account Number</span>
                <Input
                  name="accountNumber"
                  inputMode="numeric"
                  defaultValue={employee.accountNumber ?? ''}
                  disabled={!canEdit}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">IFSC Code</span>
                <Input
                  name="ifscCode"
                  defaultValue={employee.ifscCode ?? ''}
                  disabled={!canEdit}
                  className="uppercase"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">UPI ID</span>
                <Input name="upiId" defaultValue={employee.upiId ?? ''} disabled={!canEdit} />
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
                        defaultChecked={(employee.primaryPaymentMethod as WorkforcePaymentMethod) === m}
                        disabled={!canEdit}
                        className="fyh-radio"
                      />
                      <span>{m === 'bank_transfer' ? 'Bank Transfer' : 'UPI'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="font-medium">QR Code</span>
                {canEdit ? (
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
                ) : null}
                {qrPreview ? (
                  <img src={qrPreview} alt="Payment QR" className="mt-2 h-24 w-24 rounded border" />
                ) : null}
              </label>
            </div>
            </Section>
            <SectionSaveFooter
              canEdit={canEdit}
              pending={pending}
              label={SECTION_SAVE_LABELS.credentials}
            />
          </div>
        ) : null}

        {activeSection === 'salary' ? (
          <div className="space-y-6">
            <Section title="Base salary">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="fyh-form-label">Base Monthly Salary (₹)</span>
                  <Input
                    name="salaryInr"
                    type="number"
                    min={0}
                    step="1"
                    defaultValue={Math.round(employee.salaryPaise / 100)}
                    disabled={!canEdit}
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
                Salary is generated between the 7th and 10th for the previous month, based on joining
                date.
              </p>
            </Section>

            <IncentiveRuleBuilder
              kind="service"
              title="Service incentive"
              initialEnabled={salonRulesConfig.serviceEnabled}
              initialRules={salonRulesConfig.serviceRules}
              salaryPaise={employee.salaryPaise}
              disabled={!canEditIncentiveRules}
            />

            <IncentiveRuleBuilder
              kind="product"
              title="Product incentive"
              initialEnabled={salonRulesConfig.productEnabled}
              initialRules={salonRulesConfig.productRules}
              salaryPaise={employee.salaryPaise}
              disabled={!canEditIncentiveRules}
            />

            {!canToggleIncentive && canEdit ? (
              <p className="fyh-form-helper">Only the owner can change incentive rules.</p>
            ) : null}

            {periodIncentive ? (
              <Section title="Previous month preview">
                <p className="text-sm text-fyh-text-secondary">
                  {periodIncentive.periodStart} → {periodIncentive.periodEnd}
                  {periodIncentive.incentiveEnabled
                    ? ''
                    : ' · Incentive disabled or salary not set'}
                </p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-fyh-text-secondary">Service performance</dt>
                    <dd className="font-medium tabular-nums">
                      {formatInrFromPaise(periodIncentive.servicePerformancePaise)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fyh-text-secondary">Product sales</dt>
                    <dd className="font-medium tabular-nums">
                      {formatInrFromPaise(periodIncentive.productSalesPaise)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fyh-text-secondary">Service incentive</dt>
                    <dd className="font-medium tabular-nums">
                      {formatInrFromPaise(periodIncentive.serviceIncentivePaise)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fyh-text-secondary">Product incentive</dt>
                    <dd className="font-medium tabular-nums">
                      {formatInrFromPaise(periodIncentive.productIncentivePaise)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-fyh-text-secondary">Total incentive</dt>
                    <dd className="text-lg font-semibold tabular-nums text-fyh-accent">
                      {formatInrFromPaise(periodIncentive.totalIncentivePaise)}
                    </dd>
                  </div>
                </dl>
              </Section>
            ) : null}

            <SectionSaveFooter
              canEdit={canEdit}
              pending={pending}
              label={SECTION_SAVE_LABELS.salary}
            />
          </div>
        ) : null}

        {activeSection === 'rights' ? (
          <div className="space-y-6">
            <Section title="Additional rights">
            <p className="text-sm text-fyh-text-secondary">
              Role: {workforceAccessRoleLabel(membership.jobRole)}. Use overrides only when needed.
            </p>
            {canEdit ? (
              <>
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
                              <input
                                type="checkbox"
                                name="permissions"
                                value={def.key}
                                defaultChecked={grants.permissions.includes(def.key)}
                              />
                              <span>{def.label}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-fyh-text-secondary">
                {grants.permissions.length} permissions from role and overrides.
              </p>
            )}
            </Section>
            <SectionSaveFooter
              canEdit={canEdit}
              pending={pending}
              label={SECTION_SAVE_LABELS.rights}
            />
          </div>
        ) : null}

        {activeSection === 'schedule' ? (
          <div className="space-y-6">
            <Section title="Weekly off days">
              {canEdit ? (
                <WeekOffPicker defaultOffDays={weekOffDays} />
              ) : (
                <p className="text-sm text-fyh-text-secondary">
                  Weekly off: {formatWeekOffDays(weekOffDays)}
                </p>
              )}
            </Section>
            <SectionSaveFooter
              canEdit={canEdit}
              pending={pending}
              label={SECTION_SAVE_LABELS.schedule}
            />
          </div>
        ) : null}

        {/* Preserve HR fields when saving from a tab that does not show them */}
        {activeSection !== 'staff-details' ? (
          <>
            <input type="hidden" name="fullName" value={employee.fullName} />
            <input type="hidden" name="email" value={employee.email ?? ''} />
            <input type="hidden" name="mobile" value={employee.mobile ?? ''} />
            <input type="hidden" name="accessRole" value={membership.jobRole} />
            <input type="hidden" name="joiningDate" value={employee.joiningDate ?? ''} />
            <input type="hidden" name="gender" value={employee.gender} />
            <input type="hidden" name="emergencyContact" value={employee.emergencyContact ?? ''} />
            <input type="hidden" name="status" value={employee.status} />
            <input type="hidden" name="aadhaarNumber" value={employee.aadhaarNumber ?? ''} />
            <input type="hidden" name="panNumber" value={employee.panNumber ?? ''} />
            {receiveBookings ? (
              <input type="hidden" name="receiveBookings" value="1" />
            ) : null}
            {activeSection !== 'schedule'
              ? weekOffDays.map((d) => (
                  <input key={d} type="hidden" name="weekOff" value={d} />
                ))
              : null}
          </>
        ) : null}

        {activeSection !== 'credentials' ? (
          <>
            <input
              type="hidden"
              name="bankAccountHolderName"
              value={employee.bankAccountHolderName ?? ''}
            />
            <input type="hidden" name="bankName" value={employee.bankName ?? ''} />
            <input type="hidden" name="accountNumber" value={employee.accountNumber ?? ''} />
            <input type="hidden" name="ifscCode" value={employee.ifscCode ?? ''} />
            <input type="hidden" name="upiId" value={employee.upiId ?? ''} />
            <input
              type="hidden"
              name="primaryPaymentMethod"
              value={employee.primaryPaymentMethod ?? 'upi'}
            />
          </>
        ) : null}

        {activeSection !== 'salary' ? (
          <>
            <input
              type="hidden"
              name="salaryInr"
              value={Math.round(employee.salaryPaise / 100)}
            />
          </>
        ) : null}
      </form>

      {activeSection === 'schedule' ? (
        <section className="mt-6 space-y-3 rounded-xl border border-[color:var(--fyh-border)] p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-fyh-text-secondary">
            Working hours
          </h2>
          <p className="text-xs text-fyh-text-secondary">
            Set start and end times for each day. Use the Off checkbox for days the employee does not
            work.
          </p>
          <WorkingHoursEditor
            employeeId={employee.id}
            employeeName={employee.fullName}
            initial={scheduleDays}
            embedded
            readOnly={!canEdit}
          />
        </section>
      ) : null}
    </div>
  );
}
