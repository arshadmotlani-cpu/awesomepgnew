export default function OwnerNotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <div>
        <p className="text-sm text-[#FF5A1F]">Owner OS</p>
        <h1 className="mt-2 text-xl font-semibold text-white">Not found</h1>
        <p className="mt-2 text-sm text-[color:var(--oo-muted)]">
          This path is not part of Owner OS.
        </p>
      </div>
    </div>
  );
}
