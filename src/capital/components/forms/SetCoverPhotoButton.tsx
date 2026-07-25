'use client';

import { useTransition } from 'react';
import { setCoverPhotoAction } from '@/src/capital/actions/documents';
import { Button } from '@/src/capital/components/ui/button';
import { useCapitalToast } from '@/src/capital/components/CapitalToastProvider';

export function SetCoverPhotoButton({
  assetId,
  documentId,
}: {
  assetId: string;
  documentId: string;
}) {
  const [pending, startTransition] = useTransition();
  const { showToast } = useCapitalToast();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await setCoverPhotoAction(assetId, documentId);
          if (result.error) showToast(result.error);
          else showToast('Cover photo set');
        });
      }}
    >
      Set cover
    </Button>
  );
}
