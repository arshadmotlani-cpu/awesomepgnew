export default function OwnerNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
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
