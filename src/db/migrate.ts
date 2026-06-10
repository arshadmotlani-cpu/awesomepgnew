import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createClient } from './client';

async function main() {
  const { db, close } = createClient({ max: 1 });
  console.log('→ Running migrations from src/db/migrations …');
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
  console.log('✓ Migrations applied');
  await close();
}

main().catch((err) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
