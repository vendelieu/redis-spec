import type { CommandMap, ModuleId, RawCommandFromDocs } from "../types.js";
import { fetchRawJson } from "./github.js";

const OWNER = "redis";
const REPO = "docs";

const MODULE_FILES: Record<Exclude<ModuleId, "sentinel">, string> = {
  redisjson: "data/commands_redisjson.json",
  redisbloom: "data/commands_redisbloom.json",
  redisearch: "data/commands_redisearch.json",
  redistimeseries: "data/commands_redistimeseries.json",
};

export async function loadDocsCore(
  sha: string,
  token: string | undefined,
): Promise<CommandMap<RawCommandFromDocs>> {
  const body = await fetchRawJson<Record<string, RawCommandFromDocs>>(
    OWNER,
    REPO,
    sha,
    "data/commands_core.json",
    { token },
  );
  const out: CommandMap<RawCommandFromDocs> = {};
  for (const [name, spec] of Object.entries(body)) {
    out[name.toUpperCase()] = spec;
  }
  return out;
}

export async function loadDocsModules(
  sha: string,
  token: string | undefined,
): Promise<Record<Exclude<ModuleId, "sentinel">, CommandMap<RawCommandFromDocs>>> {
  const entries = await Promise.all(
    (Object.entries(MODULE_FILES) as Array<[Exclude<ModuleId, "sentinel">, string]>).map(
      async ([id, path]) => {
        const body = await fetchRawJson<Record<string, RawCommandFromDocs>>(
          OWNER,
          REPO,
          sha,
          path,
          { token },
        );
        const map: CommandMap<RawCommandFromDocs> = {};
        for (const [name, spec] of Object.entries(body)) {
          map[name.toUpperCase()] = spec;
        }
        return [id, map] as const;
      },
    ),
  );
  return Object.fromEntries(entries) as Record<
    Exclude<ModuleId, "sentinel">,
    CommandMap<RawCommandFromDocs>
  >;
}
