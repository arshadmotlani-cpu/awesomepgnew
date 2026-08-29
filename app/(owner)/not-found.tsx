import { OwnerOsMark } from '@/src/components/brand/owner-os/OwnerOsMark';

export default function OwnerNotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <div>
        <div className="mb-4 flex justify-center">
          <OwnerOsMark size={48} className="max-w-full" title="NET WORTH" />
        </div>
        <h1 className="text-xl font-semibold text-white">Not found</h1>
        <p className="mt-2 text-sm text-[color:var(--oo-muted)]">This page could not be found.</p>
      </div>
    </div>
  );
}
