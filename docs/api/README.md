# docs/api

API contracts per phase.

## Index

| Phase | File | Status |
|------:|------|--------|
| — | _(nothing yet — first API doc lands in Phase 2)_ | |

## Rules

- Every endpoint documented with method, path, auth requirement, request schema (Zod), response schema, error codes, and an example.
- OpenAPI spec (`openapi.yaml`) generated from Zod schemas from Phase 2 onward.
- Every money-moving endpoint MUST document its idempotency contract (which header, replay behaviour, TTL).
