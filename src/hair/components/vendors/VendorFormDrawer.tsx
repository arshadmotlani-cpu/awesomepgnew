'use client';

import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import {
  createVendorMasterAction,
  type VendorMasterActionState,
} from '@/src/hair/actions/vendors';
import { Button } from '@/src/hair/components/ui/button';
import { Input } from '@/src/hair/components/ui/input';
import {
  emptyVendorFormValues,
  validateVendorFormValues,
  type VendorFormFieldKey,
  type VendorFormValues,
} from '@/src/hair/lib/vendorConfigurationForm';

const initialState: VendorMasterActionState = {};
const fieldClass =
  'fyh-input w-full text-[0.8125rem] outline-none focus:border-fyh-accent/50';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[0.7rem] text-fyh-danger" role="alert">{message}</p>;
}

function BrandNamesEditor({
  names,
  onChange,
  fieldError,
}: {
  names: string[];
  onChange: (names: string[]) => void;
  fieldError?: string;
}) {
  const rows = names.length ? names : [''];
  return (
    <div className="space-y-2">
      {rows.map((name, idx) => (
        <div key={idx} className="flex gap-2">
          <Input
            value={name}
            placeholder="Brand name"
            data-vendor-field="brandNames"
            onChange={(e) => {
              const next = [...rows];
              next[idx] = e.target.value;
              onChange(next.map((n) => n.trim()).filter(Boolean));
            }}
          />
          {rows.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Remove brand"
              onClick={() => onChange(rows.filter((_, i) => i !== idx).map((n) => n.trim()).filter(Boolean))}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...rows.filter(Boolean), ''])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add brand
      </Button>
      <FieldError message={fieldError} />
    </div>
  );
}

export function VendorFormDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (vendor: { id: string; name: string }) => void;
}) {
  const [state, formAction, pending] = useActionState(createVendorMasterAction, initialState);
  const [values, setValues] = useState<VendorFormValues>(emptyVendorFormValues());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<VendorFormFieldKey, string>>>({});
  const wasOpenRef = useRef(false);
  const brandNamesJson = useMemo(() => JSON.stringify(values.brandNames), [values.brandNames]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setValues(emptyVendorFormValues());
      setFieldErrors({});
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (state.values && !state.success) setValues(state.values);
    if (state.fieldErrors) setFieldErrors(state.fieldErrors);
    else if (state.error && !state.success) setFieldErrors({});
  }, [state.values, state.fieldErrors, state.error, state.success]);

  useEffect(() => {
    if (state.success && state.vendor) {
      onCreated(state.vendor);
      onClose();
      setValues(emptyVendorFormValues());
      setFieldErrors({});
    }
  }, [state.success, state.vendor, onClose, onCreated]);

  const patch = (partial: Partial<VendorFormValues>) => {
    setValues((v) => ({ ...v, ...partial }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    const validated = validateVendorFormValues(values);
    if (!validated.ok) {
      e.preventDefault();
      setFieldErrors(validated.fieldErrors);
      return;
    }
    setFieldErrors({});
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add vendor"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden border border-[color:var(--fyh-border)] bg-fyh-elevated shadow-2xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--fyh-border)] px-4 py-3">
          <h2 className="fyh-display text-lg font-semibold">Add vendor</h2>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form
          id="vendor-master-form"
          action={formAction}
          onSubmit={handleSubmit}
          encType="multipart/form-data"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          <input type="hidden" name="brandNamesJson" value={brandNamesJson} />
          <input type="hidden" name="isActive" value={values.isActive ? 'true' : 'false'} />
          <input type="hidden" name="qrCodeStoredUrl" value={values.qrCodeStoredUrl} />

          <div className="space-y-1">
            <label className="fyh-label text-xs" htmlFor="vendor-name">Vendor name *</label>
            <Input
              id="vendor-name"
              name="name"
              required
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              data-vendor-field="name"
            />
            <FieldError message={fieldErrors.name} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="fyh-label text-xs" htmlFor="vendor-contact">Contact person</label>
              <Input
                id="vendor-contact"
                name="contactName"
                value={values.contactName}
                onChange={(e) => patch({ contactName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="fyh-label text-xs" htmlFor="vendor-phone">Phone *</label>
              <Input
                id="vendor-phone"
                name="phone"
                required
                value={values.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                data-vendor-field="phone"
              />
              <FieldError message={fieldErrors.phone} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="fyh-label text-xs" htmlFor="vendor-email">Email</label>
              <Input
                id="vendor-email"
                name="email"
                type="email"
                value={values.email}
                onChange={(e) => patch({ email: e.target.value })}
              />
              <FieldError message={fieldErrors.email} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="fyh-label text-xs" htmlFor="vendor-address">Address</label>
              <Input
                id="vendor-address"
                name="address"
                value={values.address}
                onChange={(e) => patch({ address: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="fyh-label text-xs">Brands supplied</span>
            <BrandNamesEditor
              names={values.brandNames.length ? values.brandNames : ['']}
              onChange={(brandNames) => patch({ brandNames })}
              fieldError={fieldErrors.brandNames}
            />
          </div>

          <fieldset className="space-y-2 rounded-lg border border-[color:var(--fyh-border)] p-3">
            <legend className="px-1 text-xs font-medium text-fyh-text-muted">Payment details</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                name="bankAccountHolderName"
                placeholder="Account holder name"
                value={values.bankAccountHolderName}
                onChange={(e) => patch({ bankAccountHolderName: e.target.value })}
              />
              <Input
                name="bankName"
                placeholder="Bank name"
                value={values.bankName}
                onChange={(e) => patch({ bankName: e.target.value })}
              />
              <Input
                name="bankAccountNumber"
                placeholder="Account number"
                value={values.bankAccountNumber}
                onChange={(e) => patch({ bankAccountNumber: e.target.value })}
              />
              <Input
                name="bankIfsc"
                placeholder="IFSC"
                value={values.bankIfsc}
                onChange={(e) => patch({ bankIfsc: e.target.value })}
              />
              <Input
                name="upiId"
                placeholder="UPI ID"
                value={values.upiId}
                onChange={(e) => patch({ upiId: e.target.value })}
                className="sm:col-span-2"
              />
              <div className="sm:col-span-2 space-y-1">
                <label className="fyh-label text-xs" htmlFor="qrCodeFile">QR code (image)</label>
                <Input id="qrCodeFile" name="qrCodeFile" type="file" accept="image/*" />
              </div>
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={(e) => patch({ isActive: e.target.checked })}
            />
            Active vendor
          </label>

          {state.error && !state.success ? (
            <p className="text-sm text-fyh-danger">{state.error}</p>
          ) : null}
        </form>
        <div className="flex shrink-0 justify-end gap-2 border-t border-[color:var(--fyh-border)] px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="vendor-master-form" disabled={pending}>
            {pending ? 'Saving…' : 'Create vendor'}
          </Button>
        </div>
      </div>
    </div>
  );
}
