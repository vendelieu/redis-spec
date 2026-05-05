import type { CommandMap, RawCommandFromRedisRepo } from "../types.js";
import { fetchRawJson, listTreeRecursive, pMap } from "./github.js";

const OWNER = "redis";
const REPO = "redis";
const COMMANDS_PATH = "src/commands";

export async function loadRedisRepoCommands(
  sha: string,
  token: string | undefined,
): Promise<CommandMap<RawCommandFromRedisRepo>> {
  const tree = await listTreeRecursive(OWNER, REPO, sha, { token });
  const files = tree.filter(
    (t) => t.type === "blob" && t.path.startsWith(`${COMMANDS_PATH}/`) && t.path.endsWith(".json"),
  );
  const out: CommandMap<RawCommandFromRedisRepo> = {};
  await pMap(
    files,
    async (file) => {
      try {
        const body = await fetchRawJson<Record<string, RawCommandFromRedisRepo>>(
          OWNER,
          REPO,
          sha,
          file.path,
          { token },
        );
        for (const [name, spec] of Object.entries(body)) {
          out[name.toUpperCase()] = spec;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[redisRepo] skipped ${file.path}: ${msg}`);
      }
    },
    12,
  );
  return out;
}
