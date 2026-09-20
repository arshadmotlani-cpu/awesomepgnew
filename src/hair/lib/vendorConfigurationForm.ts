export type VendorFormFieldKey =
  | 'name'
  | 'contactName'
  | 'phone'
  | 'email'
  | 'address'
  | 'brandNames'
  | 'bankAccountHolderName'
  | 'bankName'
  | 'bankAccountNumber'
  | 'bankIfsc'
  | 'upiId';

export type VendorFormValues = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  brandNames: string[];
  bankAccountHolderName: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  upiId: string;
  isActive: boolean;
  qrCodeStoredUrl: string;
};

export function emptyVendorFormValues(): VendorFormValues {
  return {
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    brandNames: [],
    bankAccountHolderName: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    upiId: '',
    isActive: true,
    qrCodeStoredUrl: '',
  };
}

function formStr(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

export function parseBrandNamesJson(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export function vendorFormValuesFromFormData(formData: FormData): VendorFormValues {
  return {
    name: formStr(formData, 'name'),
    contactName: formStr(formData, 'contactName'),
    phone: formStr(formData, 'phone'),
    email: formStr(formData, 'email'),
    address: formStr(formData, 'address'),
    brandNames: parseBrandNamesJson(formStr(formData, 'brandNamesJson')),
    bankAccountHolderName: formStr(formData, 'bankAccountHolderName'),
    bankName: formStr(formData, 'bankName'),
    bankAccountNumber: formStr(formData, 'bankAccountNumber'),
    bankIfsc: formStr(formData, 'bankIfsc'),
    upiId: formStr(formData, 'upiId'),
    isActive: formData.get('isActive') !== 'false',
    qrCodeStoredUrl: formStr(formData, 'qrCodeStoredUrl'),
  };
}

export function validateVendorFormValues(
  values: VendorFormValues,
): { ok: true; values: VendorFormValues } | { ok: false; fieldErrors: Partial<Record<VendorFormFieldKey, string>>; values: VendorFormValues } {
  const fieldErrors: Partial<Record<VendorFormFieldKey, string>> = {};
  if (!values.name.trim()) fieldErrors.name = 'Vendor name is required';
  if (!values.phone.trim()) fieldErrors.phone = 'Phone number is required';
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    fieldErrors.email = 'Enter a valid email address';
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, values };
  }
  return { ok: true, values };
}
