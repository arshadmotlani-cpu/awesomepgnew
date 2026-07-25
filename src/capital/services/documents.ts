import { capitalDb } from '@/src/capital/db/client';
import { acAssets, acDocuments, acVehicleActivities } from '@/src/capital/db/schema';
import { uploadPrivate } from '@/src/lib/storage/blob';
import { logActivity } from './activity';
import { and, eq } from 'drizzle-orm';

export type UploadDocumentInput = {
  assetId?: string;
  expenseId?: string;
  paymentId?: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  fileBytes: Buffer;
  notes?: string;
  isCover?: boolean;
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

  const isPhoto = input.documentType === 'photo' || input.mimeType.startsWith('image/');

  return capitalDb.transaction(async (tx) => {
    let makeCover = Boolean(input.isCover);
    if (!makeCover && isPhoto && input.assetId) {
      const [asset] = await tx
        .select({ coverDocumentId: acAssets.coverDocumentId })
        .from(acAssets)
        .where(eq(acAssets.id, input.assetId))
        .limit(1);
      makeCover = !asset?.coverDocumentId;
    }

    if (makeCover && input.assetId) {
      await tx
        .update(acDocuments)
        .set({ isCover: false })
        .where(and(eq(acDocuments.assetId, input.assetId), eq(acDocuments.isCover, true)));
    }

    const [doc] = await tx
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
        isCover: makeCover && Boolean(input.assetId),
      })
      .returning();

    if (makeCover && input.assetId) {
      await tx
        .update(acAssets)
        .set({ coverDocumentId: doc.id, updatedAt: new Date() })
        .where(eq(acAssets.id, input.assetId));
    }

    if (isPhoto && input.assetId) {
      await tx.insert(acVehicleActivities).values({
        assetId: input.assetId,
        activityType: 'photo_upload',
        activityAt: new Date().toISOString().slice(0, 10),
        title: 'Photo Upload',
        notes: input.fileName,
        documentId: doc.id,
        metadata: { documentId: doc.id },
      });
    }

    await logActivity(
      {
        action: 'document_uploaded',
        entityType: 'document',
        entityId: doc.id,
        afterState: { fileName: input.fileName, documentType: input.documentType },
      },
      tx,
    );

    return doc;
  });
}

export async function setAssetCoverPhoto(assetId: string, documentId: string) {
  return capitalDb.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(acDocuments)
      .where(and(eq(acDocuments.id, documentId), eq(acDocuments.assetId, assetId)))
      .limit(1);
    if (!doc) throw new Error('Document not found for this asset');

    await tx
      .update(acDocuments)
      .set({ isCover: false })
      .where(and(eq(acDocuments.assetId, assetId), eq(acDocuments.isCover, true)));

    await tx.update(acDocuments).set({ isCover: true }).where(eq(acDocuments.id, documentId));

    await tx
      .update(acAssets)
      .set({ coverDocumentId: documentId, updatedAt: new Date() })
      .where(eq(acAssets.id, assetId));
  });
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
