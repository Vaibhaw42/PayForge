# docs/db

Database design per phase.

## Index

| Phase | File | Status |
|------:|------|--------|
| — | _(nothing yet — first ERD lands in Phase 1/2)_ | |

## Rules

- Every phase's DB additions get a Mermaid ERD.
- Every table documents: columns, types, constraints, indexes, expected row growth.
- Money columns MUST be integer/bigint minor units. No `NUMERIC`, no `FLOAT`, no `DECIMAL` for storage until we have a written ADR justifying it.
- Every foreign key is documented with ON DELETE / ON UPDATE behaviour.
