# Storefront Risk Shield

Storefront Risk Shield is a small, configurable Worker starter kit. It records anonymous summaries and returns allow or redirect decisions. The default `log_only` mode always allows browser navigation while recording what the configured rule would have done.

## Local Setup

1. Install Node.js 22 or newer and run `npm install`.
2. Review the neutral values in `wrangler.jsonc`: <https://site.example>, `/protected`, `/excluded`, and <https://destination.example/safe>.
3. Create a D1 database, add its identifier to `wrangler.jsonc`, and apply the migration with `npx wrangler d1 migrations apply storefront-risk-shield --local`.
4. Store a strong HMAC key with `npx wrangler secret put HMAC_SECRET`. This is the only required Worker secret.
5. Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run validate:publication`.

## Deploy

Apply the D1 migration with `npx wrangler d1 migrations apply storefront-risk-shield --remote`, then run `npx wrangler deploy`. Load the browser runtime early in the document head:

```html
<script src="https://worker.example/shield.js"></script>
```

Keep `MODE` set to `log_only` while reviewing recorded decisions. To opt in to redirect enforcement, set `MODE` to `enforce` and deploy again. A redirect response can contain only the configured HTTPS `REDIRECT_URL`.

## Rollback

Set `MODE` back to `log_only` and deploy. Removing the script tag disables browser checks immediately.

## Limitations

The browser runtime starts after the page response, so it is not first-byte protection and cannot prevent direct retrieval of public HTML. Browser, network, key, and storage errors fail open. The included rule and threshold are conservative starter examples that require deployment-specific review.

## License

This project is licensed under [AGPL-3.0-only](LICENSE).
