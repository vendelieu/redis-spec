import type { CommandMap, ModuleId, RawCommandFromDocs } from "../types.js";
import { fetchRawJson, getLatestSha, HttpError } from "./github.js";

interface ModuleRepoCoord {
  owner: string;
  repo: string;
  ref: string;
  paths: string[];
}

const MODULE_REPOS: Record<Exclude<ModuleId, "sentinel">, ModuleRepoCoord> = {
  redisjson: {
    owner: "RedisJSON",
    repo: "RedisJSON",
    ref: "master",
    paths: ["commands.json"],
  },
  redisbloom: {
    owner: "RedisBloom",
    repo: "RedisBloom",
    ref: "master",
    paths: ["commands.json"],
  },
  redisearch: {
    owner: "RediSearch",
    repo: "RediSearch",
    ref: "master",
    paths: ["commands.json"],
  },
  redistimeseries: {
    owner: "RedisTimeSeries",
    repo: "RedisTimeSeries",
    ref: "master",
    paths: ["commands.json"],
  },
};

export type ModuleRepoMaps = Record<
  Exclude<ModuleId, "sentinel">,
  CommandMap<RawCommandFromDocs>
>;

export type ModuleRepoShas = Record<Exclude<ModuleId, "sentinel">, string | null>;

export interface LoadModuleReposResult {
  maps: ModuleRepoMaps;
  shas: ModuleRepoShas;
}

const EMPTY_MAPS: ModuleRepoMaps = {
  redisjson: {},
  redisbloom: {},
  redisearch: {},
  redistimeseries: {},
};

const EMPTY_SHAS: ModuleRepoShas = {
  redisjson: null,
  redisbloom: null,
  redisearch: null,
  redistimeseries: null,
};

export async function loadModuleRepoCommands(
  token: string | undefined,
): Promise<LoadModuleReposResult> {
  const maps: ModuleRepoMaps = { ...EMPTY_MAPS };
  const shas: ModuleRepoShas = { ...EMPTY_SHAS };

  await Promise.all(
    (Object.entries(MODULE_REPOS) as Array<[Exclude<ModuleId, "sentinel">, ModuleRepoCoord]>).map(
      async ([id, coord]) => {
        try {
          const sha = await getLatestSha(coord.owner, coord.repo, coord.ref, { token });
          shas[id] = sha;
          for (const filePath of coord.paths) {
            try {
              const body = await fetchRawJson<Record<string, RawCommandFromDocs>>(
                coord.owner,
                coord.repo,
                sha,
                filePath,
                { token },
              );
              const m: CommandMap<RawCommandFromDocs> = {};
              for (const [name, spec] of Object.entries(body)) {
                m[name.toUpperCase()] = spec;
              }
              maps[id] = m;
              return;
            } catch (err) {
              if (err instanceof HttpError && err.status === 404) continue;
              throw err;
            }
          }
          console.warn(
            `[moduleRepos] ${coord.owner}/${coord.repo}: no commands.json found at ${coord.paths.join(", ")}`,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[moduleRepos] skipped ${coord.owner}/${coord.repo}: ${msg}`);
        }
      },
    ),
  );

  return { maps, shas };
}
