import type { Route, RoutingRules, VaultRoute } from './types.ts';

/** Route a Teal job title: manager wording wins, then lead/principal/architect + people wording is ambiguous. */
export function routeTitle(role: string, rules: RoutingRules): Route {
  if (new RegExp(rules.managerRegex, 'i').test(role)) return 'manager';
  const ambiguous = new RegExp(rules.ambiguousRegex, 'i').test(role);
  if (ambiguous && new RegExp(rules.peopleRegex, 'i').test(role)) return 'pending';
  return 'ic';
}

export function routeJob(
  job: { id: string; role: string },
  rules: RoutingRules,
  overrides: Record<string, VaultRoute>,
): Route {
  return Object.hasOwn(overrides, job.id) ? overrides[job.id] : routeTitle(job.role, rules);
}
