/** Quick Sale full-screen invoice viewer — compact sheet scales inside pane (no page scroll). */
export const QS_INVOICE_VIEWER_SCREEN_STYLES = `
.qs-invoice-viewer-preview.fyh-invoice-preview-viewport {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  align-items: center;
  justify-content: center;
  padding: 4px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview {
  width: 100mm;
  min-width: 100mm;
  max-width: 100mm;
  min-height: 0;
  margin: 0 auto;
  padding: 6mm 7mm 5mm;
  box-shadow: 0 8px 28px rgba(26, 20, 16, 0.12);
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-brand-logo {
  max-width: 140px;
  max-height: 56px;
  margin-bottom: 6px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-legal-name {
  font-size: 13px;
  margin-bottom: 0;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-doc-title {
  font-size: 18px;
  margin-bottom: 8px;
  letter-spacing: 0.08em;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-hero {
  margin-bottom: 12px;
  padding-bottom: 10px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-meta {
  margin-bottom: 12px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-meta-block h2 {
  margin-bottom: 4px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-meta-block .highlight {
  font-size: 14px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-table-wrap {
  margin-bottom: 12px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-table {
  font-size: 11px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-table thead th {
  padding: 6px 4px;
  font-size: 9px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-table tbody td {
  padding: 6px 4px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-table tbody td.service {
  min-width: 0;
  max-width: 42mm;
  word-break: break-word;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-totals {
  font-size: 12px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-totals-row.grand {
  font-size: 15px;
  margin-top: 6px;
  padding-top: 8px;
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-footer--compact {
  padding-top: 10px;
  border-top: 1px solid var(--fyh-border);
}
.qs-invoice-viewer-preview .fyh-invoice-sheet--qs-preview .fyh-invoice-thanks {
  font-size: 12px;
  margin: 0;
}
.qs-invoice-viewer-preview .fyh-invoice-id-grid--compact {
  margin-bottom: 8px;
}
.qs-invoice-viewer-preview .fyh-invoice-id-grid--compact .fyh-invoice-id-row {
  font-size: 11px;
}
.qs-invoice-viewer-preview .fyh-invoice-id-grid--compact .value {
  font-size: 12px;
  min-width: auto;
}
`;

/** Screen layout overrides when embedding the public invoice sheet in a modal. */
export const FYH_INVOICE_MODAL_SCREEN_STYLES = `
.fyh-invoice-preview-viewport {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 8px 16px;
}
.fyh-invoice-preview-measure {
  display: flex;
  justify-content: center;
}
.fyh-invoice-modal-scroll:not(.fyh-invoice-preview-viewport),
.qs-success-invoice-scroll:not(.fyh-invoice-preview-viewport) {
  overflow: auto;
  max-height: calc(92vh - 3.5rem);
  padding: 16px 0 24px;
}
.fyh-invoice-modal-panel .fyh-invoice-sheet:not(.fyh-invoice-sheet--qs-preview),
.fyh-invoice-preview-viewport .fyh-invoice-sheet:not(.fyh-invoice-sheet--qs-preview),
.qs-success-invoice-scroll .fyh-invoice-sheet:not(.fyh-invoice-sheet--qs-preview) {
  width: 210mm;
  min-width: 210mm;
  max-width: 210mm;
  margin: 0 auto;
}
`;

/** Print only the invoice sheet — hide chrome and action panels. */
export const FYH_INVOICE_MODAL_PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  .fyh-invoice-modal-root,
  .fyh-invoice-modal-root *,
  .qs-invoice-viewer-root,
  .qs-invoice-viewer-root * { visibility: visible !important; }
  .fyh-invoice-modal-backdrop,
  .fyh-invoice-modal-panel > .fyh-invoice-body > .fyh-invoice-page > .fyh-invoice-toolbar,
  .qs-invoice-viewer-header,
  .qs-invoice-viewer-toolbar,
  .qs-invoice-viewer-close {
    display: none !important;
  }
  .fyh-invoice-modal-root,
  .qs-invoice-viewer-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .fyh-invoice-modal-panel,
  .qs-invoice-viewer-main {
    max-width: none !important;
    width: 100% !important;
    box-shadow: none !important;
    border: none !important;
  }
  .fyh-invoice-modal-scroll,
  .qs-invoice-viewer-sheet-wrap {
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    background: #fff !important;
  }
}
`;
