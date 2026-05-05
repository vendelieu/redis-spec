# redis-spec-builder

Builds a single typed, machine-readable Redis API specification artifact by
scraping `redis/redis` (`unstable`) and `redis/docs` (`main`), normalizing every
useful field, and publishing the result as a versioned GitHub release.

Consumers (e.g. the re.this Kotlin client's KSP code generator) deserialize one
JSON file instead of fetching multiple upstream files and regex-matching English
reply text.

## What's in the artifact

`output/spec.json`:

- `manifest` — pinned source SHAs, build timestamp, command counts, reply
  coverage stats.
- `commands` — one `CommandSpec` per command. Covers core, all four Redis Stack
  modules (RedisJSON, RedisBloom, RediSearch, RedisTimeSeries), and optionally
  Sentinel.
- `indexes` — pre-computed views: `byGroup`, `byModule`, `byContainer`,
  `deprecated`, `blocking`.

Each `CommandSpec` carries:

- All upstream metadata: `summary`, `since`, `deprecatedSince`, `replacedBy`,
  `group`, `module`, `complexity`, `arity`.
- `commandFlags`, `aclCategories` (raw lists from `redis/redis` or
  `commands_core.json`).
- `commandTips` — structured `requestPolicy` / `responsePolicy` / nondeterminism
  flags. Critical for cluster routing.
- `keySpecs` — full `beginSearch` / `findKeys` shapes including `keynum` and
  `keyword` variants.
- `arguments` — recursive tree, with per-argument `since`, `deprecatedSince`,
  `summary`.
- `history`, `hints`, `docFlags`, `function`, `getKeysFunction`, `container`.
- `replies` — explicit RESP2 vs RESP3 typed shapes (`ReplyShape` discriminated
  union), `protocolNotes` for encoding-level differences, raw English text
  preserved for hover-doc generation, source provenance per protocol.

`output/schema.json` — JSON-Schema for `spec.json`, generated from the same zod
definitions used to validate the build (single source of truth).

`output/manifest.json` — duplicate of `spec.json.manifest` for cheap polling.

## Reply taxonomy (`ReplyShape`)

Discriminated union on `kind`. Container kinds recurse:

- Scalar: `simpleString`, `simpleError`, `integer`, `double`, `boolean`,
  `bulkString`, `verbatimString`, `bigNumber`, `null`.
- Container: `array`, `set`, `map`, `tuple`, `oneOf`, `push`.
- Fallback: `unknown` (with raw text; CI fails if budget exceeded).

## Sources

| Source                                               | Used for                                |
|------------------------------------------------------|-----------------------------------------|
| `redis/redis@unstable/src/commands/*.json`           | Core: `arguments`, `keySpecs`, `commandFlags`, `aclCategories`, `commandTips`, `function`, `container`, `reply_schema` (RESP3 typed shapes). |
| `redis/docs@main/data/commands_core.json`            | Fallback core spec (covers commands not yet in `redis/redis`); `history`, `hints`, `docFlags`. |
| `redis/docs@main/data/commands_redisjson.json`       | RedisJSON module specs.                 |
| `redis/docs@main/data/commands_redisbloom.json`      | RedisBloom module specs.                |
| `redis/docs@main/data/commands_redisearch.json`      | RediSearch module specs (richest module shape — includes `command_tips` and `history`). |
| `redis/docs@main/data/commands_redistimeseries.json` | RedisTimeSeries module specs.           |
| `redis/docs@main/content/commands/<slug>.md`         | RESP2/RESP3 split (`{{< multitabs >}}`); fallback reply parsing for commands without `reply_schema`. |
| `--sentinel <path>` (CLI flag, optional)             | Sentinel specs (re.this owns these).    |

## Local development

```bash
cd redis-spec-builder
bun install
bun run build          # scrape + build → output/*.json + state/upstream.json
bun test               # unit tests
bun run typecheck
bun run validate       # ajv-validate output/spec.json against output/schema.json
```

## Change detection

`src/main.ts` resolves the latest SHAs of `redis/redis@unstable` and
`redis/docs@main`, compares with `state/upstream.json`, and exits cleanly
(emitting `changed=false` to `$GITHUB_OUTPUT`) when both are unchanged.

`.github/workflows/scrape.yml` runs daily; on a real change it opens a PR with
the regenerated outputs. `.github/workflows/release.yml` cuts a calendar-versioned
release (`vYYYY.MM.DD`) when `output/` lands on `main`.

## Versioning

Output: calendar version `vYYYY.MM.DD` (release tag).
Schema: `$schemaVersion` field at the top of `spec.json`. Major bumps when the
shape becomes backward-incompatible.
