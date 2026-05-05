/**
 * Tiny HTTP helpers around the GitHub raw-content / commits / tags APIs.
 *
 * Auth: optional `GITHUB_TOKEN` env var. The unauthenticated rate limit is
 * 60 req/h per IP, plenty for cron builds (one zipball + ~5 GitHub API calls
 * per run) but tight for repeated local runs. Pass a token to bump to 5000/h.
 */

const GITHUB_API = "https://api.github.com";

export interface GitHubFetchOptions {
  token?: string;
}

export class HttpError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

function authHeaders(token: string | undefined): Record<string, string> {
  const base: Record<string, string> = {
    "User-Agent": "redis-spec-builder",
    Accept: "application/vnd.github+json",
  };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

export async function getLatestSha(
  owner: string,
  repo: string,
  ref: string,
  opts: GitHubFetchOptions = {},
): Promise<string> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/commits/${ref}`;
  const res = await fetch(url, { headers: authHeaders(opts.token) });
  if (!res.ok) throw new HttpError(url, res.status, await res.text());
  const data = (await res.json()) as { sha: string };
  return data.sha;
}

export async function getTagAtSha(
  owner: string,
  repo: string,
  sha: string,
  opts: GitHubFetchOptions = {},
): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/tags?per_page=100`;
  const res = await fetch(url, { headers: authHeaders(opts.token) });
  if (!res.ok) return null;
  const tags = (await res.json()) as Array<{ name: string; commit: { sha: string } }>;
  const match = tags.find((t) => t.commit.sha === sha);
  return match ? match.name : null;
}

export async function fetchRawText(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  opts: GitHubFetchOptions = {},
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  const headers: Record<string, string> = { "User-Agent": "redis-spec-builder" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new HttpError(url, res.status, await res.text());
  return await res.text();
}

export async function fetchRawJson<T = unknown>(
  owner: string,
  repo: string,
  ref: string,
  path: string,
  opts: GitHubFetchOptions = {},
): Promise<T> {
  const text = await fetchRawText(owner, repo, ref, path, opts);
  return JSON.parse(text) as T;
}

export async function listTreeRecursive(
  owner: string,
  repo: string,
  ref: string,
  opts: GitHubFetchOptions = {},
): Promise<Array<{ path: string; type: "blob" | "tree"; size?: number }>> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
  const res = await fetch(url, { headers: authHeaders(opts.token) });
  if (!res.ok) throw new HttpError(url, res.status, await res.text());
  const data = (await res.json()) as {
    tree: Array<{ path: string; type: string; size?: number }>;
    truncated?: boolean;
  };
  if (data.truncated) {
    throw new Error(`git tree for ${owner}/${repo}@${ref} is truncated; need a different fetch strategy`);
  }
  return data.tree.filter(
    (t): t is { path: string; type: "blob" | "tree"; size?: number } =>
      t.type === "blob" || t.type === "tree",
  );
}

export async function fetchZipball(
  owner: string,
  repo: string,
  ref: string,
  opts: GitHubFetchOptions = {},
): Promise<ArrayBuffer> {
  const url = `https://codeload.github.com/${owner}/${repo}/zip/${ref}`;
  const headers: Record<string, string> = { "User-Agent": "redis-spec-builder" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new HttpError(url, res.status, await res.text());
  return await res.arrayBuffer();
}

export async function pMap<T, U>(
  items: readonly T[],
  fn: (item: T, idx: number) => Promise<U>,
  concurrency = 8,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      const item = items[i];
      if (item === undefined) continue;
      results[i] = await fn(item, i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
