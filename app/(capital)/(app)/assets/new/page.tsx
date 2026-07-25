import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateAssetForm } from '@/src/capital/components/forms/CreateAssetForm';
import { Button } from '@/src/capital/components/ui/button';

export const metadata: Metadata = { title: 'New Vehicle' };

export default function NewAssetPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New vehicle</h1>
          <p className="text-sm text-ac-text-secondary">Add a vehicle to inventory</p>
        </div>
        <Link href="/assets">
          <Button variant="ghost">Back to vehicles</Button>
        </Link>
      </div>
      <CreateAssetForm />
    </div>
  );
}
