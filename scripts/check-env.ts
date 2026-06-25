/* eslint-disable no-console */
/**
 * Validate database environment configuration for local development.
 */
import { loadAppEnv } from '../src/lib/db/loadEnv';
import {
  formatDatabaseConfigReport,
  getDatabaseConnectionInfo,
  hasDatabaseUrl,
} from '../src/lib/db/env';

loadAppEnv();

console.log(formatDatabaseConfigReport());

if (!hasDatabaseUrl()) {
  process.exit(1);
}

try {
  const info = getDatabaseConnectionInfo();
  console.log('');
  console.log(`Resolved: ${info.source} → ${info.host}/${info.database} (${info.environment})`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
