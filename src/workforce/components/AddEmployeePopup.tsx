'use client';

import { useActionState, useEffect, useId, useState, useTransition } from 'react';
import {
  createWorkforceEmployeeAction,
  type WorkforceActionState,
} from '@/src/workforce/actions/employees';
import { WORKFORCE_ACCESS_ROLES, WORKFORCE_PERMISSION_KEYS } from '@/src/workforce/types';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

const initial: WorkforceActionState = {};

const PERMISSION_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: 'Dashboard',
    keys: [
      'dashboard.view_revenue',
      'dashboard.view_expenses',
      'dashboard.view_staff',
      'dashboard.view_customers',
    ],
  },
  {
    title: 'Appointments',
    keys: [
      'appointments.view_own',
      'appointments.view_all',
      'appointments.edit',
    ],
  },
  {
    title: 'Billing',
    keys: ['billing.create_invoice', 'billing.edit_invoice', 'billing.backdate_invoice'],
  },
  {
    title: 'Inventory',
    keys: ['inventory.view', 'inventory.edit'],
  },
  {
    title: 'Finance',
    keys: ['finance.view_salary', 'finance.view_profit', 'finance.view_expenses'],
  },
  {
    title: 'Reports',
    keys: ['reports.view', 'reports.export'],
  },
  {
    title: 'Staff',
    keys: ['staff.view', 'staff.edit', 'staff.add'],
  },
  {
    title: 'Settings',
    keys: ['settings.manage'],
  },
];

const fieldClass =
  'fyh-select w-full text-sm text-fyh-text';

const inputClass = '!bg-[color:var(--fyh-bg-surface)]';

/**
 * Add Employee popup — Workforce v1 product form.
 */
export function AddEmployeePopup() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [receiveBookings, setReceiveBookings] = useState(true);
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [state, action, pending] = useActionState(createWorkforceEmployeeAction, initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      setQrPreview(null);
      setReceiveBookings(true);
      setLoginEnabled(false);
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
              className="fyh-form-modal-panel pointer-events-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 id={titleId} className="text-lg font-semibold text-fyh-text">
                      Add employee
                    </h2>
                    <p className="text-xs text-fyh-text-secondary">
                      Workforce profile — email or phone + password when login is enabled.
                    </p>
                  </div>
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
                  startTransition(() => {
                    action(fd);
                  });
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="font-medium">Full Name</span>
                      <Input name="fullName" required autoFocus className={inputClass} />
                    </label>
                    <label className="space-y-1 text-sm">
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
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Phone Number</span>
                      <Input
                        name="mobile"
                        placeholder="9876543210"
                        inputMode="tel"
                        className={inputClass}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Access Role</span>
                      <select name="accessRole" className={fieldClass} defaultValue="stylist">
                        {WORKFORCE_ACCESS_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {workforceAccessRoleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-3 sm:col-span-2 rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] px-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        name="loginEnabled"
                        value="1"
                        checked={loginEnabled}
                        onChange={(e) => setLoginEnabled(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span>
                        <span className="font-medium">Login enabled</span>
                        <span className="block text-xs text-fyh-text-secondary">
                          Employee can sign in with email or phone + password
                        </span>
                      </span>
                    </label>
                    {loginEnabled ? (
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="font-medium">Password</span>
                        <Input
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          minLength={6}
                          required
                          className={inputClass}
                        />
                      </label>
                    ) : (
                      <input type="hidden" name="password" value="" />
                    )}
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
                      <span className="font-medium">Emergency Contact</span>
                      <Input name="emergencyContact" placeholder="Name / phone" className={inputClass} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Joining Date</span>
                      <Input name="joiningDate" type="date" className={inputClass} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">Salary</span>
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
                      <span className="font-medium">Aadhaar</span>
                      <Input name="aadhaarNumber" inputMode="numeric" className={inputClass} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">PAN</span>
                      <Input name="panNumber" className={`uppercase ${inputClass}`} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-medium">UPI ID</span>
                      <Input name="upiId" placeholder="name@upi" className={inputClass} />
                    </label>
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
                            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                            setQrPreview(dataUrl);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <input type="hidden" name="qrCodeUrl" value={qrPreview ?? ''} />
                      {qrPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={qrPreview}
                          alt="QR preview"
                          className="mt-2 h-24 w-24 rounded-md border object-contain"
                        />
                      ) : (
                        <p className="mt-1 text-xs text-fyh-text-secondary">
                          Upload QR image (stored on profile)
                        </p>
                      )}
                    </label>
                    <label className="flex items-center gap-3 sm:col-span-2 rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] px-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        name="receiveBookings"
                        value="1"
                        checked={receiveBookings}
                        onChange={(e) => setReceiveBookings(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span>
                        <span className="font-medium">Appointment bookable</span>
                        <span className="block text-xs text-fyh-text-secondary">
                          Can receive salon appointments on the calendar
                        </span>
                      </span>
                    </label>
                  </div>

                  <details className="rounded-lg border border-[color:var(--fyh-border)] bg-[color:var(--fyh-bg-surface)] p-3">
                    <summary className="cursor-pointer text-sm font-medium text-fyh-text">
                      Permission matrix (optional overrides)
                    </summary>
                    <p className="mt-2 text-xs text-fyh-text-secondary">
                      Leave unchecked to use access role defaults ({WORKFORCE_PERMISSION_KEYS.length}{' '}
                      keys). Bookable is controlled by the toggle above.
                    </p>
                    <div className="mt-3 space-y-3">
                      {PERMISSION_GROUPS.map((g) => (
                        <fieldset key={g.title} className="rounded-md border p-2">
                          <legend className="px-1 text-xs font-medium">{g.title}</legend>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {g.keys.map((key) => (
                              <label key={key} className="flex items-center gap-2 text-xs">
                                <input type="checkbox" name="permissions" value={key} />
                                <span>{key.split('.').slice(1).join(' ')}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                    </div>
                  </details>

                  {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
                </div>

                <div className="shrink-0 border-t border-[color:var(--fyh-border-strong)] bg-[color:var(--fyh-bg-surface)] px-5 py-4">
                  <div className="flex flex-wrap justify-end gap-2">
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
