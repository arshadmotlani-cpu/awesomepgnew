import { IconAlertTriangle, IconDatabase } from './icons';

/**
 * Shown by every admin page when its query returned `{ ok: false }`. We
 * surface the underlying error message because operators running locally
 * usually need to see "DATABASE_URL not set" or "connection refused" to fix
 * it themselves.
 */
export function DbStatusBanner({ error }: { error: string }) {
  const isMissingUrl = /DATABASE_URL is not set|DATABASE URL missing/i.test(error);
  const isConnRefused = /ECONNREFUSED|connection refused/i.test(error);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <IconAlertTriangle width={20} height={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-900">
            {isMissingUrl
              ? 'Database not configured'
              : isConnRefused
                ? 'Cannot reach Postgres'
                : 'Database query failed'}
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            {isMissingUrl
              ? 'The admin console needs a Postgres connection string in DATABASE_URL.'
              : isConnRefused
                ? 'Postgres is not reachable. Start your local cluster or update DATABASE_URL.'
                : 'A query against the database failed. The raw error is below.'}
          </p>

          <details className="mt-3 rounded-md bg-white/70 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            <summary className="cursor-pointer font-medium">Show error detail</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-[11px] leading-snug text-amber-900">
              {error}
            </pre>
          </details>

          <div className="mt-4 rounded-md bg-white/60 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
            <p className="mb-1 flex items-center gap-1 font-medium">
              <IconDatabase width={14} height={14} /> Quick start
            </p>
            <ol className="ml-4 list-decimal space-y-0.5 text-amber-800">
              <li>
                <code className="rounded bg-amber-100 px-1">cp .env.example .env</code> and set
                <code className="ml-1 rounded bg-amber-100 px-1">DATABASE_URL</code>.
              </li>
              <li>
                Start Postgres locally (see{' '}
                <code className="rounded bg-amber-100 px-1">DATABASE_SETUP.md</code>).
              </li>
              <li>
                Run{' '}
                <code className="rounded bg-amber-100 px-1">
                  npm run db:migrate &amp;&amp; npm run db:seed
                </code>
                .
              </li>
              <li>Restart <code className="rounded bg-amber-100 px-1">npm run dev</code>.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
