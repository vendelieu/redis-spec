import { describe, expect, test } from "bun:test";
import { replySchemaToShape } from "../src/parse/replySchema.js";

describe("replySchemaToShape", () => {
  test("null input", () => {
    expect(replySchemaToShape(null)).toBeNull();
    expect(replySchemaToShape(undefined)).toBeNull();
  });

  test("simple integer (INCR)", () => {
    const result = replySchemaToShape({ description: "v", type: "integer" });
    expect(result).toEqual({ kind: "integer", minimum: null, maximum: null, description: "v" });
  });

  test("integer with bounds 0..1 → boolean", () => {
    const result = replySchemaToShape({ type: "integer", minimum: 0, maximum: 1 });
    expect(result).toEqual({ kind: "boolean", description: null });
  });

  test("string", () => {
    expect(replySchemaToShape({ type: "string" })).toEqual({ kind: "bulkString", description: null });
  });

  test("null", () => {
    expect(replySchemaToShape({ type: "null" })).toEqual({ kind: "null", description: null });
  });

  test("const OK", () => {
    expect(replySchemaToShape({ const: "OK" })).toEqual({
      kind: "simpleString",
      value: "OK",
      description: null,
    });
  });

  test("oneOf — GET returns string|null", () => {
    const r = replySchemaToShape({
      oneOf: [{ type: "string" }, { type: "null" }],
    });
    expect(r).toEqual({
      kind: "oneOf",
      variants: [
        { kind: "bulkString", description: null },
        { kind: "null", description: null },
      ],
      description: null,
    });
  });

  test("anyOf treated as oneOf — SET", () => {
    const r = replySchemaToShape({
      anyOf: [{ type: "null" }, { const: "OK" }, { type: "string" }],
    });
    expect((r as { kind: string }).kind).toBe("oneOf");
  });

  test("array of strings — MGET-like", () => {
    const r = replySchemaToShape({
      type: "array",
      minItems: 1,
      items: { oneOf: [{ type: "string" }, { type: "null" }] },
    });
    expect(r).toEqual({
      kind: "array",
      items: {
        kind: "oneOf",
        variants: [
          { kind: "bulkString", description: null },
          { kind: "null", description: null },
        ],
        description: null,
      },
      minItems: 1,
      maxItems: null,
      description: null,
    });
  });

  test("array uniqueItems → set", () => {
    const r = replySchemaToShape({ type: "array", uniqueItems: true, items: { type: "string" } });
    expect(r).toEqual({
      kind: "set",
      items: { kind: "bulkString", description: null },
      description: null,
    });
  });

  test("positional array items → tuple", () => {
    const r = replySchemaToShape({
      type: "array",
      items: [{ type: "string" }, { type: "integer" }],
    });
    expect((r as { kind: string }).kind).toBe("tuple");
    expect((r as { items: unknown[] }).items.length).toBe(2);
  });

  test("object with additionalProperties → map (HGETALL)", () => {
    const r = replySchemaToShape({
      type: "object",
      additionalProperties: { type: "string" },
      description: "hash",
    });
    expect(r).toEqual({
      kind: "map",
      key: { kind: "bulkString", description: null },
      value: { kind: "bulkString", description: null },
      description: "hash",
    });
  });

  test("unrecognized fragment → unknown with rawText", () => {
    const r = replySchemaToShape({ weirdShape: 42 });
    expect((r as { kind: string }).kind).toBe("unknown");
    expect((r as { rawText: string }).rawText).toContain("weirdShape");
  });
});
