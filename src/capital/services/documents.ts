import { capitalDb } from '@/src/capital/db/client';
import { acDocuments } from '@/src/capital/db/schema';
import { uploadPrivate } from '@/src/lib/storage/blob';
import { logActivity } from './activity';
import { eq } from 'drizzle-orm';

export type UploadDocumentInput = {
  assetId?: string;
  expenseId?: string;
  paymentId?: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  fileBytes: Buffer;
  notes?: string;
};

export async function uploadDocument(input: UploadDocumentInput) {
  const path = `capital/documents/${input.assetId ?? 'general'}/${input.documentType}/${Date.now()}-${input.fileName}`;

  let blobPath = path;
  try {
    const stored = await uploadPrivate(path, input.fileBytes, input.mimeType);
    blobPath = stored.pathname;
  } catch {
    // Fallback for dev without blob configured
    blobPath = path;
  }

  const [doc] = await capitalDb
    .insert(acDocuments)
    .values({
      assetId: input.assetId ?? null,
      expenseId: input.expenseId ?? null,
      paymentId: input.paymentId ?? null,
      documentType: input.documentType as typeof acDocuments.$inferInsert.documentType,
      fileName: input.fileName,
      blobPath,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileBytes.length,
      notes: input.notes,
    })
    .returning();

  await logActivity({
    action: 'document_uploaded',
    entityType: 'document',
    entityId: doc.id,
    afterState: { fileName: input.fileName, documentType: input.documentType },
  });

  return doc;
}

export async function listDocuments(assetId?: string) {
  if (assetId) {
    return capitalDb.select().from(acDocuments).where(eq(acDocuments.assetId, assetId));
  }
  return capitalDb.select().from(acDocuments);
}

export async function getDocument(id: string) {
  const [doc] = await capitalDb.select().from(acDocuments).where(eq(acDocuments.id, id)).limit(1);
  return doc ?? null;
}
