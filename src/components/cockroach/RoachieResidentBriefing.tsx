import type { ResidentBriefingInput } from '@/src/lib/cockroach/residentBriefing';
import { buildResidentBriefingMessage } from '@/src/lib/cockroach/residentBriefing';
import { RoachieBriefingTrigger, RoachieRecall } from '@/src/components/cockroach/RoachieRecall';

type Props = ResidentBriefingInput & {
  sessionKey: string;
};

/** Server-friendly wrapper — renders briefing trigger with computed copy. */
export function RoachieResidentBriefing(props: Props) {
  const { sessionKey, ...input } = props;
  const message = buildResidentBriefingMessage(input);
  return (
    <>
      <RoachieRecall />
      <RoachieBriefingTrigger
        message={message}
        sessionKey={sessionKey}
        autoOpen
      />
    </>
  );
}
