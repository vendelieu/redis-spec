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
});
