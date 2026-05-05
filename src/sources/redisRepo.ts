import type { CommandMap, RawCommandFromRedisRepo } from "../types.js";
import { fetchRawJson, listTreeRecursive, pMap } from "./github.js";

const OWNER = "redis";
const REPO = "redis";
const COMMANDS_PATH = "src/commands";

/**
 * Canonical command map key. Per-command JSONs in `redis/redis@unstable/src/commands/`
 * use the bare subcommand name as the top-level object key (e.g. `script-exists.json`
 * → `{"EXISTS": {container: "SCRIPT", ...}}`). Without prefixing the container, that
 * subcommand silently clobbers the real top-level `EXISTS` command. Always emit the
 * full canonical name (`"SCRIPT EXISTS"`, `"GET"`, etc.) — same convention used by
 * docs sources and by the merger.
 */
export function canonicalCommandName(rawName: string, container: string | undefined): string {
  const upper = rawName.toUpperCase();
  const upperContainer = container?.toUpperCase();
  return upperContainer ? `${upperContainer} ${upper}` : upper;
}

export function accumulateRedisRepoCommands(
  body: Record<string, RawCommandFromRedisRepo>,
  out: CommandMap<RawCommandFromRedisRepo>,
): void {
  for (const [name, spec] of Object.entries(body)) {
    const fullName = canonicalCommandName(name, spec.container);
    out[fullName] = spec;
  }
}

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
        accumulateRedisRepoCommands(body, out);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[redisRepo] skipped ${file.path}: ${msg}`);
      }
    },
    12,
  );
  return out;
}
