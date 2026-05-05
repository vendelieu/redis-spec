import { describe, expect, test } from "bun:test";
import { nameToSlug, slugToName } from "../src/parse/slug.js";

describe("nameToSlug", () => {
  test("top-level commands lowercase", () => {
    expect(nameToSlug("GET")).toBe("get");
    expect(nameToSlug("INCR")).toBe("incr");
  });

  test("spaced subcommands → hyphens", () => {
    expect(nameToSlug("ACL CAT")).toBe("acl-cat");
    expect(nameToSlug("CLUSTER SHARDS")).toBe("cluster-shards");
    expect(nameToSlug("CLIENT NO-EVICT")).toBe("client-no-evict");
  });

  test("dotted module commands preserve dots", () => {
    expect(nameToSlug("BF.ADD")).toBe("bf.add");
    expect(nameToSlug("JSON.GET")).toBe("json.get");
    expect(nameToSlug("FT.CREATE")).toBe("ft.create");
    expect(nameToSlug("TS.ADD")).toBe("ts.add");
  });
});

describe("slugToName", () => {
  const known = new Set([
    "GET",
    "ACL CAT",
    "BF.ADD",
    "CLIENT NO-EVICT",
    "JSON.GET",
    "FT.CREATE",
  ]);

  test("matches direct top-level slug", () => {
    expect(slugToName("get", known)).toBe("GET");
  });

  test("expands single hyphen to space for subcommand", () => {
    expect(slugToName("acl-cat", known)).toBe("ACL CAT");
  });

  test("preserves dots", () => {
    expect(slugToName("bf.add", known)).toBe("BF.ADD");
    expect(slugToName("json.get", known)).toBe("JSON.GET");
    expect(slugToName("ft.create", known)).toBe("FT.CREATE");
  });

  test("disambiguates intra-word hyphens", () => {
    expect(slugToName("client-no-evict", known)).toBe("CLIENT NO-EVICT");
  });

  test("returns null for unknown slug", () => {
    expect(slugToName("nonsense", known)).toBeNull();
  });
});
