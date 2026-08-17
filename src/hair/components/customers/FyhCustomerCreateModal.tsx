'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  createSalonCustomerFromForm,
  type SalonCustomerCreateContext,
} from '@/src/hair/actions/quickSaleCustomer';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import { Label } from '@/src/hair/components/ui/label';
import { Select } from '@/src/hair/components/ui/select';
import { Textarea } from '@/src/hair/components/ui/textarea';
import { FyhDatePicker } from '@/src/hair/components/ui/FyhDatePicker';
import type { PosCustomerHit } from '@/src/hair/services/quickSale';

export type FyhCustomerCreatePrefill = {
  fullName: string;
  phone: string;
};

type Props = {
  open: boolean;
  prefill: FyhCustomerCreatePrefill;
  context?: SalonCustomerCreateContext;
  onClose: () => void;
  onCreated: (customer: PosCustomerHit) => void;
};

export function FyhCustomerCreateModal({
  open,
  prefill,
  context = 'quick_sale',
  onClose,
  onCreated,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dob, setDob] = useState('');

  if (!open) return null;

  return (
    <div className="fyh-form-modal-backdrop fixed inset-0 z-[70] flex items-center justify-center p-4">
      <form
        className="fyh-form-modal-panel w-full max-w-md space-y-3 rounded-[var(--fyh-radius-lg)] p-[var(--fyh-modal-padding)]"
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setSaving(true);
            setError(null);
            try {
              const fd = new FormData(e.currentTarget);
              if (dob) fd.set('dateOfBirth', dob);
              fd.set('context', context);
              const res = await createSalonCustomerFromForm(fd);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              onCreated({
                id: res.customer.id,
                fullName: res.customer.fullName,
                customerCode: res.customer.customerCode,
                phone: res.customer.phone,
                walletBalancePaise: 0,
              });
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not create customer');
            } finally {
              setSaving(false);
            }
          })();
        }}
      >
        <h2 className="fyh-modal-title">Create customer</h2>
        <p className="text-xs text-fyh-text-secondary">Add a new client to the salon CRM.</p>

        <div className="space-y-1.5">
          <Label htmlFor="fyh-create-phone">Mobile number</Label>
          <Input
            id="fyh-create-phone"
            name="phone"
            required
            type="tel"
            defaultValue={prefill.phone}
            placeholder="10-digit mobile"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fyh-create-name">Full name</Label>
          <Input
            id="fyh-create-name"
            name="fullName"
            required
            defaultValue={prefill.fullName}
            placeholder="Customer name"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fyh-create-email">Email</Label>
            <Input id="fyh-create-email" name="email" type="email" placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <FyhDatePicker value={dob} onChange={setDob} placeholder="Optional" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fyh-create-gender">Gender</Label>
          <Select id="fyh-create-gender" name="gender" defaultValue="female">
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fyh-create-notes">Notes</Label>
          <Textarea id="fyh-create-notes" name="notes" rows={2} placeholder="Optional" />
        </div>

        {error ? <p className="text-sm text-fyh-danger">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Saving…' : 'Save customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/** Inline + button beside customer search */
export function FyhCustomerCreateButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`fyh-btn-icon shrink-0 ${className ?? ''}`}
      onClick={onClick}
      aria-label="Create new customer"
    >
      <Plus className="h-4 w-4" />
    </button>
  );
}
