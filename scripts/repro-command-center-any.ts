import { db } from '../src/db/client';
import { customers } from '../src/db/schema';
import { loadResidentCommandCenter } from '../src/services/residentCommandCenter';

const session = {
  adminId: 'test',
  email: 'test@test.com',
  fullName: 'Test',
  role: 'super_admin' as const,
};

async function main() {
  const rows = await db.select({ id: customers.id, name: customers.fullName }).from(customers).limit(5);
  for (const row of rows) {
    try {
      await loadResidentCommandCenter(session, row.id);
      console.log('OK', row.name, row.id);
    } catch (err) {
      console.error('FAIL', row.name, row.id);
      console.error(err);
      process.exit(1);
    }
  }
  console.log('all ok');
}

main();
