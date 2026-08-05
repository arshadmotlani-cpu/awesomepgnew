/**
 * Brain health snapshot for Owner OS — uses deployed Wave 1 Health Brain only.
 */
import { runAllBrainIntegrityAudits } from '@/src/lib/health/healthBrain';

export type OwnerBrainHealthCard = {
  brain: string;
  status: 'Healthy' | 'Warning' | 'Critical';
  openP0: number;
  openP1: number;
  openP2: number;
  href: string;
};

export type OwnerBrainHealthSnapshot = {
  asOf: string;
  pass: boolean;
  cards: OwnerBrainHealthCard[];
  pgHealthReportUrl: string;
};

export async function loadOwnerBrainHealthSnapshot(): Promise<OwnerBrainHealthSnapshot | null> {
  try {
    const report = await runAllBrainIntegrityAudits({
      runSafeRepairs: false,
      persistIncidents: false,
    });
    const pgHost = process.env.NEXT_PUBLIC_PG_URL ?? 'https://www.awesomepg.in';
    return {
      asOf: report.asOf,
      pass: report.pass,
      cards: report.cards.map((c) => ({
        brain: c.brain,
        status: c.status,
        openP0: c.openP0,
        openP1: c.openP1,
        openP2: c.openP2,
        href: `${pgHost}${c.href}`,
      })),
      pgHealthReportUrl: `${pgHost}/admin/system/health-report`,
    };
  } catch (e) {
    console.error('[owner] brain health snapshot failed', e);
    return null;
  }
}
