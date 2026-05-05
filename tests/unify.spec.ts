import { describe, expect, test } from "bun:test";
import { unifyAll } from "../src/merge/unify.js";
import type { SourceBundle } from "../src/types.js";

function emptyBundle(overrides: Partial<SourceBundle> = {}): SourceBundle {
  return {
    redisRepo: {},
    docsCore: {},
    docsModules: { redisjson: {}, redisbloom: {}, redisearch: {}, redistimeseries: {} },
    moduleRepos: { redisjson: {}, redisbloom: {}, redisearch: {}, redistimeseries: {} },
    docsPages: {},
    sentinel: null,
    shas: {
      redisRepoSha: "x",
      redisDocsSha: "y",
      redisRepoTag: null,
      moduleRepoShas: { redisjson: null, redisbloom: null, redisearch: null, redistimeseries: null },
    },
    ...overrides,
  };
}

describe("unifyAll", () => {
  test("redis-repo wins for arguments / commandFlags", () => {
    const bundle = emptyBundle({
      redisRepo: {
        GET: {
          summary: "Get a key",
          since: "1.0.0",
          group: "string",
          arity: 2,
          command_flags: ["readonly", "fast"],
          arguments: [
            { name: "key", display_text: "key", type: "key", key_spec_index: 0 },
          ],
          reply_schema: { type: "string" },
        },
      },
      docsCore: {
        GET: {
          summary: "Get a key (docs)",
          since: "1.0.0",
          group: "string",
          arity: 2,
          command_flags: ["DOCS_OVERRIDE"],
          arguments: [{ name: "wrong", type: "string" }],
        },
      },
    });
    const { commands } = unifyAll(bundle);
    expect(commands.GET).toBeDefined();
    expect(commands.GET!.commandFlags).toEqual(["readonly", "fast"]);
    expect(commands.GET!.arguments[0]!.name).toBe("key");
    expect(commands.GET!.replies.resp3?.kind).toBe("bulkString");
    expect(commands.GET!.replies.sources).toContain("redis-repo:reply_schema");
    expect(commands.GET!.replies.confidence.resp3).toBe("schema");
    expect(commands.GET!.replies.confidence.resp2).toBe("missing");
  });

  test("module commands carry module discriminator and null commandFlags", () => {
    const bundle = emptyBundle({
      docsModules: {
        redisjson: {
          "JSON.GET": {
            summary: "Get JSON",
            since: "1.0.0",
            group: "json",
            complexity: "O(N)",
          },
        },
        redisbloom: {},
        redisearch: {},
        redistimeseries: {},
      },
    });
    const { commands } = unifyAll(bundle);
    expect(commands["JSON.GET"]).toBeDefined();
    expect(commands["JSON.GET"]!.module).toBe("redisjson");
    expect(commands["JSON.GET"]!.commandFlags).toBeNull();
    expect(commands["JSON.GET"]!.aclCategories).toBeNull();
    expect(commands["JSON.GET"]!.keySpecs).toBeNull();
  });

  test("subcommand container derived from name when redis-repo absent", () => {
    const bundle = emptyBundle({
      docsCore: {
        "ACL CAT": { summary: "List", since: "6.0.0", group: "server" },
      },
    });
    const { commands } = unifyAll(bundle);
    expect(commands["ACL CAT"]!.container).toBe("ACL");
  });

  test("multitabs page → resp2 captured separately from resp3", () => {
    const bundle = emptyBundle({
      redisRepo: {
        HGETALL: {
          summary: "Get all hash fields",
          since: "2.0.0",
          group: "hash",
          reply_schema: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      docsPages: {
        HGETALL: {
          resp2: "[Array reply]: list of field/value alternation.",
          resp3: "[Map reply]: a map of fields and values.",
          hasMultitabsSplit: true,
        },
      },
    });
    const { commands } = unifyAll(bundle);
    const r = commands.HGETALL!.replies;
    expect(r.resp3?.kind).toBe("map");
    expect(r.resp2?.kind).toBe("array");
    expect(r.protocolNotes.differs).toBe(true);
    expect(r.confidence.resp3).toBe("schema");
    expect(r.confidence.resp2).toBe("prose");
  });

  test("page without split → resp2 null (consumer treats as same as resp3)", () => {
    const bundle = emptyBundle({
      redisRepo: {
        INCR: {
          summary: "Increment",
          since: "1.0.0",
          group: "string",
          reply_schema: { type: "integer" },
        },
      },
      docsPages: {
        INCR: {
          resp2: "[Integer reply]: value after incr.",
          resp3: "[Integer reply]: value after incr.",
          hasMultitabsSplit: false,
        },
      },
    });
    const { commands } = unifyAll(bundle);
    expect(commands.INCR!.replies.resp2).toBeNull();
    expect(commands.INCR!.replies.resp3?.kind).toBe("integer");
    expect(commands.INCR!.replies.protocolNotes.differs).toBe(false);
  });

  test("sentinel commands flagged with module=sentinel", () => {
    const bundle = emptyBundle({
      sentinel: {
        "SENTINEL MASTERS": {
          summary: "List masters",
          since: "2.8.4",
          group: "sentinel",
        },
      },
    });
    const { commands } = unifyAll(bundle);
    expect(commands["SENTINEL MASTERS"]?.module).toBe("sentinel");
  });

  test("docs-core reply_schema used when redis-repo absent", () => {
    const bundle = emptyBundle({
      docsCore: {
        "ACL CAT": {
          summary: "List ACL categories",
          since: "6.0.0",
          group: "server",
          reply_schema: { type: "array", items: { type: "string" } },
        },
      },
    });
    const { commands } = unifyAll(bundle);
    const r = commands["ACL CAT"]!.replies;
    expect(r.resp3?.kind).toBe("array");
    expect((r.resp3 as { items: { kind: string } }).items.kind).toBe("bulkString");
    expect(r.sources).toContain("docs-core:reply_schema");
    expect(r.sources).not.toContain("redis-repo:reply_schema");
  });

  test("docs-module reply_schema used for module commands", () => {
    const bundle = emptyBundle({
      docsModules: {
        redisjson: {
          "JSON.OBJKEYS": {
            summary: "Object keys",
            since: "1.0.0",
            group: "json",
            reply_schema: { type: "array", items: { type: "string" } },
          },
        },
        redisbloom: {},
        redisearch: {},
        redistimeseries: {},
      },
    });
    const { commands } = unifyAll(bundle);
    const r = commands["JSON.OBJKEYS"]!.replies;
    expect(r.resp3?.kind).toBe("array");
    expect(r.sources).toContain("docs-module:redisjson:reply_schema");
  });

  test("module-repo reply_schema beats docs-module when both present", () => {
    const bundle = emptyBundle({
      docsModules: {
        redisjson: {
          "JSON.OBJKEYS": {
            summary: "Object keys",
            since: "1.0.0",
            group: "json",
            reply_schema: { type: "string" },
          },
        },
        redisbloom: {},
        redisearch: {},
        redistimeseries: {},
      },
      moduleRepos: {
        redisjson: {
          "JSON.OBJKEYS": {
            summary: "Object keys",
            since: "1.0.0",
            group: "json",
            reply_schema: { type: "array", items: { type: "string" } },
          },
        },
        redisbloom: {},
        redisearch: {},
        redistimeseries: {},
      },
    });
    const { commands } = unifyAll(bundle);
    const r = commands["JSON.OBJKEYS"]!.replies;
    expect(r.resp3?.kind).toBe("array");
    expect(r.sources).toContain("module-repo:redisjson:reply_schema");
    expect(r.sources).not.toContain("docs-module:redisjson:reply_schema");
  });

  test("redis-repo reply_schema beats docs-core when both present", () => {
    const bundle = emptyBundle({
      redisRepo: {
        GET: {
          summary: "Get a key",
          since: "1.0.0",
          group: "string",
          reply_schema: { type: "string" },
        },
      },
      docsCore: {
        GET: {
          summary: "Get a key",
          since: "1.0.0",
          group: "string",
          reply_schema: { type: "integer" },
        },
      },
    });
    const { commands } = unifyAll(bundle);
    const r = commands.GET!.replies;
    expect(r.resp3?.kind).toBe("bulkString");
    expect(r.sources).toContain("redis-repo:reply_schema");
    expect(r.sources).not.toContain("docs-core:reply_schema");
  });

  test("prose-only command has confidence=prose for resp3", () => {
    const bundle = emptyBundle({
      docsCore: {
        OBSCURE: { summary: "x", since: "1.0", group: "g" },
      },
      docsPages: {
        OBSCURE: {
          resp2: "[Bulk string reply](url): blah",
          resp3: "[Bulk string reply](url): blah",
          hasMultitabsSplit: false,
        },
      },
    });
    const { commands, stats } = unifyAll(bundle);
    const r = commands.OBSCURE!.replies;
    expect(r.confidence.resp3).toBe("prose");
    expect(r.confidence.resp2).toBe("missing");
    expect(stats.proseDerivedResp3).toBe(1);
    expect(stats.proseDerivedResp2).toBe(0);
  });

  test("missing reply info gives confidence=missing on both protocols", () => {
    const bundle = emptyBundle({
      redisRepo: {
        EMPTY: { summary: "x", since: "1.0", group: "g" },
      },
    });
    const { commands } = unifyAll(bundle);
    expect(commands.EMPTY!.replies.confidence.resp3).toBe("missing");
    expect(commands.EMPTY!.replies.confidence.resp2).toBe("missing");
  });

  test("GET keeps its own reply_schema and arguments when SLOWLOG GET coexists (canonical-naming fix)", () => {
    // Pre-fix bug: redisRepo loader keyed by short subcommand name, so
    // slowlog-get.json's `{"GET": {container: "SLOWLOG", reply_schema: {type: "array", uniqueItems: true}}}`
    // clobbered the real top-level GET. The published artifact ended up with
    // arguments=[count] and resp3.kind="set". After the canonical-naming
    // fix in redisRepo.ts, both commands coexist with their own data.
    const bundle = emptyBundle({
      redisRepo: {
        GET: {
          summary: "Get the value of a key",
          since: "1.0.0",
          group: "string",
          arity: 2,
          arguments: [{ name: "key", type: "key", key_spec_index: 0 }],
          reply_schema: {
            oneOf: [
              { type: "string", description: "The value of the key." },
              { type: "null", description: "Key does not exist." },
            ],
          },
        },
        "SLOWLOG GET": {
          summary: "Get the slow log",
          since: "2.2.12",
          group: "server",
          container: "SLOWLOG",
          arguments: [{ name: "count", type: "integer", optional: true }],
          reply_schema: {
            type: "array",
            uniqueItems: true,
            items: { type: "array" },
          },
        },
      },
    });
    const { commands } = unifyAll(bundle);

    expect(commands.GET).toBeDefined();
    expect(commands.GET!.arguments[0]?.name).toBe("key");
    expect(commands.GET!.arguments[0]?.type).toBe("key");
    expect(commands.GET!.replies.resp3?.kind).toBe("oneOf");

    expect(commands["SLOWLOG GET"]).toBeDefined();
    expect(commands["SLOWLOG GET"]!.arguments[0]?.name).toBe("count");
    expect(commands["SLOWLOG GET"]!.replies.resp3?.kind).toBe("set");
  });

  test("argument tokens are canonicalized to uppercase wire form (GEODIST units, CLIENT LIST TYPE values)", () => {
    const bundle = emptyBundle({
      redisRepo: {
        GEODIST: {
          summary: "distance between members",
          since: "3.2.0",
          group: "geo",
          arguments: [
            { name: "key", type: "key", key_spec_index: 0 },
            { name: "member1", type: "string" },
            { name: "member2", type: "string" },
            {
              name: "unit",
              type: "oneof",
              optional: true,
              arguments: [
                { name: "m", type: "pure-token", token: "m" },
                { name: "km", type: "pure-token", token: "km" },
                { name: "ft", type: "pure-token", token: "ft" },
                { name: "mi", type: "pure-token", token: "mi" },
              ],
            },
          ],
        },
        "CLIENT LIST": {
          summary: "list connections",
          since: "2.4.0",
          group: "connection",
          container: "CLIENT",
          arguments: [
            {
              name: "client-type",
              token: "TYPE",
              type: "oneof",
              optional: true,
              arguments: [
                { name: "normal", type: "pure-token", token: "normal" },
                { name: "master", type: "pure-token", token: "master" },
                { name: "replica", type: "pure-token", token: "replica" },
                { name: "pubsub", type: "pure-token", token: "pubsub" },
              ],
            },
          ],
        },
      },
    });
    const { commands } = unifyAll(bundle);
    const geoUnits = commands.GEODIST!.arguments[3]?.arguments ?? [];
    expect(geoUnits.map((a) => a.token)).toEqual(["M", "KM", "FT", "MI"]);

    const clientType = commands["CLIENT LIST"]!.arguments[0]!;
    expect(clientType.token).toBe("TYPE");
    const types = clientType.arguments.map((a) => a.token);
    expect(types).toEqual(["NORMAL", "MASTER", "REPLICA", "PUBSUB"]);
  });

  test("MIGRATE empty-string sentinel token is preserved verbatim", () => {
    const bundle = emptyBundle({
      redisRepo: {
        MIGRATE: {
          summary: "atomic key transfer",
          since: "2.6.0",
          group: "generic",
          arguments: [
            {
              name: "key-selector",
              type: "oneof",
              arguments: [
                { name: "key", type: "key", key_spec_index: 0 },
                { name: "empty-string", type: "pure-token", token: '""' },
              ],
            },
          ],
        },
      },
    });
    const { commands } = unifyAll(bundle);
    const sentinel = commands.MIGRATE!.arguments[0]!.arguments[1]!;
    expect(sentinel.token).toBe('""');
  });

  test("empty-string token becomes null (no-op token slot)", () => {
    const bundle = emptyBundle({
      redisRepo: {
        FOO: {
          summary: "x",
          since: "1.0",
          group: "g",
          arguments: [{ name: "bar", type: "string", token: "" }],
        },
      },
    });
    const { commands } = unifyAll(bundle);
    expect(commands.FOO!.arguments[0]!.token).toBeNull();
  });

  test("stats reflect coverage", () => {
    const bundle = emptyBundle({
      redisRepo: {
        FOO: {
          summary: "x",
          since: "1.0",
          group: "g",
          reply_schema: { type: "integer" },
        },
      },
      docsPages: {
        FOO: {
          resp2: "[Integer reply]: foo",
          resp3: "[Integer reply]: foo",
          hasMultitabsSplit: false,
        },
      },
    });
    const { stats } = unifyAll(bundle);
    expect(stats.structuredFromSchema).toBe(1);
    expect(stats.resp3Coverage).toBe(1);
    expect(stats.resp2Coverage).toBe(0);
  });
});
