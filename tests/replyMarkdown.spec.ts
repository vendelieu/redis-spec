import { describe, expect, test } from "bun:test";
import { extractReturnInfo, replyMarkdownToShape } from "../src/parse/replyMarkdown.js";

const incrPage = `---
group: string
---

## Return information

{{< multitabs id="incr-return-info" tab1="RESP2" tab2="RESP3" >}}

[Integer reply](../../develop/reference/protocol-spec#integers): the value of the key after the increment.

-tab-sep-

[Integer reply](../../develop/reference/protocol-spec#integers): the value of the key after the increment.

{{< /multitabs >}}
`;

const hgetallPage = `---
group: hash
---

## Return information

{{< multitabs id="hgetall-return-info" tab1="RESP2" tab2="RESP3" >}}

[Array reply](../../develop/reference/protocol-spec#arrays): a list of fields and their values, or an empty list when key does not exist.

-tab-sep-

[Map reply](../../develop/reference/protocol-spec#maps): a map of fields and their values, or an empty list when key does not exist.

{{< /multitabs >}}
`;

const setPage = `---
group: string
---

## Return information

{{< multitabs id="set-return-info" tab1="RESP2" tab2="RESP3" >}}

* If \`GET\` was not specified, one of the following:
  * [Null bulk string reply](../../develop/reference/protocol-spec#bulk-strings) when condition was not met.
  * [Simple string reply](../../develop/reference/protocol-spec#simple-strings): \`OK\` when set succeeded.

-tab-sep-

* [Bulk string reply](../../develop/reference/protocol-spec#bulk-strings): the previous value when GET was given.

{{< /multitabs >}}
`;

const moduleSinglePage = `---
group: json
---

## Return information

[Integer reply](../../develop/reference/protocol-spec#integers): the number of paths deleted.
`;

describe("extractReturnInfo", () => {
  test("incr — both protocols share Integer reply", () => {
    const ri = extractReturnInfo(incrPage)!;
    expect(ri.hasMultitabsSplit).toBe(true);
    expect(ri.resp2).toContain("Integer reply");
    expect(ri.resp3).toContain("Integer reply");
  });

  test("hgetall — RESP2 array, RESP3 map", () => {
    const ri = extractReturnInfo(hgetallPage)!;
    expect(ri.hasMultitabsSplit).toBe(true);
    expect(ri.resp2).toContain("Array reply");
    expect(ri.resp3).toContain("Map reply");
  });

  test("legacy / module page without multitabs", () => {
    const ri = extractReturnInfo(moduleSinglePage)!;
    expect(ri.hasMultitabsSplit).toBe(false);
    expect(ri.resp2).toBe(ri.resp3);
    expect(ri.resp2).toContain("Integer reply");
  });

  test("returns null when section missing", () => {
    const ri = extractReturnInfo("---\nfoo: bar\n---\n\n## Examples\nblah\n");
    expect(ri).toBeNull();
  });
});

describe("replyMarkdownToShape", () => {
  test("integer", () => {
    const ri = extractReturnInfo(incrPage)!;
    expect(replyMarkdownToShape(ri.resp2)).toEqual(expect.objectContaining({ kind: "integer" }));
    expect(replyMarkdownToShape(ri.resp3)).toEqual(expect.objectContaining({ kind: "integer" }));
  });

  test("hgetall RESP2 array vs RESP3 map", () => {
    const ri = extractReturnInfo(hgetallPage)!;
    expect((replyMarkdownToShape(ri.resp2) as { kind: string }).kind).toBe("array");
    expect((replyMarkdownToShape(ri.resp3) as { kind: string }).kind).toBe("map");
  });

  test("set RESP2 chunk → oneOf of null + simpleString", () => {
    const ri = extractReturnInfo(setPage)!;
    const r = replyMarkdownToShape(ri.resp2) as { kind: string; variants?: Array<{ kind: string }> };
    expect(r.kind).toBe("oneOf");
    expect(r.variants?.length).toBeGreaterThanOrEqual(2);
    const kinds = r.variants?.map((v) => v.kind) ?? [];
    expect(kinds).toContain("null");
    expect(kinds).toContain("simpleString");
  });

  test("null bulk string reply maps to null", () => {
    const r = replyMarkdownToShape("[Null bulk string reply](url): not present");
    expect(r).toEqual(expect.objectContaining({ kind: "null" }));
  });

  test("verbatim string reply", () => {
    const r = replyMarkdownToShape("[Verbatim string reply](url): the info");
    expect(r).toEqual(expect.objectContaining({ kind: "verbatimString" }));
  });

  test("big number reply", () => {
    const r = replyMarkdownToShape("[Big number reply](url): a big int");
    expect(r).toEqual(expect.objectContaining({ kind: "bigNumber" }));
  });

  test("unknown chunk → unknown shape", () => {
    const r = replyMarkdownToShape("Returns whatever you fancy.");
    expect(r).toEqual(expect.objectContaining({ kind: "unknown" }));
  });

  test("empty / null returns null", () => {
    expect(replyMarkdownToShape(null)).toBeNull();
    expect(replyMarkdownToShape("")).toBeNull();
  });

  test("array of bulk strings — container wins over inner element mention", () => {
    const r = replyMarkdownToShape(
      "[Array reply](../../develop/reference/protocol-spec#arrays): an array of [Bulk string reply](../../develop/reference/protocol-spec#bulk-strings) elements representing ACL categories or commands in a given category.",
    ) as { kind: string; items?: { kind: string } };
    expect(r.kind).toBe("array");
    expect(r.items?.kind).toBe("bulkString");
  });

  test("set of integers — earliest container token wins", () => {
    const r = replyMarkdownToShape(
      "[Set reply](url): a set of [Integer reply](url) elements.",
    ) as { kind: string; items?: { kind: string } };
    expect(r.kind).toBe("set");
    expect(r.items?.kind).toBe("integer");
  });

  test("map with bulk string values", () => {
    const r = replyMarkdownToShape(
      "[Map reply](url): a map whose values are [Bulk string reply](url).",
    ) as { kind: string; value?: { kind: string }; key?: { kind: string } };
    expect(r.kind).toBe("map");
    expect(r.value?.kind).toBe("bulkString");
    expect(r.key?.kind).toBe("bulkString");
  });

  test("plain-text fallback (no markdown links) still resolves Integer reply", () => {
    const r = replyMarkdownToShape("Integer reply: the count.") as { kind: string };
    expect(r.kind).toBe("integer");
  });

  test("plain-text fallback: array of bulk strings (no link syntax)", () => {
    const r = replyMarkdownToShape(
      "Array reply: an array of Bulk string reply elements.",
    ) as { kind: string; items?: { kind: string } };
    expect(r.kind).toBe("array");
    expect(r.items?.kind).toBe("bulkString");
  });

  test("nested oneOf inside list item — flattens into top-level oneOf", () => {
    const chunk = `* If \`GET\` was not specified, one of the following:
  * [Null bulk string reply](url) when condition was not met.
  * [Simple string reply](url): \`OK\` when set succeeded.
* [Bulk string reply](url): the previous value when GET was given.`;
    const r = replyMarkdownToShape(chunk) as {
      kind: string;
      variants?: Array<{ kind: string }>;
    };
    expect(r.kind).toBe("oneOf");
    const kinds = r.variants?.map((v) => v.kind) ?? [];
    expect(kinds).toContain("null");
    expect(kinds).toContain("simpleString");
    expect(kinds).toContain("bulkString");
  });

  test("oneOf variant: array reply with inner bulk string mention parses as array", () => {
    const chunk = `* [Array reply](url): an array of [Bulk string reply](url) elements.
* [Simple error reply](url): error on bad input.`;
    const r = replyMarkdownToShape(chunk) as {
      kind: string;
      variants?: Array<{ kind: string; items?: { kind: string } }>;
    };
    expect(r.kind).toBe("oneOf");
    const arrayVariant = r.variants?.find((v) => v.kind === "array");
    expect(arrayVariant).toBeDefined();
    expect(arrayVariant?.items?.kind).toBe("bulkString");
    expect(r.variants?.some((v) => v.kind === "simpleError")).toBe(true);
  });
});
