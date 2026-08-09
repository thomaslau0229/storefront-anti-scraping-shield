# Architecture

Storefront Anti-Scraping Shield separates signal handling, decision, correlation, and storage into small components.

## Components

### Browser runtime

`GET /shield.js` returns a generated script containing only public configuration: the Worker origin, protected path prefixes, excluded path prefixes, and the configured redirect URL. The browser script:

- exits on unprotected, excluded, or destination routes;
- creates bounded random session seeds;
- counts trusted pointer, touch, keyboard, scroll, and visibility events;
- records dwell time and the browser WebDriver flag;
- calls the Worker after a short delay and during page lifecycle transitions;
- uses `location.replace` only when the Worker returns the exact configured redirect.

### Worker decision endpoint

`POST /v1/check` validates exact request shape, body size, origin, path, seeds, counters, dwell time, and WebDriver type. It classifies the route and computes both:

- `wouldAction`: what the configured rule recommends;
- `action`: what the current mode permits.

In `log_only`, `action` remains `allow`. In `enforce`, it can match `wouldAction`.

### Anonymous correlation

Raw browser and edge values are not written to D1. The Worker combines each bounded value with `HMAC_SECRET` to derive time-bounded correlation keys for visitor, campaign, cohort, network, ASN, and country dimensions.

The secret exists only in Worker secret storage. It is never returned by an endpoint or embedded in `shield.js`.

### D1 repository

The repository writes one bounded event per accepted check. Stored fields cover anonymous keys, route class, dwell time, trusted interaction count, WebDriver status, actual action, and would-be action.

If HMAC or D1 is unavailable, the endpoint returns `allow`. This fail-open behavior protects storefront availability.

## Data Flow

1. A protected page loads the browser runtime.
2. The runtime gathers bounded session and interaction signals.
3. The browser posts to `/v1/check` without credentials.
4. The Worker validates CORS and payload shape.
5. The route and starter rule produce a decision.
6. Anonymous HMAC keys and decision evidence are stored in D1.
7. The browser remains in place or replaces the location with the exact configured destination.

## Trust Boundaries

- Browser input is untrusted and fully validated.
- Cloudflare edge metadata is bounded before correlation.
- D1 is treated as an operational event store, not an identity database.
- `wrangler.jsonc` contains public configuration only.
- `HMAC_SECRET` must remain in Worker secret storage.

## Extension Boundary

The starter rule is isolated in `shouldRedirect` so a deployment can add reviewed policy without changing transport, privacy, CORS, or storage contracts. New rules should be evidence-based, tested in `log_only`, and designed to avoid treating a single weak signal as proof of automation.
