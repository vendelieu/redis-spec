import { z } from "zod";

const baseDescription = z.string().nullable().optional();

const simpleStringReply = z.object({
  kind: z.literal("simpleString"),
  value: z.string().nullable().optional(),
  description: baseDescription,
});

const simpleErrorReply = z.object({
  kind: z.literal("simpleError"),
  description: baseDescription,
});

const integerReply = z.object({
  kind: z.literal("integer"),
  minimum: z.number().nullable().optional(),
  maximum: z.number().nullable().optional(),
  description: baseDescription,
});

const doubleReply = z.object({
  kind: z.literal("double"),
  description: baseDescription,
});

const booleanReply = z.object({
  kind: z.literal("boolean"),
  description: baseDescription,
});

const bulkStringReply = z.object({
  kind: z.literal("bulkString"),
  encoding: z.enum(["utf-8", "binary"]).nullable().optional(),
  description: baseDescription,
});

const verbatimStringReply = z.object({
  kind: z.literal("verbatimString"),
  format: z.enum(["txt", "mkd"]).nullable().optional(),
  description: baseDescription,
});

const bigNumberReply = z.object({
  kind: z.literal("bigNumber"),
  description: baseDescription,
});

const nullReply = z.object({
  kind: z.literal("null"),
  description: baseDescription,
});

const unknownReply = z.object({
  kind: z.literal("unknown"),
  rawText: z.string(),
  description: baseDescription,
});

export type ReplyShape =
  | z.infer<typeof simpleStringReply>
  | z.infer<typeof simpleErrorReply>
  | z.infer<typeof integerReply>
  | z.infer<typeof doubleReply>
  | z.infer<typeof booleanReply>
  | z.infer<typeof bulkStringReply>
  | z.infer<typeof verbatimStringReply>
  | z.infer<typeof bigNumberReply>
  | z.infer<typeof nullReply>
  | z.infer<typeof unknownReply>
  | { kind: "array"; items: ReplyShape; minItems?: number | null; maxItems?: number | null; description?: string | null }
  | { kind: "set"; items: ReplyShape; description?: string | null }
  | { kind: "map"; key: ReplyShape; value: ReplyShape; description?: string | null }
  | { kind: "tuple"; items: ReplyShape[]; description?: string | null }
  | { kind: "oneOf"; variants: ReplyShape[]; description?: string | null }
  | { kind: "push"; items: ReplyShape[]; description?: string | null };

export const ReplyShapeSchema: z.ZodType<ReplyShape> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    simpleStringReply,
    simpleErrorReply,
    integerReply,
    doubleReply,
    booleanReply,
    bulkStringReply,
    verbatimStringReply,
    bigNumberReply,
    nullReply,
    unknownReply,
    z.object({
      kind: z.literal("array"),
      items: ReplyShapeSchema,
      minItems: z.number().nullable().optional(),
      maxItems: z.number().nullable().optional(),
      description: baseDescription,
    }),
    z.object({
      kind: z.literal("set"),
      items: ReplyShapeSchema,
      description: baseDescription,
    }),
    z.object({
      kind: z.literal("map"),
      key: ReplyShapeSchema,
      value: ReplyShapeSchema,
      description: baseDescription,
    }),
    z.object({
      kind: z.literal("tuple"),
      items: z.array(ReplyShapeSchema),
      description: baseDescription,
    }),
    z.object({
      kind: z.literal("oneOf"),
      variants: z.array(ReplyShapeSchema),
      description: baseDescription,
    }),
    z.object({
      kind: z.literal("push"),
      items: z.array(ReplyShapeSchema),
      description: baseDescription,
    }),
  ]),
);

export const ALL_REPLY_KINDS = [
  "simpleString",
  "simpleError",
  "integer",
  "double",
  "boolean",
  "bulkString",
  "verbatimString",
  "bigNumber",
  "null",
  "array",
  "set",
  "map",
  "tuple",
  "oneOf",
  "push",
  "unknown",
] as const;

export type ReplyKind = (typeof ALL_REPLY_KINDS)[number];
