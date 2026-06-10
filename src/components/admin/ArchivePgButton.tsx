import { archivePgFormAction } from '@/app/(admin)/admin/pgs/actions';

export function ArchivePgButton({ pgId }: { pgId: string }) {
  return (
    <form action={archivePgFormAction}>
      <input type="hidden" name="pgId" value={pgId} />
      <button
        type="submit"
        className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm text-rose-400 hover:bg-rose-500/10"
      >
        Archive PG
      </button>
    </form>
  );
}
