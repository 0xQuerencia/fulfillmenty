# Fulfillmenty

**Find it locally. Price it accurately. Fulfill it intelligently.**

Fulfillmenty is a proposed independent catalog and API for product sourcing across countries. It is intended to bring exact product variants, destination-specific offers, price observations, freshness, and source provenance into one reusable public resource.

This repository is under development. It does not claim to provide live merchant data, verified sellers, production price refreshes, or an operational public service. Any demonstration records or screenshots must be labeled as illustrative.

## Product principles

- Keep merchant prices in their native currencies.
- Treat unknown shipping, tax, and availability as unknown, never as zero.
- Keep product matching, price observation, community review, purchase confirmation, and organizational endorsement as separate claims.
- Never imply Hack Club endorsement without explicit authorization.
- Do not fetch arbitrary contributor-submitted URLs from the public API.
- Keep Fulfillmenty independent of Hermes and other proprietary fulfillment systems.

## Development

The local stack uses Next.js, TypeScript, Fastify, PostgreSQL, Drizzle, and Redis. Demo records are fictional, clearly marked, and never treated as live observations.

### Start locally

```sh
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Dashboard: <http://localhost:3000>
- API: <http://localhost:4000/v1>
- API reference: <http://localhost:4000/docs>
- PostgreSQL and Redis are only bound to `127.0.0.1` by Docker Compose.

`FULFILLMENTY_LOCAL_DEMO=true` enables local-only contributor/moderator roles while `NODE_ENV=development`. Turn it off outside local development. This is a development shortcut, not an account or production authorization system.

After starting PostgreSQL and applying the migration, create a scoped API key with `pnpm --filter @fulfillmenty/api key:create -- --owner=your-handle --scopes=contribute`. The command prints the secret once; only its hash and lookup prefix are stored.

Production startup and API key creation require `FULFILLMENTY_API_KEY_PEPPER` to be set to a unique secret with at least 32 characters. Generate one with `openssl rand -base64 32`, keep it in the deployment secret store, and never reuse the local value from `.env.example`.

The API validates and stores submitted merchant URLs but does not fetch them. Accepting a suggestion creates a private provisional listing; a moderator must record a real, sourced price observation before it appears in public offer results. Unknown shipping, tax, and availability values remain unknown.

The seeded products, merchant names, URLs, and price amounts are fictional examples. They have no real observation timestamps and cannot be used as merchant recommendations or evidence of regional prices.

The ISO country and currency reference data source is recorded in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License

The project license is still under consideration. Until a license is selected and added, no additional reuse rights are granted by this repository.

## Source specification

The product and engineering source of truth is maintained by the project owner outside this repository. Market figures in that document are dated proxies, not order counts or live platform metrics.
