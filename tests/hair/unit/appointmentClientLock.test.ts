import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('edit appointment UI locks the client and does not submit a new customerId', () => {
  const drawer = readFileSync(
    join(root, 'src/hair/components/appointments/AppointmentEditDrawer.tsx'),
    'utf8',
  );
  assert.match(drawer, /To change the client, cancel this appointment and create a new one/);
  assert.match(drawer, /appointment\.customerName/);
  assert.doesNotMatch(drawer, /customerId:\s*locked \? undefined : customerId/);
  assert.doesNotMatch(drawer, /setCustomerId/);
  assert.doesNotMatch(drawer, /<select[\s\S]*Customer/);

  const action = readFileSync(join(root, 'src/hair/actions/appointments.ts'), 'utf8');
  assert.match(action, /updateAppointment\(/);
  assert.match(action, /customerId:\s*input\.customerId/);

  const service = readFileSync(join(root, 'src/hair/services/appointments.ts'), 'utf8');
  assert.match(
    service,
    /Cannot change client on an existing appointment/,
  );
});
