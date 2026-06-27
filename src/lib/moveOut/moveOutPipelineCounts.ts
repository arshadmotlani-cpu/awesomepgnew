import type { MoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import { isWithinDays } from '@/src/lib/operationsCenterRules';

export type MoveOutPipelineCounts = {
  moveOutNotices: number;
  bedsReleasing30Days: number;
};

/** Derive dashboard counters from active pipeline rows — single counting rule. */
export function computeMoveOutPipelineCounts(
  activeItems: MoveOutPipelineItem[],
  today: string,
): MoveOutPipelineCounts {
  const moveOutNotices = activeItems.length;
  const bedsReleasing30Days = activeItems.filter((item) =>
    isWithinDays(item.vacatingDate, today, 30),
  ).length;
  return { moveOutNotices, bedsReleasing30Days };
}
