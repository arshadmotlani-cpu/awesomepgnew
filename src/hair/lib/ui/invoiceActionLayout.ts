/** Phone widths use a viewport sheet so invoice actions are not clipped by tables or cards. */
export const INVOICE_ACTION_SHEET_MAX_WIDTH_PX = 767;

export function invoiceActionsUseSheet(viewportWidth: number): boolean {
  return viewportWidth <= INVOICE_ACTION_SHEET_MAX_WIDTH_PX;
}
