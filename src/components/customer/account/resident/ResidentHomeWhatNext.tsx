import { ApgCard } from '@/src/components/customer/design-system';

export function ResidentHomeWhatNext({ message }: { message: string }) {
  return (
    <ApgCard tier="account" className="border-l-4 border-l-[#FF5A1F] p-4">
      <h2 className="text-sm font-semibold text-zinc-900">What happens next</h2>
      <p className="mt-1 text-sm leading-relaxed text-zinc-600">{message}</p>
    </ApgCard>
  );
}
