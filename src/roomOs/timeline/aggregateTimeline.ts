/**
 * Aggregate outbox rows into ordered timeline entries — Layer B.
 */

import { formatTimelineEntries } from '@/src/roomOs/timeline/formatEntry';
import { queryOutboxEventsForTimeline } from '@/src/roomOs/timeline/queryOutboxEvents';
import type { LoadTimelineInput, TimelinePage } from '@/src/roomOs/timeline/types';

export async function aggregateTimeline(input: LoadTimelineInput): Promise<TimelinePage> {
  const limit = input.limit ?? 50;
  const rows = await queryOutboxEventsForTimeline({
    streamType: input.streamType,
    streamId: input.streamId,
    from: input.from,
    to: input.to,
    cursor: input.cursor,
    limit,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const entries = formatTimelineEntries(pageRows);

  const deduped = dedupeByEventId(entries);
  const nextCursor =
    hasMore && deduped.length > 0 ? deduped[deduped.length - 1]!.occurredAt : null;

  return {
    entries: deduped,
    nextCursor,
    rebuiltAt: new Date().toISOString(),
    streamType: input.streamType,
    streamId: input.streamId,
  };
}

function dedupeByEventId<T extends { eventId: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const entry of entries) {
    if (seen.has(entry.eventId)) continue;
    seen.add(entry.eventId);
    result.push(entry);
  }
  return result;
}

/** Exported for unit tests — dedupe timeline entries by eventId. */
export function dedupeTimelineEntries<T extends { eventId: string }>(entries: T[]): T[] {
  return dedupeByEventId(entries);
}

export async function loadTimeline(input: LoadTimelineInput): Promise<TimelinePage> {
  return aggregateTimeline(input);
}
