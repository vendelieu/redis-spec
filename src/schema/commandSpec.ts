import { z } from "zod";
import { ReplyShapeSchema } from "./replyShape.js";

export const ModuleEnum = z
  .enum(["redisjson", "redisbloom", "redisearch", "redistimeseries", "sentinel"])
  .nullable();

const RequestPolicyEnum = z
  .enum(["ALL_NODES", "ALL_SHARDS", "MULTI_SHARD", "SPECIAL"])
  .nullable();

const ResponsePolicyEnum = z
  .enum([
    "ONE_SUCCEEDED",
    "ALL_SUCCEEDED",
    "AGG_LOGICAL_AND",
    "AGG_LOGICAL_OR",
    "AGG_MIN",
    "AGG_MAX",
    "AGG_SUM",
    "SPECIAL",
  ])
  .nullable();

export const CommandTipsSchema = z.object({
  nondeterministicOutput: z.boolean(),
  nondeterministicOutputOrder: z.boolean(),
  requestPolicy: RequestPolicyEnum,
  responsePolicy: ResponsePolicyEnum,
  raw: z.array(z.string()),
});

export const HistoryEntrySchema = z.object({
  since: z.string(),
  note: z.string(),
});

export const ReplacedBySchema = z
  .object({
    command: z.string(),
    since: z.string().nullable(),
  })
  .nullable();

export const FindKeysSpecSchema = z.object({
  lastKey: z.number().nullable(),
  keyStep: z.number().nullable(),
  limit: z.number().nullable(),
  firstKey: z.number().nullable(),
  keyNumIdx: z.number().nullable(),
});

export const FindKeysSchema = z.object({
  type: z.enum(["range", "keynum", "unknown"]),
  spec: FindKeysSpecSchema,
});

export const BeginSearchSpecSchema = z.object({
  index: z.number().nullable(),
  keyword: z.string().nullable(),
  startFrom: z.number().nullable(),
});

export const BeginSearchSchema = z.object({
  type: z.enum(["index", "keyword", "unknown"]),
  spec: BeginSearchSpecSchema,
});

export const KeySpecSchema = z.object({
  notes: z.string().nullable(),
  beginSearch: BeginSearchSchema,
  findKeys: FindKeysSchema,
  RW: z.boolean(),
  RO: z.boolean(),
  OW: z.boolean(),
  access: z.boolean(),
  update: z.boolean(),
  insert: z.boolean(),
  delete: z.boolean(),
  incomplete: z.boolean(),
});

export const ArgumentTypeEnum = z.enum([
  "key",
  "string",
  "integer",
  "double",
  "unix-time",
  "pure-token",
  "oneof",
  "block",
  "pattern",
  "unknown",
]);

export type CommandArgument = {
  name: string;
  displayText: string | null;
  type: z.infer<typeof ArgumentTypeEnum>;
  token: string | null;
  since: string | null;
  deprecatedSince: string | null;
  summary: string | null;
  optional: boolean;
  multiple: boolean;
  multipleToken: boolean;
  keySpecIndex: number | null;
  arguments: CommandArgument[];
};

export const CommandArgumentSchema: z.ZodType<CommandArgument> = z.lazy(() =>
  z.object({
    name: z.string(),
    displayText: z.string().nullable(),
    type: ArgumentTypeEnum,
    token: z.string().nullable(),
    since: z.string().nullable(),
    deprecatedSince: z.string().nullable(),
    summary: z.string().nullable(),
    optional: z.boolean(),
    multiple: z.boolean(),
    multipleToken: z.boolean(),
    keySpecIndex: z.number().nullable(),
    arguments: z.array(CommandArgumentSchema),
  }),
);

export const RepliesSchema = z.object({
  resp2: ReplyShapeSchema.nullable(),
  resp3: ReplyShapeSchema.nullable(),
  protocolNotes: z.object({
    differs: z.boolean(),
    summary: z.string().nullable(),
  }),
  rawText: z.object({
    resp2: z.string().nullable(),
    resp3: z.string().nullable(),
  }),
  sources: z.array(z.string()),
});

export const CommandSpecSchema = z.object({
  name: z.string(),
  container: z.string().nullable(),
  summary: z.string(),
  since: z.string(),
  deprecatedSince: z.string().nullable(),
  replacedBy: ReplacedBySchema,
  group: z.string(),
  module: ModuleEnum,
  complexity: z.string().nullable(),
  arity: z.number().nullable(),
  commandFlags: z.array(z.string()).nullable(),
  aclCategories: z.array(z.string()).nullable(),
  commandTips: CommandTipsSchema,
  history: z.array(HistoryEntrySchema),
  hints: z.array(z.string()),
  docFlags: z.array(z.string()),
  function: z.string().nullable(),
  getKeysFunction: z.string().nullable(),
  keySpecs: z.array(KeySpecSchema).nullable(),
  arguments: z.array(CommandArgumentSchema),
  replies: RepliesSchema,
});

export const ManifestSchema = z.object({
  builtAt: z.string(),
  redisRepoSha: z.string().nullable(),
  redisRepoTag: z.string().nullable(),
  redisDocsSha: z.string().nullable(),
  commandCount: z.number(),
  moduleCommandCount: z.number(),
  byModuleCount: z.record(z.string(), z.number()),
  replyCoverage: z.object({
    resp2: z.number(),
    resp3: z.number(),
    structuredFromSchema: z.number(),
    unknownKinds: z.number(),
  }),
});

export const IndexesSchema = z.object({
  byGroup: z.record(z.string(), z.array(z.string())),
  byModule: z.record(z.string(), z.array(z.string())),
  byContainer: z.record(z.string(), z.array(z.string())),
  deprecated: z.array(z.string()),
  blocking: z.array(z.string()),
});

export const SpecBundleSchema = z.object({
  $schemaVersion: z.literal("1.0.0"),
  manifest: ManifestSchema,
  commands: z.record(z.string(), CommandSpecSchema),
  indexes: IndexesSchema,
});

export type CommandTips = z.infer<typeof CommandTipsSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type KeySpec = z.infer<typeof KeySpecSchema>;
export type Replies = z.infer<typeof RepliesSchema>;
export type CommandSpec = z.infer<typeof CommandSpecSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;
export type Indexes = z.infer<typeof IndexesSchema>;
export type SpecBundle = z.infer<typeof SpecBundleSchema>;
export type ModuleName = z.infer<typeof ModuleEnum>;
