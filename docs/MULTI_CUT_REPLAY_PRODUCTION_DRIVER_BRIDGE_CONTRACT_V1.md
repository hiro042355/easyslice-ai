# Multi-cut Replay Production Driver Bridge Contract V1

## Status

Accepted for contract alignment. Production bridge implementation is out of
scope.

## Ownership

The CS-11 Execution Runtime owns transaction orchestration. The existing
Production PostgreSQL Driver supplies PostgreSQL mechanisms. The CS-10 Pure
Adapter owns row mapping, cardinality, zero-row classification, and replay
result semantics. The future bridge owns transport projection only.

`command` is owned by the PostgreSQL query result. The Production Driver
preserves `pg.QueryResult.command`; the bridge must copy that value directly.
SQL parsing, command inference, and command enumeration are forbidden.

Zero-row and cardinality remain owned by the Pure Adapter. The bridge requests
an unclassified row collection and preserves zero, one, or multiple rows.

## Parameter projection

| SQL cast | Accepted value | PostgreSQL parameter | Invalid value |
| --- | --- | --- | --- |
| `uuid` | Canonical lowercase UUID string | `uuid` | Reject before query |
| `text` | String | `string` | Reject before query |
| `integer` | Safe integer in PostgreSQL int4 range | `safe-integer` | Reject before query |
| `bigint` | Canonical decimal string in PostgreSQL int8 range | `bigint` | Reject before query |
| `timestamptz` | Canonical UTC timestamp ending in `Z` | `utc-timestamp` | Reject before query |

Projection is exact. Implicit string conversion, rounding, timezone inference,
and null substitution are forbidden.

## Query result projection

Decoded rows are copied for isolation. `rowCount` and `command` are copied
directly. Null is preserved. Undefined values fail closed. Domain mapping is
delegated to the Pure Adapter.

## Failure projection

The machine-readable contract covers every Production Driver issue plus
commit-unknown and non-PostgreSQL thrown values. Original causes are not
exposed. Only safe SQLSTATE class information may be retained.
Serialization and deadlock conflicts remain retryable. Commit-unknown requires
reconciliation and must never trigger rollback.

## Connection lifecycle

The contract defines acquired, transaction-open, committed, rolled-back,
commit-unknown, discarded, and released states. Normal terminal connections
return to the pool. Commit-unknown connections are destroyed. Subsequent
runtime release after discard is an idempotent no-op.

## Dependency direction

The future Production Replay Bridge may depend on CS-12 Driver types and
existing Production PostgreSQL Driver types. Reverse dependencies, direct
Pure Adapter infrastructure dependencies, Runtime-to-pg dependencies,
SQL-Definition-to-driver dependencies, and cycles are forbidden.

## Non-goals

This contract does not implement the bridge, execute SQL, change Runtime or
Adapter behavior, define SQL, or alter the migration.
