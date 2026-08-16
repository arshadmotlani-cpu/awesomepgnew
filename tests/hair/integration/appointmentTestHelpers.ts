import { loadAppEnv } from '@/src/lib/db/loadEnv';
loadAppEnv();

import type { CreateAppointmentInput } from '@/src/hair/services/appointments';
import { createAppointment } from '@/src/hair/services/appointments';
import { nextSlot } from './rcFixtures';

/** Book next monotonic slot; retries on stylist conflict from shared RC DB residue. */
export async function createAppointmentNextSlot(
  input: Omit<CreateAppointmentInput, 'startAt'>,
): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return await createAppointment({ ...input, startAt: nextSlot() });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('already booked')) continue;
      throw e;
    }
  }
  throw new Error('Could not find a free stylist slot after 30 attempts');
}
