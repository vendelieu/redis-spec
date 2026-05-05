import type { ReplyShape } from "../schema/replyShape.js";

/**
 * Convert a `redis/redis` `reply_schema` JSON-Schema fragment into a
 * `ReplyShape`. Returns `null` only when the input itself is null/undefined;
 * unrecognized fragments yield `{kind: "unknown"}` so coverage gaps are
 * visible in the build report.
 */
export function replySchemaToShape(node: unknown): ReplyShape | null {
  if (node == null) return null;
  if (typeof node !== "object") return unknown(node);
  const obj = node as Record<string, unknown>;
  const description = typeof obj.description === "string" ? obj.description : null;

  if (Array.isArray(obj.oneOf)) {
    return {
      kind: "oneOf",
      variants: obj.oneOf.map((v) => replySchemaToShape(v) ?? unknown(v)),
      description,
    };
  }
  if (Array.isArray(obj.anyOf)) {
    return {
      kind: "oneOf",
      variants: obj.anyOf.map((v) => replySchemaToShape(v) ?? unknown(v)),
      description,
    };
  }

  if (typeof obj.const === "string") {
    return { kind: "simpleString", value: obj.const, description };
  }

  const t = obj.type;
  if (t === "null") return { kind: "null", description };
  if (t === "string") return { kind: "bulkString", description };
  if (t === "number") return { kind: "double", description };
  if (t === "boolean") return { kind: "boolean", description };

  if (t === "integer") {
    const minimum = typeof obj.minimum === "number" ? obj.minimum : null;
    const maximum = typeof obj.maximum === "number" ? obj.maximum : null;
    if (minimum === 0 && maximum === 1) return { kind: "boolean", description };
    return { kind: "integer", minimum, maximum, description };
  }

  if (t === "array") {
    if (Array.isArray(obj.items)) {
      return {
        kind: "tuple",
        items: obj.items.map((it) => replySchemaToShape(it) ?? unknown(it)),
        description,
      };
    }
    const items = replySchemaToShape(obj.items) ?? { kind: "unknown", rawText: "(missing items)", description: null };
    if (obj.uniqueItems === true) {
      return { kind: "set", items, description };
    }
    const minItems = typeof obj.minItems === "number" ? obj.minItems : null;
    const maxItems = typeof obj.maxItems === "number" ? obj.maxItems : null;
    return { kind: "array", items, minItems, maxItems, description };
  }

  if (t === "object") {
    if (obj.additionalProperties && obj.additionalProperties !== false) {
      const value = replySchemaToShape(obj.additionalProperties) ?? {
        kind: "unknown",
        rawText: "(missing additionalProperties)",
        description: null,
      };
      return {
        kind: "map",
        key: { kind: "bulkString", description: null },
        value,
        description,
      };
    }
    if (obj.properties && typeof obj.properties === "object") {
      const props = obj.properties as Record<string, unknown>;
      const required = Array.isArray(obj.required) ? new Set(obj.required as string[]) : new Set<string>();
      const allRequired = Object.keys(props).every((k) => required.has(k));
      if (allRequired) {
        return {
          kind: "tuple",
          items: Object.values(props).map((v) => replySchemaToShape(v) ?? unknown(v)),
          description,
        };
      }
      return {
        kind: "map",
        key: { kind: "bulkString", description: null },
        value: { kind: "unknown", rawText: JSON.stringify(props), description: null },
        description,
      };
    }
    return {
      kind: "map",
      key: { kind: "bulkString", description: null },
      value: { kind: "unknown", rawText: "(open object)", description: null },
      description,
    };
  }

  return unknown(node);
}

function unknown(value: unknown): ReplyShape {
  return { kind: "unknown", rawText: safeStringify(value), description: null };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
