import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const UpstreamStateSchema = z.object({
  redisDocsSha: z.string(),
  redisRepoSha: z.string(),
  builtAt: z.string(),
});

export type UpstreamState = z.infer<typeof UpstreamStateSchema>;

export async function readState(stateDir: string): Promise<UpstreamState | null> {
  const file = path.join(stateDir, "upstream.json");
  try {
    const text = await readFile(file, "utf8");
    return UpstreamStateSchema.parse(JSON.parse(text));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeState(stateDir: string, state: UpstreamState): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    path.join(stateDir, "upstream.json"),
    JSON.stringify(state, null, 2) + "\n",
  );
}
