export function vendorStatementPdfHref(vendorId: string, from: string, to: string): string {
  const params = new URLSearchParams({ from, to });
  return `/api/hair/vendors/${vendorId}/statement/pdf?${params.toString()}`;
}
