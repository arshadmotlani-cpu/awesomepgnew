/**
 * Workforce → Owner Dashboard / Owner Brain projection.
 */
import { WORKFORCE_BRAIN_CONNECTIONS } from '@/src/workforce/connectors/connectionCatalog';
import { getAppointmentBrainRoster } from '@/src/workforce/connectors/appointmentBridge';
import { getCustomerServiceCapacity } from '@/src/workforce/connectors/customerBridge';
import { getWorkforceFinanceContribution } from '@/src/workforce/connectors/financeBridge';
import { getWorkforceHealthSelfCheck } from '@/src/workforce/connectors/healthBridge';
import { listEmployeesForEngine } from '@/src/workforce/brains/employeeBrain';
import type { WorkforceEngineId } from '@/src/workforce/types';

export type OwnerWorkforceAttentionItem = {
  kind: 'missing_schedule' | 'no_bookable' | 'finance_liability' | 'health_attention';
  severity: 'info' | 'warn';
  message: string;
};

export type OwnerWorkforceDashboard = {
  engineId: WorkforceEngineId;
  teamSize: number;
  owners: number;
  managers: number;
  staff: number;
  finance: Awaited<ReturnType<typeof getWorkforceFinanceContribution>>;
  appointments: Awaited<ReturnType<typeof getAppointmentBrainRoster>>;
  customers: Awaited<ReturnType<typeof getCustomerServiceCapacity>>;
  healthSelfCheck: Awaited<ReturnType<typeof getWorkforceHealthSelfCheck>>;
  attention: OwnerWorkforceAttentionItem[];
  connections: Array<{
    brain: 'finance' | 'health' | 'appointment' | 'customer' | 'owner';
    status: 'connected' | 'ready' | 'frozen_read_only';
    detail: string;
  }>;
  asOf: string;
};

export async function getOwnerWorkforceDashboard(
  engineId: WorkforceEngineId = 'fyh_salon',
): Promise<OwnerWorkforceDashboard> {
  const [team, finance, appointments, customers, healthSelfCheck] = await Promise.all([
    listEmployeesForEngine(engineId, { activeOnly: true }),
    getWorkforceFinanceContribution(engineId),
    getAppointmentBrainRoster(engineId),
    getCustomerServiceCapacity(engineId),
    getWorkforceHealthSelfCheck(engineId),
  ]);

  const owners = team.filter((t) => t.membership.rank === 'owner').length;
  const managers = team.filter((t) => t.membership.rank === 'manager').length;
  const staff = team.filter((t) => t.membership.rank === 'team_member').length;

  const attention: OwnerWorkforceAttentionItem[] = [];
  if (healthSelfCheck.employeesMissingSchedule > 0) {
    attention.push({
      kind: 'missing_schedule',
      severity: 'warn',
      message: `${healthSelfCheck.employeesMissingSchedule} employee(s) missing working hours`,
    });
  }
  if (appointments.bookableCount === 0 && staff > 0) {
    attention.push({
      kind: 'no_bookable',
      severity: 'warn',
      message: 'No employees can receive appointments',
    });
  }
  if (finance.monthlySalaryLiabilityPaise > 0) {
    attention.push({
      kind: 'finance_liability',
      severity: 'info',
      message: `Monthly salary liability ₹${(finance.monthlySalaryLiabilityPaise / 100).toLocaleString('en-IN')}`,
    });
  }
  if (healthSelfCheck.status === 'attention') {
    attention.push({
      kind: 'health_attention',
      severity: 'warn',
      message: healthSelfCheck.notes[0] ?? 'Workforce self-check needs attention',
    });
  }

  return {
    engineId,
    teamSize: team.length,
    owners,
    managers,
    staff,
    finance,
    appointments,
    customers,
    healthSelfCheck,
    attention,
    connections: [...WORKFORCE_BRAIN_CONNECTIONS],
    asOf: new Date().toISOString(),
  };
}
