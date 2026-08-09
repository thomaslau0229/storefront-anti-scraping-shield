import type { DecisionAction, RouteClass } from "../types";

export interface StoredRiskEvent {
  id: string;
  occurredAt: number;
  visitorKey: string;
  campaignKey: string;
  cohortKey: string;
  networkKey: string;
  asnKey: string;
  countryKey: string;
  routeClass: RouteClass;
  routeGroup: RouteClass;
  dwellMs: number;
  trustedInteractions: number;
  webdriver: boolean;
  action: DecisionAction;
  wouldAction: DecisionAction;
}

export interface RiskRepository {
  recordEvent(event: StoredRiskEvent): Promise<void>;
}

const INSERT_EVENT_SQL = `
  INSERT INTO risk_events (
    id, occurred_at, visitor_key, campaign_key, cohort_key, network_key, asn_key, country_key,
    route_class, route_group, dwell_ms, trusted_interactions, webdriver, decision_action, would_action
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export class D1RiskRepository implements RiskRepository {
  constructor(private readonly db: D1Database) {}

  async recordEvent(event: StoredRiskEvent): Promise<void> {
    await this.db
      .prepare(INSERT_EVENT_SQL)
      .bind(
        event.id,
        event.occurredAt,
        event.visitorKey,
        event.campaignKey,
        event.cohortKey,
        event.networkKey,
        event.asnKey,
        event.countryKey,
        event.routeClass,
        event.routeGroup,
        event.dwellMs,
        event.trustedInteractions,
        event.webdriver ? 1 : 0,
        event.action,
        event.wouldAction,
      )
      .run();
  }
}
