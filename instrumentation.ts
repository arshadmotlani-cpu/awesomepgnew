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
    const { formatStartupIntegrationReport, getIntegrationsHealthSummary } = await import(
      './src/lib/integrations/status'
    );
    const integrations = getIntegrationsHealthSummary();
    console.log(`[startup] ${formatStartupIntegrationReport(integrations)}`);
    if (!integrations.kyc.uploadsAvailable) {
      console.warn(
        '[startup] KYC uploads blocked on this deployment — create a private Vercel Blob store and set BLOB_READ_WRITE_TOKEN.',
      );
    }
    if (!integrations.blob.privateConfigured) {
      console.warn(
        '[startup] Blob private storage not configured — KYC and payment proofs require BLOB_READ_WRITE_TOKEN.',
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[startup] Integration check skipped: ${message}`);
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
