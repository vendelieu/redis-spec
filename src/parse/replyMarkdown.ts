import { fromMarkdown } from "mdast-util-from-markdown";
import type { List, ListItem, Nodes, Root, RootContent } from "mdast";
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
 * Convert a RESP-text chunk into a `ReplyShape` by walking the markdown AST.
 * Each markdown link `[X reply](url)` is a structural classifier; every list
 * item is a candidate variant in a `oneOf`. Plain-text fallback handles legacy
 * pages that mention reply types without markdown link syntax.
 */
export function replyMarkdownToShape(chunk: string | null): ReplyShape | null {
  if (chunk == null) return null;
  const trimmed = chunk.trim();
  if (!trimmed) return null;
  const root = fromMarkdown(trimmed);
  return rootToShape(root, trimmed);
}

type TokenFactory = (description: string | null) => ReplyShape;

const SCALAR_LABELS: Record<string, TokenFactory> = {
  "null bulk string reply": (d) => ({ kind: "null", description: d }),
  "null array reply": (d) => ({ kind: "null", description: d }),
  "null set reply": (d) => ({ kind: "null", description: d }),
  "null map reply": (d) => ({ kind: "null", description: d }),
  "null reply": (d) => ({ kind: "null", description: d }),
  "nil reply": (d) => ({ kind: "null", description: d }),
  "simple string reply": (d) => ({ kind: "simpleString", description: d }),
  "simple error reply": (d) => ({ kind: "simpleError", description: d }),
  "bulk string reply": (d) => ({ kind: "bulkString", description: d }),
  "verbatim string reply": (d) => ({ kind: "verbatimString", description: d }),
  "big number reply": (d) => ({ kind: "bigNumber", description: d }),
  "integer reply": (d) => ({ kind: "integer", description: d }),
  "boolean reply": (d) => ({ kind: "boolean", description: d }),
  "double reply": (d) => ({ kind: "double", description: d }),
};

const CONTAINER_LABELS: Record<string, "array" | "set" | "map" | "push"> = {
  "array reply": "array",
  "set reply": "set",
  "map reply": "map",
  "push reply": "push",
};

const FALLBACK_TOKEN_PATTERNS: Array<[RegExp, TokenFactory]> = [
  [/\bNull\s+(?:Bulk|Array|Set|Map)?\s*string?\s*reply\b/i, (d) => ({ kind: "null", description: d })],
  [/\bNil\s+reply\b/i, (d) => ({ kind: "null", description: d })],
  [/\bNull\s+reply\b/i, (d) => ({ kind: "null", description: d })],
  [/\bSimple\s+string\s+reply\b/i, (d) => ({ kind: "simpleString", description: d })],
  [/\bSimple\s+error\s+reply\b/i, (d) => ({ kind: "simpleError", description: d })],
  [/\bBulk\s+string\s+reply\b/i, (d) => ({ kind: "bulkString", description: d })],
  [/\bVerbatim\s+string\s+reply\b/i, (d) => ({ kind: "verbatimString", description: d })],
  [/\bBig\s+number\s+reply\b/i, (d) => ({ kind: "bigNumber", description: d })],
  [/\bInteger\s+reply\b/i, (d) => ({ kind: "integer", description: d })],
  [/\bBoolean\s+reply\b/i, (d) => ({ kind: "boolean", description: d })],
  [/\bDouble\s+reply\b/i, (d) => ({ kind: "double", description: d })],
];

const FALLBACK_CONTAINER_PATTERNS: Array<[RegExp, "array" | "set" | "map" | "push"]> = [
  [/\bArray\s+reply\b/i, "array"],
  [/\bSet\s+reply\b/i, "set"],
  [/\bMap\s+reply\b/i, "map"],
  [/\bPush\s+reply\b/i, "push"],
];

function rootToShape(root: Root, fullText: string): ReplyShape | null {
  const topList = root.children.find((c): c is List => c.type === "list");
  if (topList) {
    const variants = expandListItems(topList);
    if (variants.length === 0) {
      return classifyFromContainer(root, fullText);
    }
    if (variants.length === 1) return variants[0]!;
    return { kind: "oneOf", variants, description: fullText };
  }
  return classifyFromContainer(root, fullText);
}

function expandListItems(list: List): ReplyShape[] {
  const variants: ReplyShape[] = [];
  for (const item of list.children) {
    const nested = item.children.find((c): c is List => c.type === "list");
    if (nested) {
      const inner = expandListItems(nested);
      if (inner.length > 0) {
        variants.push(...inner);
        continue;
      }
    }
    const itemText = nodeText(item).trim();
    const shape = classifyFromContainer(item, itemText);
    if (shape) variants.push(shape);
  }
  return variants;
}

function classifyFromContainer(node: Root | ListItem, fullText: string): ReplyShape | null {
  const labels = collectLinkLabels(node).map(normalizeLabel);
  const fromLinks = classifyFromLabels(labels, fullText);
  if (fromLinks) return fromLinks;
  return classifyFromPlainText(fullText);
}

function classifyFromLabels(labels: string[], fullText: string): ReplyShape | null {
  if (labels.length === 0) return null;
  const first = labels[0]!;
  if (first in CONTAINER_LABELS) {
    const containerKind = CONTAINER_LABELS[first]!;
    const innerLabel = labels.slice(1).find((l) => l in SCALAR_LABELS);
    const innerShape = innerLabel ? SCALAR_LABELS[innerLabel]!(null) : null;
    return buildContainer(containerKind, innerShape, fullText);
  }
  if (first in SCALAR_LABELS) {
    return SCALAR_LABELS[first]!(fullText);
  }
  return null;
}

function classifyFromPlainText(text: string): ReplyShape {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "unknown", rawText: "", description: null };
  let containerHit: { index: number; kind: "array" | "set" | "map" | "push" } | null = null;
  for (const [pattern, kind] of FALLBACK_CONTAINER_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m?.index != null && (containerHit == null || m.index < containerHit.index)) {
      containerHit = { index: m.index, kind };
    }
  }
  let scalarHit: { index: number; factory: TokenFactory } | null = null;
  for (const [pattern, factory] of FALLBACK_TOKEN_PATTERNS) {
    const m = trimmed.match(pattern);
    if (m?.index != null && (scalarHit == null || m.index < scalarHit.index)) {
      scalarHit = { index: m.index, factory };
    }
  }
  if (containerHit && (!scalarHit || containerHit.index <= scalarHit.index)) {
    const innerStart = containerHit.index;
    const tail = trimmed.slice(innerStart + 1);
    let inner: ReplyShape | null = null;
    for (const [pattern, factory] of FALLBACK_TOKEN_PATTERNS) {
      if (pattern.test(tail)) {
        inner = factory(null);
        break;
      }
    }
    return buildContainer(containerHit.kind, inner, trimmed);
  }
  if (scalarHit) return scalarHit.factory(trimmed);
  return { kind: "unknown", rawText: trimmed, description: null };
}

function buildContainer(
  kind: "array" | "set" | "map" | "push",
  inner: ReplyShape | null,
  description: string,
): ReplyShape {
  const fallback: ReplyShape = { kind: "unknown", rawText: "(unparsed)", description: null };
  if (kind === "array") {
    return { kind: "array", items: inner ?? fallback, description, minItems: null, maxItems: null };
  }
  if (kind === "set") {
    return { kind: "set", items: inner ?? fallback, description };
  }
  if (kind === "map") {
    return {
      kind: "map",
      key: { kind: "bulkString", description: null },
      value: inner ?? fallback,
      description,
    };
  }
  return { kind: "push", items: [], description };
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function collectLinkLabels(node: Nodes | RootContent): string[] {
  const out: string[] = [];
  walk(node);
  return out;

  function walk(n: Nodes | RootContent): void {
    if ((n as { type: string }).type === "link") {
      out.push(nodeText(n));
      return;
    }
    const children = (n as { children?: ReadonlyArray<Nodes | RootContent> }).children;
    if (children) {
      for (const c of children) walk(c);
    }
  }
}

function nodeText(node: Nodes | RootContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  const children = (node as { children?: ReadonlyArray<Nodes | RootContent> }).children;
  if (children) return children.map(nodeText).join("");
  return "";
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
