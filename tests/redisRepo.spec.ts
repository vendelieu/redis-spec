import { describe, expect, test } from "bun:test";
import {
  accumulateRedisRepoCommands,
  canonicalCommandName,
} from "../src/sources/redisRepo.js";
import type { CommandMap, RawCommandFromRedisRepo } from "../src/types.js";

describe("canonicalCommandName", () => {
  test("top-level command keeps its name uppercased", () => {
    expect(canonicalCommandName("get", undefined)).toBe("GET");
  });

  test("subcommand prepends container", () => {
    expect(canonicalCommandName("exists", "script")).toBe("SCRIPT EXISTS");
  });

  test("uppercased input still produces the same canonical name", () => {
    expect(canonicalCommandName("EXISTS", "SCRIPT")).toBe("SCRIPT EXISTS");
  });
});

describe("accumulateRedisRepoCommands", () => {
  test("subcommand JSON does not clobber real top-level command of the same short name", () => {
    const out: CommandMap<RawCommandFromRedisRepo> = {};

    const realExists: RawCommandFromRedisRepo = {
      summary: "Determine if a key exists",
      since: "1.0.0",
      group: "generic",
      arity: -2,
      arguments: [{ name: "key", type: "key", multiple: true, key_spec_index: 0 }],
    };

    const scriptExists: RawCommandFromRedisRepo = {
      summary: "Check existence of scripts in the script cache.",
      since: "2.6.0",
      group: "scripting",
      container: "SCRIPT",
      arguments: [{ name: "sha1", type: "string", multiple: true }],
    };

    accumulateRedisRepoCommands({ EXISTS: realExists }, out);
    accumulateRedisRepoCommands({ EXISTS: scriptExists }, out);

    expect(out.EXISTS).toBeDefined();
    expect(out.EXISTS).toBe(realExists);
    expect(out.EXISTS!.arguments?.[0]?.name).toBe("key");

    expect(out["SCRIPT EXISTS"]).toBeDefined();
    expect(out["SCRIPT EXISTS"]).toBe(scriptExists);
    expect(out["SCRIPT EXISTS"]!.arguments?.[0]?.name).toBe("sha1");
  });

  test("config-get does not overwrite real GET", () => {
    const out: CommandMap<RawCommandFromRedisRepo> = {};

    const realGet: RawCommandFromRedisRepo = {
      summary: "Get the value of a key",
      since: "1.0.0",
      group: "string",
      arity: 2,
      arguments: [{ name: "key", type: "key", key_spec_index: 0 }],
    };

    const configGet: RawCommandFromRedisRepo = {
      summary: "Get the values of configuration parameters",
      since: "2.0.0",
      group: "server",
      container: "CONFIG",
      arguments: [{ name: "parameter", type: "string", multiple: true }],
    };

    accumulateRedisRepoCommands({ GET: configGet }, out);
    accumulateRedisRepoCommands({ GET: realGet }, out);

    expect(out.GET!.arguments?.[0]?.name).toBe("key");
    expect(out["CONFIG GET"]!.arguments?.[0]?.name).toBe("parameter");
  });

  test("collision-prone trio: EXISTS / SCRIPT EXISTS / OBJECT FREQ all coexist", () => {
    const out: CommandMap<RawCommandFromRedisRepo> = {};
    accumulateRedisRepoCommands(
      { EXISTS: { group: "generic", arguments: [{ name: "key", type: "key" }] } },
      out,
    );
    accumulateRedisRepoCommands(
      {
        EXISTS: {
          group: "scripting",
          container: "SCRIPT",
          arguments: [{ name: "sha1", type: "string", multiple: true }],
        },
      },
      out,
    );
    accumulateRedisRepoCommands(
      {
        FREQ: {
          group: "generic",
          container: "OBJECT",
          arguments: [{ name: "key", type: "key" }],
        },
      },
      out,
    );
    expect(Object.keys(out).sort()).toEqual(["EXISTS", "OBJECT FREQ", "SCRIPT EXISTS"]);
  });
});
