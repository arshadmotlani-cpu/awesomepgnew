/**
 * Timeline Layer B types — human-readable entries rebuilt from Layer A events.
 */

export type TimelineStreamType = 'property' | 'bed' | 'room' | 'booking';

export type TimelineEntry = {
  id: string;
  eventId: string;
  streamType: string;
  streamId: string;
  occurredAt: string;
  eventType: string;
  title: string;
  summary: string;
  rulesEffectivePackId: string;
  payloadDigest: string;
  sourceRef: string;
  metadata?: Record<string, unknown>;
};

export type TimelinePage = {
  entries: TimelineEntry[];
  nextCursor: string | null;
  rebuiltAt: string;
  streamType: string;
  streamId: string;
};

export type LoadTimelineInput = {
  streamType: TimelineStreamType | string;
  streamId: string;
  pgId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};
