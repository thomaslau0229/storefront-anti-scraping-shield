# Deployment and Rollback

## Prerequisites

- Node.js 22 or newer
- A Cloudflare account with Workers and D1 available
- Wrangler authentication for the target account

## Install

```text
npm install
```

## Create D1

Create a D1 database named `storefront-anti-scraping-shield`. Add its generated identifier to `wrangler.jsonc` when required by your Wrangler configuration.

Apply the migration locally during development:

```text
npx wrangler d1 migrations apply storefront-anti-scraping-shield --local
```

Apply it to the target account before deployment:

```text
npx wrangler d1 migrations apply storefront-anti-scraping-shield --remote
```

## Set the Worker Secret

```text
npx wrangler secret put HMAC_SECRET
```

The secret must not be copied into `wrangler.jsonc` or browser code.

## Validate

```text
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run validate:publication
```

## Deploy

Keep `MODE` set to `log_only`, review the neutral configuration, and run:

```text
npx wrangler deploy
```

Confirm:

- `GET /health` returns `{"ok":true}`;
- `GET /shield.js` returns JavaScript;
- a configured origin receives an allow decision from `POST /v1/check`;
- an unconfigured origin receives HTTP 403;
- D1 records anonymous events;
- no navigation is redirected while `MODE` is `log_only`.

## Enable Enforcement

Only after reviewing recorded decisions:

1. Confirm the protected and excluded route prefixes.
2. Confirm the redirect destination is exact and cannot form a loop.
3. Change `MODE` to `enforce`.
4. Deploy again.
5. Test normal browsing and one controlled automation case.

## Rollback

Set `MODE` back to `log_only` and deploy. This stops redirects while preserving observation.

For immediate browser-layer disablement, remove the script tag from the storefront. The Worker can remain deployed for investigation. D1 history does not need to be deleted to disable decisions.
