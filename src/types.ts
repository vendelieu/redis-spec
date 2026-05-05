/**
 * Raw upstream shapes returned by the source modules.
 * These are deliberately permissive — every field is optional and untyped where
 * upstream is ad-hoc — so the source layer never throws on minor upstream
 * drift. The merger in `src/merge/unify.ts` is responsible for normalizing
 * these into the strict `CommandSpec` defined in `src/schema/commandSpec.ts`.
 */

export interface RawUpstreamArgument {
  name?: string;
  display_text?: string;
  type?: string;
  token?: string;
  optional?: boolean;
  multiple?: boolean;
  multiple_token?: boolean;
  key_spec_index?: number;
  since?: string;
  deprecated_since?: string;
  summary?: string;
  arguments?: RawUpstreamArgument[];
}

export interface RawUpstreamKeySpec {
  notes?: string;
  begin_search?: { type?: string; spec?: Record<string, unknown> };
  find_keys?: { type?: string; spec?: Record<string, unknown> };
  RW?: boolean;
  RO?: boolean;
  OW?: boolean;
  access?: boolean;
  update?: boolean;
  insert?: boolean;
  delete?: boolean;
  incomplete?: boolean;
}

export interface RawUpstreamCommand {
  summary?: string;
  since?: string;
  group?: string;
  complexity?: string;
  arity?: number;
  command_flags?: string[];
  acl_categories?: string[];
  command_tips?: string[];
  arguments?: RawUpstreamArgument[];
  key_specs?: RawUpstreamKeySpec[];
  reply_schema?: unknown;
  history?: Array<[string, string]>;
  hints?: string[];
  doc_flags?: string[];
  deprecated_since?: string;
  replaced_by?: string;
  function?: string;
  get_keys_function?: string;
  container?: string;
  module?: string;
}

export interface RawCommandFromRedisRepo extends RawUpstreamCommand {}

export interface RawCommandFromDocs extends RawUpstreamCommand {}

/** Output of `src/sources/docsPages.ts`. Pre-parsed RESP2/RESP3 chunks. */
export interface RawReturnInfo {
  /** RESP2 chunk text (may equal `resp3` if the page has no `-tab-sep-`). */
  resp2: string | null;
  /** RESP3 chunk text. */
  resp3: string | null;
  /** True when the page explicitly split RESP2 vs RESP3 (had `-tab-sep-`). */
  hasMultitabsSplit: boolean;
}

/** Map keyed by canonical command name (e.g. `"ACL CAT"`, `"BF.ADD"`). */
export type CommandMap<V> = Record<string, V>;

export type ModuleId =
  | "redisjson"
  | "redisbloom"
  | "redisearch"
  | "redistimeseries"
  | "sentinel";

/** Source bundle returned by the orchestrator before merging. */
export interface SourceBundle {
  redisRepo: CommandMap<RawCommandFromRedisRepo>;
  docsCore: CommandMap<RawCommandFromDocs>;
  docsModules: Record<Exclude<ModuleId, "sentinel">, CommandMap<RawCommandFromDocs>>;
  docsPages: CommandMap<RawReturnInfo>;
  sentinel: CommandMap<RawCommandFromDocs> | null;
  shas: { redisRepoSha: string; redisDocsSha: string; redisRepoTag: string | null };
}
