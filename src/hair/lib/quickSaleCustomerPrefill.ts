/** Map Quick Sale search text to add-customer modal defaults. */
export function inferQuickSaleCustomerPrefill(searchQ: string): {
  fullName: string;
  phone: string;
} {
  const q = searchQ.trim();
  if (!q) return { fullName: '', phone: '' };

  const compact = q.replace(/\s/g, '');
  if (/^cl\d+$/i.test(compact)) {
    return { fullName: q, phone: '' };
  }

  const digits = q.replace(/\D/g, '');
  const digitRatio = digits.length / q.length;

  if (digits.length >= 6 || (digits.length >= 3 && digitRatio >= 0.55)) {
    const phone = digits.length > 10 ? digits.slice(-10) : digits;
    return { fullName: '', phone };
  }

  return { fullName: q, phone: '' };
}
