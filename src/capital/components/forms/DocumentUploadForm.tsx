'use client';

import { useState, useTransition } from 'react';
import { uploadDocumentAction, type ActionState } from '@/src/capital/actions/settings';
import { Button } from '@/src/capital/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/capital/components/ui/card';
import { CapitalDocumentFileInput } from '@/src/capital/components/ui/document-file-input';
import { Textarea } from '@/src/capital/components/ui/textarea';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';
import { documentTypeEnum } from '@/src/capital/db/schema/enums';

type AssetOption = { id: string; label: string };

export function DocumentUploadForm({
  assets,
  defaultAssetId,
}: {
  assets: AssetOption[];
  defaultAssetId?: string;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadDocumentAction(state, fd);
      if (result.error) {
        setState({ error: result.error });
        showToast(result.error);
      } else {
        setState({ success: result.success });
        showToast('Document uploaded');
        e.currentTarget.reset();
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload document</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="assetId" className="mb-1 block text-sm text-ac-text-secondary">
              Asset
            </label>
            <select
              id="assetId"
              name="assetId"
              defaultValue={defaultAssetId ?? ''}
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
            >
              <option value="">General</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="documentType" className="mb-1 block text-sm text-ac-text-secondary">
              Document type *
            </label>
            <select
              id="documentType"
              name="documentType"
              required
              defaultValue="other"
              className="flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm"
            >
              {documentTypeEnum.enumValues.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="file" className="mb-1 block text-sm text-ac-text-secondary">
              File *
            </label>
            <CapitalDocumentFileInput id="file" name="file" required />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="notes" className="mb-1 block text-sm text-ac-text-secondary">
              Notes
            </label>
            <Textarea id="notes" name="notes" />
          </div>
          {state.error ? <p className="text-sm text-ac-danger md:col-span-2">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-ac-success md:col-span-2">{state.success}</p> : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
