import JSZip from "jszip";

import { extractReturnInfo } from "../parse/replyMarkdown.js";
import { slugToName } from "../parse/slug.js";
import type { CommandMap, RawReturnInfo } from "../types.js";
import { fetchZipball } from "./github.js";

const OWNER = "redis";
const REPO = "docs";

/**
 * Download the redis/docs zipball at `sha` and extract every
 * `content/commands/<slug>.md` file. Returns a map keyed by the canonical
 * command name (resolved via the `known` set built from core + module specs).
 */
export async function loadDocsPages(
  sha: string,
  known: ReadonlySet<string>,
  token: string | undefined,
): Promise<CommandMap<RawReturnInfo>> {
  const buf = await fetchZipball(OWNER, REPO, sha, { token });
  const zip = await JSZip.loadAsync(buf);
  const out: CommandMap<RawReturnInfo> = {};
  let unmatchedSlugs = 0;
  await Promise.all(
    Object.entries(zip.files).map(async ([entryPath, entry]) => {
      if (entry.dir) return;
      const idx = entryPath.indexOf("/content/commands/");
      if (idx < 0) return;
      const tail = entryPath.slice(idx + "/content/commands/".length);
      if (!tail.endsWith(".md") || tail.includes("/")) return;
      const slug = tail.slice(0, -".md".length);
      const name = slugToName(slug, known);
      if (!name) {
        unmatchedSlugs += 1;
        return;
      }
      const md = await entry.async("string");
      const ri = extractReturnInfo(md);
      if (ri) out[name] = ri;
    }),
  );
  if (unmatchedSlugs > 0) {
    console.warn(`[docsPages] ${unmatchedSlugs} slug(s) had no matching command name; skipped.`);
  }
  return out;
}
