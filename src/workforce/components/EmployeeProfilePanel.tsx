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
import {
  WORKFORCE_INCENTIVE_PLAN_TYPES,
  WORKFORCE_PAYMENT_METHODS,
  WORKFORCE_SALARY_FREQUENCIES,
  type WorkforceIncentivePlanType,
  type WorkforcePaymentMethod,
  type WorkforceSalaryFrequency,
} from '@/src/workforce/types/hr';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { formatWeekOffDays } from '@/src/workforce/lib/weekOff';
import { WeekOffPicker } from '@/src/workforce/components/WeekOffPicker';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import type { WfEmployee, WfEngineMembership, WfIncentivePlan } from '@/src/workforce/db/schema';
import type { WorkforcePermissionGrants } from '@/src/workforce/types';

const initial: WorkforceActionState = {};
const fieldClass = 'fyh-select w-full text-sm text-fyh-text';
const inputClass = '!bg-[color:var(--fyh-bg-surface)]';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-[color:var(--fyh-border)] p-4">
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
};

function incentiveConfig(plan: WfIncentivePlan | null) {
  const cfg = (plan?.config ?? {}) as Record<string, number>;
  return {
    thresholdMultiplier: cfg.thresholdMultiplier ?? 2,
    aboveThresholdPercentBps: cfg.aboveThresholdPercentBps ?? 1000,
    bonusPaise: cfg.bonusPaise ?? 0,
  };
}

export function EmployeeProfilePanel({
  employee,
  membership,
  grants,
  incentivePlan,
  weekOffDays,
  canEdit,
}: Props) {
  const formId = useId();
  const [state, action, pending] = useActionState(updateWorkforceEmployeeAction, initial);
  const [, startTransition] = useTransition();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(employee.qrCodeUrl);
  const [receiveBookings, setReceiveBookings] = useState(
    grants.permissions.includes('appointments.receive_bookings'),
  );
  const [planType, setPlanType] = useState<WorkforceIncentivePlanType>(
    incentivePlan?.planType ?? 'none',
  );

  const ic = incentiveConfig(incentivePlan);

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
        <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{state.success}</p>
      ) : null}
      {state.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      <form
        id={formId}
        action={(fd) => startTransition(() => action(fd))}
        className="space-y-6"
      >
        <input type="hidden" name="employeeId" value={employee.id} />
        <input type="hidden" name="qrCodeUrl" value={qrPreview ?? employee.qrCodeUrl ?? ''} />

        <Section title="Basic information">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Full Name</span>
              <Input
                name="fullName"
                defaultValue={employee.fullName}
                required
                disabled={!canEdit}
                className={inputClass}
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
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Phone</span>
              <Input
                name="mobile"
                defaultValue={employee.mobile ?? ''}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">New password</span>
              <Input
                name="password"
                type="password"
                minLength={6}
                placeholder="Leave blank to keep current"
                disabled={!canEdit}
                className={inputClass}
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
                className={inputClass}
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
                className={inputClass}
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
                className="h-4 w-4"
              />
              <span className="font-medium">Appointment bookable</span>
            </label>
          </div>
          {canEdit ? (
            <WeekOffPicker defaultOffDays={weekOffDays} />
          ) : (
            <p className="text-sm text-fyh-text-secondary">
              Weekly off: {formatWeekOffDays(weekOffDays)}
            </p>
          )}
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
                defaultValue={Math.round(employee.salaryPaise / 100)}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Payment Frequency</span>
              <select
                name="salaryFrequency"
                className={fieldClass}
                defaultValue={employee.salaryFrequency}
                disabled={!canEdit}
              >
                {WORKFORCE_SALARY_FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Salary Effective From</span>
              <Input
                name="salaryEffectiveFrom"
                type="date"
                defaultValue={employee.salaryEffectiveFrom ?? ''}
                disabled={!canEdit}
                className={inputClass}
              />
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
              disabled={!canEdit}
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
                <Input
                  name="incentiveBaseSalaryInr"
                  type="number"
                  min={0}
                  defaultValue={Math.round(
                    ((incentivePlan?.config as { baseSalaryPaise?: number })?.baseSalaryPaise ??
                      employee.salaryPaise) / 100,
                  )}
                  disabled={!canEdit}
                  className={inputClass}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Threshold Multiplier</span>
                <Input
                  name="thresholdMultiplier"
                  type="number"
                  min={0.1}
                  step="0.1"
                  defaultValue={ic.thresholdMultiplier}
                  disabled={!canEdit}
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
                  step="0.1"
                  defaultValue={ic.aboveThresholdPercentBps / 100}
                  disabled={!canEdit}
                  className={inputClass}
                />
              </label>
            </div>
          ) : null}
          {planType === 'fixed_bonus' ? (
            <label className="mt-3 block space-y-1 text-sm">
              <span className="font-medium">Fixed Bonus (₹)</span>
              <Input
                name="fixedBonusInr"
                type="number"
                min={0}
                defaultValue={Math.round(ic.bonusPaise / 100)}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
          ) : null}
          <label className="mt-3 block space-y-1 text-sm">
            <span className="font-medium">Effective From</span>
            <Input
              name="incentiveEffectiveFrom"
              type="date"
              defaultValue={incentivePlan?.effectiveFrom ?? ''}
              disabled={!canEdit}
              className={inputClass}
            />
          </label>
        </Section>

        <Section title="Payment details">
          <p className="text-xs text-fyh-text-secondary">Used for salary payouts only.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="font-medium">Bank Account Holder Name</span>
              <Input
                name="bankAccountHolderName"
                defaultValue={employee.bankAccountHolderName ?? ''}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Bank Name</span>
              <Input
                name="bankName"
                defaultValue={employee.bankName ?? ''}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Account Number</span>
              <Input
                name="accountNumber"
                inputMode="numeric"
                defaultValue={employee.accountNumber ?? ''}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">IFSC Code</span>
              <Input
                name="ifscCode"
                defaultValue={employee.ifscCode ?? ''}
                disabled={!canEdit}
                className={`uppercase ${inputClass}`}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">UPI ID</span>
              <Input
                name="upiId"
                defaultValue={employee.upiId ?? ''}
                disabled={!canEdit}
                className={inputClass}
              />
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

        <Section title="Permissions">
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
          ) : null}
        </Section>

        <Section title="Documents">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Aadhaar</span>
              <Input
                name="aadhaarNumber"
                defaultValue={employee.aadhaarNumber ?? ''}
                disabled={!canEdit}
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">PAN</span>
              <Input
                name="panNumber"
                defaultValue={employee.panNumber ?? ''}
                disabled={!canEdit}
                className={`uppercase ${inputClass}`}
              />
            </label>
          </div>
        </Section>

        {canEdit ? (
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
