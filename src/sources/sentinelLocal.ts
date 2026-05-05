import { readFile } from "node:fs/promises";

import type { CommandMap, RawCommandFromDocs } from "../types.js";

/**
 * Optional CLI-supplied sentinel spec. re.this owns this file
 * (`api-processor/src/main/resources/sentinel_spec.json`); the builder folds
 * it in with `module: "sentinel"` so a single artifact can ship core +
 * modules + sentinel.
 */
export async function loadSentinelLocal(
  path: string | null,
): Promise<CommandMap<RawCommandFromDocs> | null> {
  if (!path) return null;
  const body = await readFile(path, "utf8");
  const parsed = JSON.parse(body) as Record<string, RawCommandFromDocs>;
  const out: CommandMap<RawCommandFromDocs> = {};
  for (const [name, spec] of Object.entries(parsed)) {
    out[name.toUpperCase()] = spec;
  }
  return out;
}
