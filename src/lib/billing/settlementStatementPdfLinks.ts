export function settlementStatementPdfDownloadHref(vacatingRequestId: string): string {
  return `/api/vacating/${vacatingRequestId}/settlement-statement/pdf`;
}

export function settlementStatementPageHref(vacatingRequestId: string): string {
  return `/admin/vacating/${vacatingRequestId}/settlement-statement`;
}

export function settlementStatementPrintHref(vacatingRequestId: string): string {
  return `/admin/vacating/${vacatingRequestId}/settlement-statement/print`;
}
