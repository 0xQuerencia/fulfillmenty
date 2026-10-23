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

The intended local stack is Next.js, TypeScript, Fastify, PostgreSQL, Drizzle, and Redis. Setup instructions will be added with the first backend slice.

## License

The project license is still under consideration. Until a license is selected and added, no additional reuse rights are granted by this repository.

## Source specification

The product and engineering source of truth is maintained by the project owner outside this repository. Market figures in that document are dated proxies, not order counts or live platform metrics.
