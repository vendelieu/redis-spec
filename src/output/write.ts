import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";

import { SpecBundleSchema, type SpecBundle } from "../schema/commandSpec.js";

export interface WriteOptions {
  outDir: string;
}

export async function writeBundle(bundle: SpecBundle, opts: WriteOptions): Promise<void> {
  const validated = SpecBundleSchema.parse(bundle);
  const sortedBundle = sortDeep(validated) as SpecBundle;
  const jsonSchema = zodToJsonSchema(SpecBundleSchema, { name: "SpecBundle" });

  await mkdir(opts.outDir, { recursive: true });
  await writeFile(path.join(opts.outDir, "spec.json"), serialize(sortedBundle));
  await writeFile(path.join(opts.outDir, "schema.json"), serialize(jsonSchema));
  await writeFile(path.join(opts.outDir, "manifest.json"), serialize(sortedBundle.manifest));
}

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/**
 * Recursively sort object keys for deterministic output. Arrays preserve
 * order — they are semantic in the spec (argument order, oneOf variants,
 * etc.).
 */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [k, sortDeep(v)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries);
  }
  return value;
}
