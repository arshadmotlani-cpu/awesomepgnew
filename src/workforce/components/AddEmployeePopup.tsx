'use client';

import { useActionState, useEffect, useId, useState, useTransition } from 'react';
import {
  createWorkforceEmployeeAction,
  type WorkforceActionState,
} from '@/src/workforce/actions/employees';
import { WORKFORCE_ACCESS_ROLES } from '@/src/workforce/types';
import { workforceAccessRoleLabel } from '@/src/workforce/labels';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';

const initial: WorkforceActionState = {};

const fieldClass = 'fyh-select w-full text-sm text-fyh-text';

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
 * Add Employee — basic identity and work info only.
 * Salary, credentials, and permissions are configured on the employee profile.
 */
export function AddEmployeePopup() {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [receiveBookings, setReceiveBookings] = useState(true);
  const [state, action, pending] = useActionState(createWorkforceEmployeeAction, initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      setReceiveBookings(true);
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
                <p className="mt-1 text-sm text-fyh-text-secondary">
                  Create the employee record. Configure salary, credentials, permissions and schedule
                  from their profile.
                </p>
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
                        <span className="fyh-form-label">Full Name</span>
                        <Input name="fullName" required autoFocus />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="fyh-form-label">Email Address</span>
                        <Input
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          placeholder="name@example.com"
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="fyh-form-label">Phone Number</span>
                        <Input name="mobile" placeholder="9876543210" inputMode="tel" />
                      </label>
                      <label className="block space-y-1 text-sm">
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
                      <label className="block space-y-1 text-sm">
                        <span className="fyh-form-label">Access Role</span>
                        <select name="accessRole" className={fieldClass} defaultValue="staff">
                          {WORKFORCE_ACCESS_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {workforceAccessRoleLabel(r)}
                            </option>
                          ))}
                        </select>
                        <span className="fyh-form-helper">
                          Default permissions apply from the role. Override on the profile if
                          needed.
                        </span>
                      </label>
                    </div>
                  </Section>

                  <Section title="Personal information">
                    <div className="grid gap-3 sm:grid-cols-2">
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
                        <span className="fyh-form-label">Joining Date</span>
                        <Input name="joiningDate" type="date" required />
                      </label>
                      <label className="space-y-1 text-sm sm:col-span-2">
                        <span className="fyh-form-label">Emergency Contact</span>
                        <Input name="emergencyContact" placeholder="Name / phone" />
                      </label>
                    </div>
                  </Section>

                  <Section title="Employment">
                    <label className="flex items-center gap-3 text-sm">
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
                  </Section>

                  {state.error ? <p className="fyh-alert-danger text-sm">{state.error}</p> : null}
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
