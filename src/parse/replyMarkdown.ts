import type { ReplyShape } from "../schema/replyShape.js";
import type { RawReturnInfo } from "../types.js";

/**
 * Extract the `## Return information` section from a `content/commands/*.md`
 * page and split it into RESP2/RESP3 chunks. Returns null when the page has
 * no return-info section.
 */
export function extractReturnInfo(markdown: string): RawReturnInfo | null {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const headingMatch = body.match(/(^|\n)##\s+Return information[^\n]*\n([\s\S]*?)(?=\n##\s|\n*$)/i);
  if (!headingMatch) return null;
  const section = headingMatch[2] ?? "";
  const multitabsMatch = section.match(
    /\{\{<\s*multitabs[^>]*>\}\}([\s\S]*?)\{\{<\s*\/multitabs\s*>\}\}/,
  );
  if (multitabsMatch) {
    const inner = multitabsMatch[1] ?? "";
    const parts = inner.split(/\n-tab-sep-\s*\n/);
    if (parts.length >= 2) {
      return {
        resp2: parts[0]?.trim() || null,
        resp3: parts.slice(1).join("\n-tab-sep-\n").trim() || null,
        hasMultitabsSplit: true,
      };
    }
    const single = inner.trim();
    return { resp2: single || null, resp3: single || null, hasMultitabsSplit: false };
  }
  const single = section.trim();
  return { resp2: single || null, resp3: single || null, hasMultitabsSplit: false };
}

/**
 * Convert a RESP-text chunk (one side of a multitabs block) into a
 * `ReplyShape`. Multiple bullet lines collapse into `{kind: "oneOf"}`.
 */
export function replyMarkdownToShape(chunk: string | null): ReplyShape | null {
  if (chunk == null) return null;
  const trimmed = chunk.trim();
  if (!trimmed) return null;
  const lines = trimmed.split(/\n/);
  const bulletStarts: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (/^\s*\*\s/.test(line)) bulletStarts.push(i);
  }
  if (bulletStarts.length >= 2) {
    const bullets = bulletStarts.map((start, idx) => {
      const end = bulletStarts[idx + 1] ?? lines.length;
      return lines.slice(start, end).join("\n").replace(/^\s*\*\s+/, "");
    });
    const variants = bullets
      .map((b) => parseSingleChunk(b))
      .filter((s): s is ReplyShape => s != null);
    if (variants.length > 1) {
      return { kind: "oneOf", variants, description: trimmed };
    }
    if (variants.length === 1) return variants[0] ?? null;
  }
  return parseSingleChunk(trimmed);
}

const TOKEN_PATTERNS: Array<[RegExp, (description: string | null) => ReplyShape]> = [
  [/\[\s*Null\s+(?:Bulk|Array|Set|Map)?\s*string?\s*reply\s*\]/i, (d) => ({ kind: "null", description: d })],
  [/\[\s*Nil\s+reply\s*\]/i, (d) => ({ kind: "null", description: d })],
  [/\[\s*Null\s+reply\s*\]/i, (d) => ({ kind: "null", description: d })],
  [/\[\s*Simple\s+string\s+reply\s*\]/i, (d) => ({ kind: "simpleString", description: d })],
  [/\[\s*Simple\s+error\s+reply\s*\]/i, (d) => ({ kind: "simpleError", description: d })],
  [/\[\s*Bulk\s+string\s+reply\s*\]/i, (d) => ({ kind: "bulkString", description: d })],
  [/\[\s*Verbatim\s+string\s+reply\s*\]/i, (d) => ({ kind: "verbatimString", description: d })],
  [/\[\s*Big\s+number\s+reply\s*\]/i, (d) => ({ kind: "bigNumber", description: d })],
  [/\[\s*Integer\s+reply\s*\]/i, (d) => ({ kind: "integer", description: d })],
  [/\[\s*Boolean\s+reply\s*\]/i, (d) => ({ kind: "boolean", description: d })],
  [/\[\s*Double\s+reply\s*\]/i, (d) => ({ kind: "double", description: d })],
  [/\[\s*Array\s+reply\s*\]/i, (d) => ({
    kind: "array",
    items: { kind: "unknown", rawText: "(unparsed)", description: null },
    description: d,
    minItems: null,
    maxItems: null,
  })],
  [/\[\s*Set\s+reply\s*\]/i, (d) => ({
    kind: "set",
    items: { kind: "unknown", rawText: "(unparsed)", description: null },
    description: d,
  })],
  [/\[\s*Map\s+reply\s*\]/i, (d) => ({
    kind: "map",
    key: { kind: "bulkString", description: null },
    value: { kind: "unknown", rawText: "(unparsed)", description: null },
    description: d,
  })],
  [/\[\s*Push\s+reply\s*\]/i, (d) => ({ kind: "push", items: [], description: d })],
];

function parseSingleChunk(chunk: string): ReplyShape | null {
  const trimmed = chunk.trim();
  if (!trimmed) return null;
  for (const [pattern, factory] of TOKEN_PATTERNS) {
    if (pattern.test(trimmed)) return factory(trimmed);
  }
  return { kind: "unknown", rawText: trimmed, description: null };
}

export function summarizeProtocolDiff(
  resp2: ReplyShape | null,
  resp3: ReplyShape | null,
  hadSplit: boolean,
): { differs: boolean; summary: string | null } {
  if (!hadSplit) return { differs: false, summary: null };
  if (!resp2 || !resp3) return { differs: false, summary: null };
  if (resp2.kind === resp3.kind) return { differs: false, summary: null };
  return {
    differs: true,
    summary: `RESP2 returns ${resp2.kind}; RESP3 returns ${resp3.kind}.`,
  };
}
