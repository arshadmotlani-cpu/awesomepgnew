export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  try {
    const { checkRequiredEnv } = await import('./src/lib/healing/envHealer');
    checkRequiredEnv();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[heal] Env check skipped: ${message}`);
  }

  try {
    const { runHealthDiagnosis } = await import('./src/lib/healing/healthEngine');
    await runHealthDiagnosis();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[heal] Startup diagnosis skipped: ${message}`);
  }

  try {
    const { assertMigrationsAppliedForDev } = await import('./src/db/startupMigrationGate');
    await assertMigrationsAppliedForDev();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[db] Instrumentation migration check skipped: ${message}`);
  }
}
