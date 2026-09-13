/** Screen layout overrides when embedding the public invoice sheet in a modal. */
export const FYH_INVOICE_MODAL_SCREEN_STYLES = `
.fyh-invoice-preview-viewport {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12px 8px 16px;
  -webkit-overflow-scrolling: touch;
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
.fyh-invoice-modal-panel .fyh-invoice-sheet,
.fyh-invoice-preview-viewport .fyh-invoice-sheet,
.qs-success-invoice-scroll .fyh-invoice-sheet {
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
  .qs-success-root,
  .qs-success-root * { visibility: visible !important; }
  .fyh-invoice-modal-backdrop,
  .fyh-invoice-modal-panel > .fyh-invoice-body > .fyh-invoice-page > .fyh-invoice-toolbar,
  .qs-success-backdrop,
  .qs-success-header,
  .qs-success-actions,
  .qs-success-close {
    display: none !important;
  }
  .fyh-invoice-modal-root,
  .qs-success-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .fyh-invoice-modal-panel,
  .qs-success-panel {
    max-width: none !important;
    width: 100% !important;
    box-shadow: none !important;
    border: none !important;
  }
  .fyh-invoice-modal-scroll,
  .qs-success-invoice-scroll {
    max-height: none !important;
    overflow: visible !important;
    padding: 0 !important;
    background: #fff !important;
  }
  .qs-success-body {
    display: block !important;
  }
}
`;
