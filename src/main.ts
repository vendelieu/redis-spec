import { appendFile } from "node:fs/promises";
import path from "node:path";

import { unifyAll } from "./merge/unify.js";
import { buildIndexes } from "./output/indexes.js";
import { writeBundle } from "./output/write.js";
import { type SpecBundle } from "./schema/commandSpec.js";
import { loadDocsCore, loadDocsModules } from "./sources/docsData.js";
import { loadDocsPages } from "./sources/docsPages.js";
import { getLatestSha, getTagAtSha } from "./sources/github.js";
import { loadModuleRepoCommands } from "./sources/moduleRepos.js";
import { loadRedisRepoCommands } from "./sources/redisRepo.js";
import { loadSentinelLocal } from "./sources/sentinelLocal.js";
import { readState, writeState } from "./state.js";
import type { ModuleId, SourceBundle } from "./types.js";

interface CliArgs {
  sentinelPath: string | null;
  force: boolean;
  redisDocsRef: string;
  redisRepoRef: string;
  outDir: string;
  stateDir: string;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    sentinelPath: null,
    force: false,
    redisDocsRef: "main",
    redisRepoRef: "unstable",
    outDir: path.resolve("output"),
    stateDir: path.resolve("state"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--sentinel") args.sentinelPath = argv[++i] ?? null;
    else if (a === "--force") args.force = true;
    else if (a === "--docs-ref") args.redisDocsRef = argv[++i] ?? "main";
    else if (a === "--repo-ref") args.redisRepoRef = argv[++i] ?? "unstable";
    else if (a === "--out") args.outDir = path.resolve(argv[++i] ?? "output");
    else if (a === "--state") args.stateDir = path.resolve(argv[++i] ?? "state");
  }
  return args;
}

async function emitGhOutput(line: string): Promise<void> {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  await appendFile(file, line + "\n");
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const token = process.env.GITHUB_TOKEN;

  const [redisDocsSha, redisRepoSha] = await Promise.all([
    getLatestSha("redis", "docs", args.redisDocsRef, { token }),
    getLatestSha("redis", "redis", args.redisRepoRef, { token }),
  ]);

  console.log(`[main] redis/docs@${args.redisDocsRef} → ${redisDocsSha.slice(0, 8)}`);
  console.log(`[main] redis/redis@${args.redisRepoRef} → ${redisRepoSha.slice(0, 8)}`);

  const previous = await readState(args.stateDir);
  const unchanged =
    previous != null &&
    previous.redisDocsSha === redisDocsSha &&
    previous.redisRepoSha === redisRepoSha;

  if (unchanged && !args.force) {
    console.log("[main] no upstream changes — skipping build.");
    await emitGhOutput("changed=false");
    return 0;
  }

  const redisRepoTag = await getTagAtSha("redis", "redis", redisRepoSha, { token });

  console.log("[main] fetching sources …");
  const [redisRepo, docsCore, docsModules, moduleRepoBundle] = await Promise.all([
    loadRedisRepoCommands(redisRepoSha, token),
    loadDocsCore(redisDocsSha, token),
    loadDocsModules(redisDocsSha, token),
    loadModuleRepoCommands(token),
  ]);

  const sentinel = await loadSentinelLocal(args.sentinelPath);

  const known = new Set<string>();
  for (const k of Object.keys(redisRepo)) known.add(k);
  for (const k of Object.keys(docsCore)) known.add(k);
  for (const moduleMap of Object.values(docsModules)) {
    for (const k of Object.keys(moduleMap)) known.add(k);
  }
  for (const moduleMap of Object.values(moduleRepoBundle.maps)) {
    for (const k of Object.keys(moduleMap)) known.add(k);
  }
  if (sentinel) for (const k of Object.keys(sentinel)) known.add(k);

  const docsPages = await loadDocsPages(redisDocsSha, known, token);

  const sourceBundle: SourceBundle = {
    redisRepo,
    docsCore,
    docsModules,
    moduleRepos: moduleRepoBundle.maps,
    docsPages,
    sentinel,
    shas: {
      redisRepoSha,
      redisDocsSha,
      redisRepoTag,
      moduleRepoShas: moduleRepoBundle.shas,
    },
  };

  const { commands, stats } = unifyAll(sourceBundle);
  const indexes = buildIndexes(commands);

  const moduleCounts: Record<string, number> = {};
  for (const cmd of Object.values(commands)) {
    if (cmd.module) moduleCounts[cmd.module] = (moduleCounts[cmd.module] ?? 0) + 1;
  }
  const moduleCommandCount = Object.values(moduleCounts).reduce((a, b) => a + b, 0);

  const bundle: SpecBundle = {
    $schemaVersion: "1.0.0",
    manifest: {
      builtAt: new Date().toISOString(),
      redisRepoSha,
      redisRepoTag,
      redisDocsSha,
      commandCount: Object.keys(commands).length,
      moduleCommandCount,
      byModuleCount: moduleCounts,
      replyCoverage: {
        resp2: stats.resp2Coverage,
        resp3: stats.resp3Coverage,
        structuredFromSchema: stats.structuredFromSchema,
        unknownKinds: stats.unknownKinds,
        proseDerivedResp2: stats.proseDerivedResp2,
        proseDerivedResp3: stats.proseDerivedResp3,
      },
    },
    commands,
    indexes,
  };

  await writeBundle(bundle, { outDir: args.outDir });
  await writeState(args.stateDir, {
    redisDocsSha,
    redisRepoSha,
    builtAt: bundle.manifest.builtAt,
  });

  console.log(
    `[main] wrote spec.json: ${bundle.manifest.commandCount} commands ` +
      `(${moduleCommandCount} modular) — RESP2 ${stats.resp2Coverage}, ` +
      `RESP3 ${stats.resp3Coverage}, structured ${stats.structuredFromSchema}, ` +
      `unknown kinds ${stats.unknownKinds}`,
  );
  for (const moduleId of [
    "redisjson",
    "redisbloom",
    "redisearch",
    "redistimeseries",
    "sentinel",
  ] as ModuleId[]) {
    const c = moduleCounts[moduleId] ?? 0;
    if (c > 0) console.log(`[main]   ${moduleId}: ${c}`);
  }

  await emitGhOutput("changed=true");
  await emitGhOutput(`redisShaShort=${redisRepoSha.slice(0, 8)}`);
  await emitGhOutput(`docsShaShort=${redisDocsSha.slice(0, 8)}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  },
);
