/**
 * Owner tasks — read-only aggregate from Operations + Engine attention signals.
 */
import { buildApprovalDeepLink } from '@/src/lib/approvals/approvalDeepLinks';
import { listOpenActionItemsForOwnerRead } from '@/src/services/actionItems';
import type { PersonalFinanceSnapshot } from '@/src/personalFinance/types';
import { getRevenueDashboardSnapshot } from '@/src/hair/services/revenueDashboard';
import { getOwnerWorkforceDashboard } from '@/src/workforce/connectors/ownerBridge';
export type OwnerTaskSource =
  | 'operations'
  | 'workforce'
  | 'personal_finance'
  | 'finance'
  | 'salon';

export type OwnerTaskPriority = 'low' | 'medium' | 'high' | 'critical';

export type OwnerTaskItem = {
  id: string;
  source: OwnerTaskSource;
  priority: OwnerTaskPriority;
  reason: string;
  title: string;
  href: string;
};

const PRIORITY_RANK: Record<OwnerTaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function pgHost(): string {
  return (process.env.NEXT_PUBLIC_PG_URL ?? 'https://www.awesomepg.in').replace(/\/$/, '');
}

function salonHost(): string {
  return (process.env.NEXT_PUBLIC_SALON_URL ?? 'https://fyhair.awesomepg.in').replace(/\/$/, '');
}

function mapOpsPriority(p: 'low' | 'medium' | 'high'): OwnerTaskPriority {
  if (p === 'high') return 'high';
  if (p === 'medium') return 'medium';
  return 'low';
}

function mergeTasks(tasks: OwnerTaskItem[]): OwnerTaskItem[] {
  const byId = new Map<string, OwnerTaskItem>();
  for (const t of tasks) {
    if (!byId.has(t.id)) byId.set(t.id, t);
  }
  return [...byId.values()]
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    .slice(0, 20);
}

async function loadOperationsTasks(): Promise<OwnerTaskItem[]> {
  try {
    const items = await listOpenActionItemsForOwnerRead();
    const host = pgHost();
    return items.map((item) => {
      const path = buildApprovalDeepLink(item.type, item.metadata, item.residentId);
      return {
        id: `ops-${item.sourceKey}`,
        source: 'operations' as const,
        priority: mapOpsPriority(item.priority),
        reason: item.pgName ? `${item.pgName} · ${item.type}` : item.type,
        title: item.title,
        href: path.startsWith('http') ? path : `${host}${path}`,
      };
    });
  } catch {
    return [];
  }
}

async function loadWorkforceTasks(): Promise<OwnerTaskItem[]> {
  try {
    const wf = await getOwnerWorkforceDashboard('fyh_salon');
    return wf.attention.map((item) => ({
      id: `wf-${item.kind}`,
      source: 'workforce' as const,
      priority: item.severity === 'warn' ? ('high' as const) : ('medium' as const),
      reason: item.message,
      title: item.message,
      href: `${salonHost()}/fyh/workforce/home`,
    }));
  } catch {
    return [];
  }
}

async function loadSalonTasks(): Promise<OwnerTaskItem[]> {
  try {
    const snap = await getRevenueDashboardSnapshot();
    if ((snap.outstandingDuePaise ?? 0) <= 0) return [];
    return [
      {
        id: 'salon-outstanding-receivables',
        source: 'salon',
        priority: 'high',
        reason: 'Outstanding salon invoices due from customers',
        title: `Salon receivables ₹${((snap.outstandingDuePaise ?? 0) / 100).toLocaleString('en-IN')}`,
        href: `${salonHost()}/fyh/billing`,
      },
    ];
  } catch {
    return [];
  }
}

function loadConnectLaterTasks(finance: PersonalFinanceSnapshot | null): OwnerTaskItem[] {
  if (!finance) return [];
  const financeIds = new Set(['bank_balance', 'loans', 'emis', 'insurance', 'upcoming_payments', 'upcoming_loan_emis']);
  return finance.connectLater.map((metric) => ({
    id: `pf-${metric.id}`,
    source: (financeIds.has(metric.id) ? 'finance' : 'personal_finance') as OwnerTaskSource,
    priority: 'low' as const,
    reason: metric.calculation,
    title: `Connect ${metric.label}`,
    href: '/settings',
  }));
}

export async function loadOwnerTasks(
  finance?: PersonalFinanceSnapshot | null,
): Promise<OwnerTaskItem[]> {
  const [operations, workforce, salon, connectLater] = await Promise.all([
    loadOperationsTasks(),
    loadWorkforceTasks(),
    loadSalonTasks(),
    Promise.resolve(loadConnectLaterTasks(finance ?? null)),
  ]);

  return mergeTasks([...operations, ...workforce, ...salon, ...connectLater]);
}
