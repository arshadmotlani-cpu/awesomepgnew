import type { Metadata } from 'next';
import Link from 'next/link';
import { DocumentUploadForm } from '@/src/capital/components/forms/DocumentUploadForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { Badge } from '@/src/capital/components/ui/badge';
import { listDocuments } from '@/src/capital/services/documents';
import { listAssets } from '@/src/capital/services/assets';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage() {
  const [docs, assets] = await Promise.all([listDocuments(), listAssets()]);
  const assetOptions = assets.map(({ asset, auto }) => ({
    id: asset.id,
    label: auto.registrationNumber
      ? `${auto.registrationNumber} — ${asset.displayName}`
      : asset.displayName,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-ac-text-secondary">Uploaded files and invoices</p>
      </div>

      <DocumentUploadForm assets={assetOptions} />

      <Card>
        <CardHeader>
          <CardTitle>Document library</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-ac-text-muted">
                <th className="pb-3 pr-4 font-medium">File</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Asset</th>
                <th className="pb-3 pr-4 font-medium">Size</th>
                <th className="pb-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-white/5">
                  <td className="py-3 pr-4 font-medium">{d.fileName}</td>
                  <td className="py-3 pr-4">
                    <Badge variant="secondary">{d.documentType}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    {d.assetId ? (
                      <Link href={`/assets/${d.assetId}`} className="text-ac-accent hover:underline">
                        View asset
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 pr-4 text-ac-text-secondary">
                    {(d.fileSizeBytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="py-3">
                    <Link href={`/api/capital/files/${d.id}`} className="text-ac-accent hover:underline">
                      Download
                    </Link>
                  </td>
                </tr>
              ))}
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-ac-text-muted">
                    No documents uploaded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
