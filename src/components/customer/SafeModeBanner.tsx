import { getSystemState } from '@/src/lib/healing/systemState';

export function SafeModeBanner() {
  const state = getSystemState();
  if (!state.safeMode && state.status === 'HEALTHY') return null;

  const isSafe = state.safeMode;
  const label = isSafe
    ? 'System temporarily running in safe mode'
    : 'Some services are running in degraded mode';

  return (
    <div
      className={
        isSafe
          ? 'border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900'
          : 'border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-center text-sm text-yellow-900'
      }
    >
      <p className="font-medium">{label}</p>
      <p className="text-xs opacity-80">
        Read-only browsing may be available. Booking and payments could be limited until recovery
        completes.
      </p>
    </div>
  );
}
