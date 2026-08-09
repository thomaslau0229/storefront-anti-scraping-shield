# Threat Model

## Objective

Raise the cost of browser-based automated extraction on selected public routes while preserving normal storefront availability and avoiding raw network identity storage.

## In Scope

- Basic WebDriver-driven automation
- Fast visits with no trusted browser interaction
- Repeated browser checks that benefit from anonymous correlation
- Accidental route overexposure caused by broad client-side inclusion
- Redirect loops, open redirects, and cross-origin decision abuse
- Secret leakage through client configuration or stored event fields

## Out of Scope

- First-byte blocking at the storefront origin
- Direct HTTP retrieval with JavaScript disabled
- A sophisticated browser that forges interaction and environment signals
- Account takeover, payment fraud, credential stuffing, or application exploitation
- Protection of information already present in public HTML
- Identification of a person or organization behind an IP address

## Security Properties

### Availability first

Configuration, key, database, network, parse, and runtime errors fail open. A defensive layer should not make the storefront unavailable when its supporting service fails.

### No single weak signal as identity

WebDriver, dwell time, interaction count, country, ASN, and network are signals, not proof of a human or bot. The included rule is intentionally narrow and should be extended only with measured false-positive evidence.

### Anonymous operational correlation

Raw seeds and edge values are transformed with HMAC before storage. Correlation keys support bounded operational grouping without becoming a reusable identity outside the deployment.

### Exact redirect control

The destination is configured server-side, must use HTTPS, cannot include query or fragment data, and is returned only as the exact configured URL. The browser confirms equality before navigation.

### Exact-origin CORS

Origins are configured as complete origins and compared exactly. Wildcard CORS is not used.

## Abuse Cases

| Abuse case                                    | Mitigation                                                       |
| --------------------------------------------- | ---------------------------------------------------------------- |
| Untrusted site calls the decision API         | Exact-origin CORS and 403 response                               |
| Client submits oversized or additional fields | Bounded body and exact shape validation                          |
| Attacker reads D1 events                      | No raw browser seed, IP address, ASN, or country value is stored |
| Misconfiguration redirects in a loop          | Redirect-loop validation and excluded-path precedence            |
| Worker is unavailable                         | Browser catches failures and leaves navigation unchanged         |
| Forged redirect response                      | Browser accepts only the exact configured destination            |

## Deployment Guidance

Start in `log_only`. Review normal customer journeys, accessibility tools, testing systems, privacy relays, mobile network changes, and authorized monitoring before enabling enforcement. Never treat public browser-layer defense as protection for confidential data; confidential data must not be included in public HTML.
