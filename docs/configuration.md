# Configuration

Public runtime configuration lives in `wrangler.jsonc`. The HMAC key is the only required secret.

## Variables

| Variable                       | Required | Meaning                                               |
| ------------------------------ | -------- | ----------------------------------------------------- |
| `MODE`                         | No       | `log_only` by default, or `enforce` after review      |
| `ALLOWED_ORIGINS_JSON`         | Yes      | JSON array of exact storefront origins                |
| `PROTECTED_PATHS_JSON`         | Yes      | JSON array of path prefixes evaluated by the runtime  |
| `EXCLUDED_PATHS_JSON`          | Yes      | JSON array of path prefixes always excluded           |
| `REDIRECT_URL`                 | Yes      | One exact HTTPS destination without query or fragment |
| `SYNTHETIC_DWELL_THRESHOLD_MS` | No       | Integer from 1 through 10000; defaults to 1000        |
| `HMAC_SECRET`                  | Yes      | Private Worker secret used to derive anonymous keys   |

## Neutral Example

```json
{
  "MODE": "log_only",
  "ALLOWED_ORIGINS_JSON": "[\"https://site.example\"]",
  "PROTECTED_PATHS_JSON": "[\"/protected\"]",
  "EXCLUDED_PATHS_JSON": "[\"/excluded\"]",
  "REDIRECT_URL": "https://destination.example/safe",
  "SYNTHETIC_DWELL_THRESHOLD_MS": "1000"
}
```

## Path Matching

Paths are normalized without trailing slashes. A prefix matches itself and descendants. For example, `/protected` matches both `/protected` and `/protected/item`.

One locale-like leading segment is ignored during classification. `/en/protected/item` is therefore evaluated as `/protected/item`.

Excluded paths take precedence over protected paths. The redirect destination should be excluded when it shares an allowed storefront origin.

## Runtime Modes

### `log_only`

The Worker stores `wouldAction` but returns `action: allow`. Use this mode to inspect false positives and confirm route scope without redirecting navigation.

### `enforce`

The Worker may return `action: redirect` and the exact configured `redirectUrl`. The browser rejects any different redirect value.

## Secret Setup

Create a strong random value and store it with:

```text
npx wrangler secret put HMAC_SECRET
```

Do not place the secret in source control, `.dev.vars`, examples, issue reports, screenshots, or client-side code.

## Configuration Failure

Invalid mode, origin, path, redirect, threshold, or redirect-loop configuration causes the browser endpoint to return an inert script and the decision endpoint to fail open. Correct configuration before enabling enforcement.
