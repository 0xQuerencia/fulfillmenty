# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Fulfillment staff source products for recipients in different countries. Organizers compare regional options and prices. Developers use the public API to build sourcing tools. Community contributors suggest suppliers and moderators review those suggestions.

## Product Purpose

Fulfillmenty is an independent, open product and merchant catalog for region-specific sourcing. Success means making it easier to find a defensible local purchase option while clearly showing the source, freshness, and what is unknown.

## Positioning

The catalog combines exact product variants, destination-specific merchant offers, and community review with explicit price provenance. It is a reusable public resource, not a procurement or checkout service.

## Operating Context

The dashboard supports catalog discovery, destination offer comparison, contribution, moderation, and API exploration. Source suggestions are reviewed by a human before publication. The master specification is `/home/wizrizz/Downloads/FULFILLMENTY_MASTER_SPEC.md`.

## Capabilities and Constraints

- Public product, offer, merchant, country, currency, coverage, history, and statistics API routes.
- Contributors may suggest merchant URLs; those URLs are validated and stored but are never fetched automatically.
- Moderators can accept or reject suggestions and record manual price observations.
- Shipping, tax, availability, and freshness remain unknown unless supported by observations.
- Local demo roles are development-only. Production account authentication and authorization remain open work.
- No payments, orders, shipping addresses, or live merchant refreshes are part of the current implementation.

## Brand Commitments

The product name is Fulfillmenty. The master specification's motto is “Find it locally. Price it accurately. Fulfill it intelligently.” Fulfillmenty must remain independent of proprietary fulfillment systems and must not imply organizational endorsement.

## Evidence on Hand

- The master product specification is a proposal, not proof of a launched service or live market data.
- The supplied dashboard image at `/home/wizrizz/Downloads/Fulfillmenty Global Sourcing Dashboard.png` is the visual reference for this dashboard task. Its shown figures are illustrative, not verified service metrics.
- Current seeded merchant and price records are fictional examples; no live seller recommendations or prices are available.

## Product Principles

- Preserve native regional prices and currencies.
- Keep unknown cost and availability components explicitly unknown.
- Distinguish source review, price observation, purchase confirmation, and merchant trust.
- Do not fetch arbitrary contributor-submitted URLs.
- Keep the product independent and its data provenance visible.
