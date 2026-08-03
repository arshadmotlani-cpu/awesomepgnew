/**
 * timeline/v1/getTimeline — Layer B display truth rebuilt from outbox events.
 */

import { loadTimeline, type LoadTimelineInput } from '@/src/roomOs/timeline';

export async function getTimeline(input: LoadTimelineInput) {
  const page = await loadTimeline(input);
  return { apiVersion: 'timeline/v1' as const, ...page };
}
