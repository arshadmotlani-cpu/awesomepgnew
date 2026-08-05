/** Declared brain connections — unit-testable without DB. */
export const WORKFORCE_BRAIN_CONNECTIONS = [
  {
    brain: 'finance' as const,
    status: 'ready' as const,
    detail: 'Salary / incentive / payroll contribution API live for Finance Brain',
  },
  {
    brain: 'health' as const,
    status: 'frozen_read_only' as const,
    detail: 'Workforce self-check only — Health Brain Baseline v1 not modified',
  },
  {
    brain: 'appointment' as const,
    status: 'connected' as const,
    detail: 'Bookable roster + working hours consumed by Appointment Brain adapters',
  },
  {
    brain: 'customer' as const,
    status: 'ready' as const,
    detail: 'Service-capacity signal published for Customer Brain',
  },
  {
    brain: 'owner' as const,
    status: 'connected' as const,
    detail: 'Owner Workforce dashboard projection',
  },
] as const;
