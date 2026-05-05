import { describe, expect, test } from "bun:test";
import { unifyAll } from "../src/merge/unify.js";
import type { SourceBundle } from "../src/types.js";

function emptyBundle(overrides: Partial<SourceBundle> = {}): SourceBundle {
  return {
    redisRepo: {},
    docsCore: {},
    docsModules: { redisjson: {}, redisbloom: {}, redisearch: {}, redistimeseries: {} },
    docsPages: {},
    sentinel: null,
    shas: { redisRepoSha: "x", redisDocsSha: "y", redisRepoTag: null },
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
