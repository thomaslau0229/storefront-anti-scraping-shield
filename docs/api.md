# HTTP API

## `GET /health`

Returns a minimal liveness response.

```json
{ "ok": true }
```

This endpoint does not confirm D1 writes or configuration validity.

## `GET /shield.js`

Returns the generated browser runtime with `Content-Type: application/javascript` and `Cache-Control: no-store`.

If configuration is invalid, the endpoint returns an inert script so page rendering continues.

## `OPTIONS /v1/check`

Handles CORS preflight for an exact configured origin. Allowed requests receive HTTP 204. Unknown origins receive HTTP 403.

## `POST /v1/check`

Requires `Content-Type: application/json`, an exact configured `Origin`, and a body no larger than 4096 bytes.

### Request

```json
{
  "path": "/protected/item",
  "visitorSeed": "bounded-random-value",
  "campaignSeed": "bounded-random-value",
  "cohortSeed": "bounded-random-value",
  "trustedInteractions": 0,
  "dwellMs": 500,
  "webdriver": true
}
```

All seven fields are required and additional fields are rejected.

| Field                 | Constraint                            |
| --------------------- | ------------------------------------- |
| `path`                | Normalized path up to 2048 characters |
| `visitorSeed`         | Non-empty, up to 64 encoded bytes     |
| `campaignSeed`        | Non-empty, up to 64 encoded bytes     |
| `cohortSeed`          | Non-empty, up to 64 encoded bytes     |
| `trustedInteractions` | Integer from 0 through 100            |
| `dwellMs`             | Integer from 0 through 300000         |
| `webdriver`           | Boolean                               |

### Allow response

```json
{
  "action": "allow",
  "wouldAction": "allow"
}
```

In `log_only`, a request can return `action: allow` with `wouldAction: redirect`.

### Redirect response

```json
{
  "action": "redirect",
  "wouldAction": "redirect",
  "redirectUrl": "https://destination.example/safe"
}
```

The redirect URL appears only when enforcement selects redirect.

### Errors

| Status | Meaning                                                                                |
| ------ | -------------------------------------------------------------------------------------- |
| 400    | Invalid content type, body, shape, path, seed, counter, dwell time, or WebDriver field |
| 403    | Origin is not configured                                                               |
| 404    | Route is not defined                                                                   |

Configuration, HMAC, and storage failures return a fail-open allow response instead of exposing internal error detail.
