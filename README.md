# Storefront Anti-Scraping Shield

A privacy-preserving anti-scraping starter kit for storefronts. It combines a small browser runtime, a Cloudflare Worker decision endpoint, anonymous HMAC correlation keys, and D1 event storage.

The repository is deliberately deployable but conservative. It starts in `log_only`, fails open, stores no raw IP address or browser seed, and redirects only to one explicitly configured HTTPS destination.

## What Is Included

- A browser runtime served from `/shield.js`
- Route protection with locale-prefix normalization
- Trusted interaction, dwell-time, and WebDriver signals
- Anonymous visitor, campaign, cohort, network, ASN, and country keys
- Exact-origin CORS enforcement
- D1 storage for bounded decision evidence
- `log_only` and `enforce` modes
- An exact configurable redirect with loop prevention
- Unit, Worker, formatting, type, build, and publication-safety checks

## How It Works

```mermaid
flowchart LR
  A[Storefront page] --> B[shield.js]
  B --> C[/v1/check]
  C --> D[Route and signal decision]
  D --> E[(D1 anonymous events)]
  D --> F[Allow]
  D --> G[Configured HTTPS redirect]
```

The included decision rule is intentionally small: a protected route can be marked for redirect when the browser reports WebDriver, no trusted interaction, and a dwell time within the configured threshold. It is a starter rule, not a claim of complete bot detection.

## Repository Layout

```text
src/                    Worker and browser runtime
  correlation/          Anonymous HMAC correlation keys
  crypto/               HMAC utility
  http/                 Exact-origin CORS helpers
  storage/              D1 repository
migrations/             D1 schema
tests/                  Unit, Worker, and publication tests
docs/                   Architecture, API, deployment, and threat model
examples/               Neutral integration examples
scripts/                Public-release validation
.github/workflows/      Continuous integration
```

## Quick Start

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Create a D1 database named `storefront-anti-scraping-shield`.
4. Add the generated D1 identifier to `wrangler.jsonc` if your account requires it.
5. Apply `migrations/0001_initial.sql` through Wrangler.
6. Store a strong HMAC key with `npx wrangler secret put HMAC_SECRET`.
7. Replace only the neutral values in `wrangler.jsonc`.
8. Run `npm test` and `npm run build`.
9. Deploy with `npx wrangler deploy`.
10. Load the runtime early in the document head:

```html
<script src="https://worker.example/shield.js"></script>
```

Keep `MODE` set to `log_only` until recorded decisions have been reviewed. Change it to `enforce` only after confirming that protected paths, excluded paths, origins, and the redirect destination are correct.

## Documentation

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Deployment and rollback](docs/deployment.md)
- [HTTP API](docs/api.md)
- [Threat model](docs/threat-model.md)
- [Basic integration example](examples/basic-integration.html)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Safety Properties

- Configuration and storage failures allow the current navigation.
- The redirect target must use HTTPS and cannot contain a query string or fragment.
- A same-origin redirect target must be classified as excluded to prevent loops.
- CORS accepts only configured exact origins.
- Raw correlation material is transformed with a Worker secret before storage.
- The browser runtime never receives the HMAC secret.

## Important Limits

This is browser-layer mitigation, not first-byte protection. Public HTML can still be fetched directly. Browser signals can be forged, JavaScript can be disabled, and sophisticated automation can imitate interaction. Use this project as one layer in a documented defense strategy, not as a substitute for origin controls, platform security, or careful protection of non-public data.

## License

Licensed under [AGPL-3.0-only](LICENSE).
