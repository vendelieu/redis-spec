import { emptyCommandTips, parseCommandTips } from "../parse/commandTips.js";
import { replyMarkdownToShape, summarizeProtocolDiff } from "../parse/replyMarkdown.js";
import { replySchemaToShape } from "../parse/replySchema.js";
import type {
  ArgumentTypeEnum,
  CommandArgument,
  CommandSpec,
  KeySpec,
  Replies,
  ReplyConfidence,
} from "../schema/commandSpec.js";
import type { ReplyShape } from "../schema/replyShape.js";
import type {
  ModuleId,
  RawCommandFromDocs,
  RawCommandFromRedisRepo,
  RawReturnInfo,
  RawUpstreamArgument,
  RawUpstreamCommand,
  RawUpstreamKeySpec,
  SourceBundle,
} from "../types.js";
import type { z } from "zod";

const ARGUMENT_TYPES = [
  "key",
  "string",
  "integer",
  "double",
  "unix-time",
  "pure-token",
  "oneof",
  "block",
  "pattern",
] as const;

type ArgumentType = z.infer<typeof ArgumentTypeEnum>;

const isArgumentType = (s: unknown): s is Exclude<ArgumentType, "unknown"> =>
  typeof s === "string" && (ARGUMENT_TYPES as readonly string[]).includes(s);

export interface UnifyResult {
  commands: Record<string, CommandSpec>;
  stats: {
    structuredFromSchema: number;
    resp2Coverage: number;
    resp3Coverage: number;
    unknownKinds: number;
    proseDerivedResp2: number;
    proseDerivedResp3: number;
    byModule: Record<string, number>;
  };
}

export function unifyAll(bundle: SourceBundle): UnifyResult {
  const moduleByCommand: Record<string, ModuleId> = {};
  for (const [moduleId, map] of Object.entries(bundle.docsModules) as Array<
    [Exclude<ModuleId, "sentinel">, Record<string, RawCommandFromDocs>]
  >) {
    for (const name of Object.keys(map)) moduleByCommand[name] = moduleId;
  }
  if (bundle.sentinel) {
    for (const name of Object.keys(bundle.sentinel)) moduleByCommand[name] = "sentinel";
  }

  const allNames = new Set<string>();
  for (const k of Object.keys(bundle.redisRepo)) allNames.add(k);
  for (const k of Object.keys(bundle.docsCore)) allNames.add(k);
  for (const k of Object.keys(moduleByCommand)) allNames.add(k);

  const commands: Record<string, CommandSpec> = {};
  const stats = {
    structuredFromSchema: 0,
    resp2Coverage: 0,
    resp3Coverage: 0,
    unknownKinds: 0,
    proseDerivedResp2: 0,
    proseDerivedResp3: 0,
    byModule: {} as Record<string, number>,
  };

  for (const name of allNames) {
    const repo = bundle.redisRepo[name];
    const core = bundle.docsCore[name];
    const moduleId = moduleByCommand[name] ?? null;
    const moduleSpec = moduleId
      ? moduleId === "sentinel"
        ? bundle.sentinel?.[name]
        : bundle.docsModules[moduleId][name]
      : undefined;
    const page = bundle.docsPages[name] ?? null;

    const spec = mergeCommand(name, repo, core, moduleSpec, moduleId, page, stats);
    if (!spec) continue;
    commands[name] = spec;
    if (moduleId) stats.byModule[moduleId] = (stats.byModule[moduleId] ?? 0) + 1;
  }
  return { commands, stats };
}

function mergeCommand(
  name: string,
  repo: RawCommandFromRedisRepo | undefined,
  core: RawCommandFromDocs | undefined,
  moduleSpec: RawCommandFromDocs | undefined,
  moduleId: ModuleId | null,
  page: RawReturnInfo | null,
  stats: UnifyResult["stats"],
): CommandSpec | null {
  const primary: RawUpstreamCommand | undefined =
    repo ?? core ?? moduleSpec ?? undefined;
  if (!primary) return null;

  const summary = primary.summary ?? "";
  const since = primary.since ?? "";
  const group = primary.group ?? (moduleId ?? "unknown");
  const complexity = primary.complexity ?? null;
  const arity = typeof primary.arity === "number" ? primary.arity : null;

  const commandFlags = repo?.command_flags ?? core?.command_flags ?? null;
  const aclCategories = repo?.acl_categories ?? core?.acl_categories ?? null;

  const tipsSource = repo ?? moduleSpec ?? core;
  const commandTips = tipsSource?.command_tips
    ? parseCommandTips(tipsSource.command_tips)
    : emptyCommandTips();

  const history = (core?.history ?? moduleSpec?.history ?? repo?.history ?? []).map(
    ([sinceVer, note]) => ({ since: sinceVer, note }),
  );
  const hints = core?.hints ?? repo?.hints ?? [];
  const docFlags = core?.doc_flags ?? repo?.doc_flags ?? [];

  const replacedByRaw = repo?.replaced_by ?? core?.replaced_by ?? moduleSpec?.replaced_by ?? null;
  const replacedBy = replacedByRaw
    ? { command: replacedByRaw, since: null }
    : null;

  const argsRaw =
    repo?.arguments ?? core?.arguments ?? moduleSpec?.arguments ?? [];
  const argumentsList = argsRaw.map(normalizeArgument);

  const keySpecsRaw = repo?.key_specs ?? core?.key_specs ?? null;
  const keySpecs = keySpecsRaw ? keySpecsRaw.map(normalizeKeySpec) : null;

  const container = repo?.container ?? deriveContainer(name);

  const replies = buildReplies(repo, core, moduleSpec, moduleId, page, stats);

  const spec: CommandSpec = {
    name,
    container,
    summary,
    since,
    deprecatedSince:
      repo?.deprecated_since ?? core?.deprecated_since ?? moduleSpec?.deprecated_since ?? null,
    replacedBy,
    group,
    module: moduleId,
    complexity,
    arity,
    commandFlags,
    aclCategories,
    commandTips,
    history,
    hints,
    docFlags,
    function: repo?.function ?? null,
    getKeysFunction: repo?.get_keys_function ?? null,
    keySpecs,
    arguments: argumentsList,
    replies,
  };
  return spec;
}

function normalizeArgument(arg: RawUpstreamArgument): CommandArgument {
  return {
    name: arg.name ?? "",
    displayText: arg.display_text ?? null,
    type: isArgumentType(arg.type) ? arg.type : "unknown",
    token: arg.token ?? null,
    since: arg.since ?? null,
    deprecatedSince: arg.deprecated_since ?? null,
    summary: arg.summary ?? null,
    optional: arg.optional ?? false,
    multiple: arg.multiple ?? false,
    multipleToken: arg.multiple_token ?? false,
    keySpecIndex: typeof arg.key_spec_index === "number" ? arg.key_spec_index : null,
    arguments: (arg.arguments ?? []).map(normalizeArgument),
  };
}

function normalizeKeySpec(ks: RawUpstreamKeySpec): KeySpec {
  const beginSearchType = ((): "index" | "keyword" | "unknown" => {
    const t = ks.begin_search?.type;
    if (t === "index") return "index";
    if (t === "keyword") return "keyword";
    return "unknown";
  })();
  const beginSearchSpec = (ks.begin_search?.spec ?? {}) as Record<string, unknown>;

  const findKeysType = ((): "range" | "keynum" | "unknown" => {
    const t = ks.find_keys?.type;
    if (t === "range") return "range";
    if (t === "keynum") return "keynum";
    return "unknown";
  })();
  const findKeysSpec = (ks.find_keys?.spec ?? {}) as Record<string, unknown>;

  return {
    notes: ks.notes ?? null,
    beginSearch: {
      type: beginSearchType,
      spec: {
        index: numOrNull(beginSearchSpec.index),
        keyword: typeof beginSearchSpec.keyword === "string" ? beginSearchSpec.keyword : null,
        startFrom: numOrNull(beginSearchSpec.startfrom ?? beginSearchSpec.start_from),
      },
    },
    findKeys: {
      type: findKeysType,
      spec: {
        lastKey: numOrNull(findKeysSpec.lastkey),
        keyStep: numOrNull(findKeysSpec.keystep),
        limit: numOrNull(findKeysSpec.limit),
        firstKey: numOrNull(findKeysSpec.firstkey),
        keyNumIdx: numOrNull(findKeysSpec.keynumidx),
      },
    },
    RW: ks.RW ?? false,
    RO: ks.RO ?? false,
    OW: ks.OW ?? false,
    access: ks.access ?? false,
    update: ks.update ?? false,
    insert: ks.insert ?? false,
    delete: ks.delete ?? false,
    incomplete: ks.incomplete ?? false,
  };
}

function numOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function deriveContainer(name: string): string | null {
  const idx = name.indexOf(" ");
  if (idx < 0) return null;
  return name.slice(0, idx);
}

function buildReplies(
  repo: RawCommandFromRedisRepo | undefined,
  core: RawCommandFromDocs | undefined,
  moduleSpec: RawCommandFromDocs | undefined,
  moduleId: ModuleId | null,
  page: RawReturnInfo | null,
  stats: UnifyResult["stats"],
): Replies {
  const schemaCandidates: Array<{ tag: string; schema: unknown }> = [];
  if (repo?.reply_schema) schemaCandidates.push({ tag: "redis-repo:reply_schema", schema: repo.reply_schema });
  if (core?.reply_schema) schemaCandidates.push({ tag: "docs-core:reply_schema", schema: core.reply_schema });
  if (moduleSpec?.reply_schema) {
    const moduleTag = moduleId && moduleId !== "sentinel" ? `docs-module:${moduleId}:reply_schema` : "docs-module:reply_schema";
    schemaCandidates.push({ tag: moduleTag, schema: moduleSpec.reply_schema });
  }

  let fromSchema: ReplyShape | null = null;
  let schemaSourceTag: string | null = null;
  for (const candidate of schemaCandidates) {
    const shape = replySchemaToShape(candidate.schema);
    if (shape) {
      fromSchema = shape;
      schemaSourceTag = candidate.tag;
      break;
    }
  }

  const fromPageResp2 = replyMarkdownToShape(page?.resp2 ?? null);
  const fromPageResp3 = replyMarkdownToShape(page?.resp3 ?? null);

  const resp3 = fromSchema ?? fromPageResp3 ?? null;
  const resp2 = page?.hasMultitabsSplit ? fromPageResp2 : null;

  const sources: string[] = [];
  if (schemaSourceTag) sources.push(schemaSourceTag);
  if (page) sources.push("redis-docs:page");

  const protoDiff = summarizeProtocolDiff(
    fromPageResp2 ?? null,
    fromPageResp3 ?? resp3,
    page?.hasMultitabsSplit ?? false,
  );

  const confidenceResp3: ReplyConfidence = fromSchema
    ? "schema"
    : fromPageResp3
      ? "prose"
      : "missing";
  const confidenceResp2: ReplyConfidence = resp2 ? "prose" : "missing";

  if (fromSchema) stats.structuredFromSchema += 1;
  if (resp2) stats.resp2Coverage += 1;
  if (resp3) stats.resp3Coverage += 1;
  if (confidenceResp2 === "prose") stats.proseDerivedResp2 += 1;
  if (confidenceResp3 === "prose") stats.proseDerivedResp3 += 1;
  countUnknown(resp2, stats);
  countUnknown(resp3, stats);

  return {
    resp2,
    resp3,
    protocolNotes: protoDiff,
    rawText: { resp2: page?.resp2 ?? null, resp3: page?.resp3 ?? null },
    sources,
    confidence: { resp2: confidenceResp2, resp3: confidenceResp3 },
  };
}

function countUnknown(shape: ReplyShape | null, stats: UnifyResult["stats"]): void {
  if (!shape) return;
  if (shape.kind === "unknown") {
    stats.unknownKinds += 1;
    return;
  }
  if (shape.kind === "array" || shape.kind === "set") countUnknown(shape.items, stats);
  if (shape.kind === "map") {
    countUnknown(shape.key, stats);
    countUnknown(shape.value, stats);
  }
  if (shape.kind === "tuple" || shape.kind === "push") {
    for (const it of shape.items) countUnknown(it, stats);
  }
  if (shape.kind === "oneOf") {
    for (const v of shape.variants) countUnknown(v, stats);
  }
}
