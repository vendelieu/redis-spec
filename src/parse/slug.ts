/**
 * Slug rules verified empirically against `redis/docs@main/content/commands/`:
 * - lowercase
 * - spaces → hyphens (e.g. "ACL CAT" → "acl-cat")
 * - dots preserved (e.g. "BF.ADD" → "bf.add", "JSON.GET" → "json.get")
 *
 * The reverse direction (slug → command name) cannot be perfectly inverted
 * from the slug alone because the slug uses a single hyphen for both
 * intra-word hyphens and subcommand separators. We resolve ambiguity by
 * consulting an authoritative command-name set when reverse-mapping (the
 * merger has the names from commands_core.json + redis/redis JSONs).
 */

export function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/ /g, "-");
}

/**
 * Reverse a slug to a command name using a known set of canonical names.
 * Returns null if no candidate matches.
 */
export function slugToName(slug: string, known: ReadonlySet<string>): string | null {
  const upper = slug.toUpperCase();
  if (known.has(upper)) return upper;
  const candidates = enumerateSpaceVariants(upper);
  for (const candidate of candidates) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

function enumerateSpaceVariants(s: string): string[] {
  const positions: number[] = [];
  for (let i = 0; i < s.length; i += 1) if (s[i] === "-") positions.push(i);
  if (positions.length === 0) return [s];
  const cap = 1 << Math.min(positions.length, 6);
  const out: string[] = [];
  for (let mask = 0; mask < cap; mask += 1) {
    const chars = s.split("");
    for (let bit = 0; bit < positions.length; bit += 1) {
      if ((mask >> bit) & 1) {
        const at = positions[bit];
        if (at !== undefined) chars[at] = " ";
      }
    }
    out.push(chars.join(""));
  }
  return out;
}
