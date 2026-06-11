import { CockroachGPTEngine } from '@/src/components/cockroach/CockroachGPTEngine';

type Props = {
  enabled: boolean;
};

export function CockroachAI({ enabled }: Props) {
  return <CockroachGPTEngine enabled={enabled} />;
}
