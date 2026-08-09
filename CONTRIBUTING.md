# Contributing

Contributions should preserve the project's small, privacy-first, fail-open design.

## Before Opening a Pull Request

1. Explain the anti-scraping behavior or defect being addressed.
2. Add or update a test before changing runtime behavior.
3. Keep configuration examples on reserved `.example` domains.
4. Do not submit live telemetry, customer data, raw network identifiers, credentials, private rules, or deployment-specific destinations.
5. Run the complete verification suite.

```text
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run validate:publication
```

## Design Principles

- Prefer several bounded signals over a broad block rule.
- Preserve exact-origin CORS.
- Keep the browser runtime free of secrets.
- Store anonymous HMAC correlation keys instead of raw identity material.
- Fail open when supporting infrastructure is unavailable.
- Start new policy in `log_only` and require evidence before enforcement.
- Do not turn the project into an offensive scanning or exploitation tool.

## Pull Request Scope

Keep changes focused. Separate runtime policy, storage migrations, documentation, and dependency upgrades when they can be reviewed independently. Describe migration and rollback steps for any schema or configuration change.

## Security Reports

Do not open a public issue for a vulnerability that could expose a deployment. Follow [SECURITY.md](SECURITY.md) and provide only the minimum reproducible information.
