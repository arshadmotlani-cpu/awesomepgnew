export default function TransfersPage() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-fyh-accent">
          Inventory
        </p>
        <h1 className="fyh-display mt-1 text-3xl font-semibold">Transfers</h1>
        <p className="mt-1 text-sm text-fyh-text-secondary">
          Inter-location stock transfers — coming in a future phase.
        </p>
      </div>
      <div className="fyh-glass px-6 py-16 text-center">
        <p className="fyh-display text-xl font-semibold">Not available yet</p>
        <p className="mt-2 text-sm text-fyh-text-muted">
          Transfer movements will use the stock ledger when multi-location is enabled.
        </p>
      </div>
    </div>
  );
}
