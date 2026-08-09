CREATE TABLE risk_events (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  visitor_key TEXT NOT NULL,
  campaign_key TEXT NOT NULL,
  cohort_key TEXT NOT NULL,
  network_key TEXT NOT NULL,
  asn_key TEXT NOT NULL,
  country_key TEXT NOT NULL,
  route_class TEXT NOT NULL CHECK (route_class IN ('protected', 'excluded', 'unprotected')),
  route_group TEXT NOT NULL CHECK (route_group IN ('protected', 'excluded', 'unprotected')),
  dwell_ms INTEGER NOT NULL CHECK (dwell_ms >= 0),
  trusted_interactions INTEGER NOT NULL CHECK (trusted_interactions >= 0),
  webdriver INTEGER NOT NULL CHECK (webdriver IN (0, 1)),
  decision_action TEXT NOT NULL CHECK (decision_action IN ('allow', 'redirect')),
  would_action TEXT NOT NULL CHECK (would_action IN ('allow', 'redirect'))
);

CREATE INDEX idx_events_cohort_time ON risk_events (cohort_key, occurred_at);
CREATE INDEX idx_events_decision_time ON risk_events (decision_action, occurred_at);
