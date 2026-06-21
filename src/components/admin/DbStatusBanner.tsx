import { IconAlertTriangle } from './icons';
import { isProductionDeployment } from '@/src/lib/admin/productionDbError';

/**
 * Shown when an admin page query returns `{ ok: false }`.
 * Production users see operator-safe copy; developers still get setup hints locally.
 */
export function DbStatusBanner({ error }: { error: string }) {
  const isProduction = isProductionDeployment();
  const isMissingUrl = /DATABASE_URL|DATABASE URL missing|database is temporarily unavailable/i.test(
    error,
  );
  const isConnRefused = /ECONNREFUSED|connection refused|temporarily unavailable/i.test(error);

  const title = isMissingUrl
    ? 'Database not configured'
    : isConnRefused
      ? 'Cannot reach database'
      : 'Unable to load data';

  const description = isProduction
    ? isMissingUrl || isConnRefused
      ? 'We could not connect to the database. Please try again in a few minutes or contact support.'
      : error
    : isMissingUrl
      ? 'The admin console needs a Postgres connection string in DATABASE_URL.'
      : isConnRefused
        ? 'Postgres is not reachable. Start your local cluster or update DATABASE_URL.'
        : 'A query against the database failed. The raw error is below.';

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
          <IconAlertTriangle width={20} height={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">{title}</h3>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/90">{description}</p>

          {!isProduction ? (
            <>
              <details className="mt-3 rounded-md bg-white/70 p-3 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-black/20 dark:text-amber-100 dark:ring-amber-500/30">
                <summary className="cursor-pointer font-medium">Show error detail</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-snug">
                  {error}
                </pre>
              </details>
              <div className="mt-4 rounded-md bg-white/60 p-3 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-black/20 dark:text-amber-100 dark:ring-amber-500/30">
                <p className="mb-1 font-medium">Local development</p>
                <ol className="ml-4 list-decimal space-y-0.5 text-amber-800 dark:text-amber-200/80">
                  <li>
                    Copy <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">.env.example</code>{' '}
                    to <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">.env</code> and set{' '}
                    <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">DATABASE_URL</code>.
                  </li>
                  <li>
                    Run{' '}
                    <code className="rounded bg-amber-100 px-1 dark:bg-amber-900/40">
                      npm run db:migrate &amp;&amp; npm run db:seed
                    </code>
                    .
                  </li>
                </ol>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
