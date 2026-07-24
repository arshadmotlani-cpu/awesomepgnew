import { notFound } from 'next/navigation';
import { ResidentMoveOutStagePreview } from '@/src/components/customer/account/resident/vacating/ResidentMoveOutStagePreview';
import {
  buildResidentMoveOutStageProps,
  type ResidentMoveOutStageId,
} from '@/src/lib/vacating/residentMoveOutStageFixtures';

const STAGES: ResidentMoveOutStageId[] = [
  'pending',
  'approved',
  'request_refund',
  'under_review',
  'completed',
];

function parseStage(raw: string | undefined): ResidentMoveOutStageId {
  if (raw && STAGES.includes(raw as ResidentMoveOutStageId)) {
    return raw as ResidentMoveOutStageId;
  }
  return 'pending';
}

export default async function ResidentMoveOutStagesDevPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  const { stage: stageParam } = await searchParams;
  const stage = parseStage(stageParam);
  const cfg = buildResidentMoveOutStageProps(stage);
  return <ResidentMoveOutStagePreview cfg={cfg} />;
}
