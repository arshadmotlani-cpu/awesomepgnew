import { CockroachGuide } from '@/src/components/cockroach/CockroachGuide';

type Props = {
  enabled: boolean;
};

export function CockroachAI({ enabled }: Props) {
  return <CockroachGuide enabled={enabled} />;
}
