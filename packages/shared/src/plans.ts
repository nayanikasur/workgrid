export const PLAN_IDS = ['free', 'pro'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanDefinition {
  id: PlanId;
  name: string;
  priceMonthly: number;
  tagline: string;
  /** null = unlimited */
  limits: {
    projects: number | null;
    members: number | null;
    auditLogDays: number;
  };
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    tagline: 'For small teams getting started',
    limits: { projects: 3, members: 5, auditLogDays: 7 },
    features: ['Up to 3 projects', 'Up to 5 members', 'Real-time boards', '7-day audit log'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 12,
    tagline: 'For teams that ship every week',
    limits: { projects: null, members: null, auditLogDays: 90 },
    features: [
      'Unlimited projects',
      'Unlimited members',
      'Real-time boards',
      '90-day audit log',
      'Advanced analytics',
    ],
  },
};

export function isWithinLimit(limit: number | null, current: number): boolean {
  return limit === null || current < limit;
}
