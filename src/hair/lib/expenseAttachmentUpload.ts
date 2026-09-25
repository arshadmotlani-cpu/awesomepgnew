import {
  isAllowedVendorAttachmentMime,
  uploadVendorAttachment,
  vendorAttachmentExtension,
} from '@/src/hair/lib/vendorAttachmentUpload';

export {
  isAllowedVendorAttachmentMime as isAllowedExpenseAttachmentMime,
  vendorAttachmentExtension as expenseAttachmentExtension,
};

export async function uploadExpenseAttachment(
  file: File,
  expenseId: string,
): Promise<{ url: string; contentType: string }> {
  return uploadVendorAttachment(file, 'expense-receipts', expenseId);
}
