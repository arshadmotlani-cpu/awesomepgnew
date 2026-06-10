export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  try {
    const { assertMigrationsAppliedForDev } = await import('./src/db/startupMigrationGate');
    await assertMigrationsAppliedForDev();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[db] Instrumentation migration check skipped: ${message}`);
  }
}
