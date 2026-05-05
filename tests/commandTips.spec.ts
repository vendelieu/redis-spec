import { describe, expect, test } from "bun:test";
import { emptyCommandTips, parseCommandTips } from "../src/parse/commandTips.js";

describe("parseCommandTips", () => {
  test("empty list", () => {
    expect(parseCommandTips([])).toEqual(emptyCommandTips());
  });

  test("nondeterministic flags", () => {
    const t = parseCommandTips(["NONDETERMINISTIC_OUTPUT_ORDER"]);
    expect(t.nondeterministicOutputOrder).toBe(true);
    expect(t.nondeterministicOutput).toBe(false);
    expect(t.requestPolicy).toBeNull();
    expect(t.responsePolicy).toBeNull();
  });

  test("request policies", () => {
    for (const p of ["ALL_NODES", "ALL_SHARDS", "MULTI_SHARD", "SPECIAL"] as const) {
      const t = parseCommandTips([`REQUEST_POLICY:${p}`]);
      expect(t.requestPolicy).toBe(p);
    }
  });

  test("response policies", () => {
    for (const p of [
      "ONE_SUCCEEDED",
      "ALL_SUCCEEDED",
      "AGG_LOGICAL_AND",
      "AGG_LOGICAL_OR",
      "AGG_MIN",
      "AGG_MAX",
      "AGG_SUM",
      "SPECIAL",
    ] as const) {
      const t = parseCommandTips([`RESPONSE_POLICY:${p}`]);
      expect(t.responsePolicy).toBe(p);
    }
  });

  test("compound — observed real value (SCAN)", () => {
    const t = parseCommandTips([
      "NONDETERMINISTIC_OUTPUT",
      "REQUEST_POLICY:SPECIAL",
      "RESPONSE_POLICY:SPECIAL",
    ]);
    expect(t).toEqual({
      nondeterministicOutput: true,
      nondeterministicOutputOrder: false,
      requestPolicy: "SPECIAL",
      responsePolicy: "SPECIAL",
      raw: [
        "NONDETERMINISTIC_OUTPUT",
        "REQUEST_POLICY:SPECIAL",
        "RESPONSE_POLICY:SPECIAL",
      ],
    });
  });

  test("WAIT — REQUEST ALL_SHARDS + RESPONSE AGG_MIN", () => {
    const t = parseCommandTips(["REQUEST_POLICY:ALL_SHARDS", "RESPONSE_POLICY:AGG_MIN"]);
    expect(t.requestPolicy).toBe("ALL_SHARDS");
    expect(t.responsePolicy).toBe("AGG_MIN");
  });

  test("unknown enum value yields null but preserves raw", () => {
    const t = parseCommandTips(["REQUEST_POLICY:NEW_FUTURE_VALUE"]);
    expect(t.requestPolicy).toBeNull();
    expect(t.raw).toEqual(["REQUEST_POLICY:NEW_FUTURE_VALUE"]);
  });
});
