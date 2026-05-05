import Ajv, { type ErrorObject } from "ajv";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface SpecManifest {
  manifest?: {
    commandCount?: number;
    replyCoverage?: {
      resp2?: number;
      resp3?: number;
      structuredFromSchema?: number;
      unknownKinds?: number;
      proseDerivedResp2?: number;
      proseDerivedResp3?: number;
    };
  };
}

async function main(): Promise<void> {
  const outDir = path.resolve("output");
  const [specText, schemaText] = await Promise.all([
    readFile(path.join(outDir, "spec.json"), "utf8"),
    readFile(path.join(outDir, "schema.json"), "utf8"),
  ]);
  const spec = JSON.parse(specText) as unknown;
  const schema = JSON.parse(schemaText) as Record<string, unknown>;

  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const ok = validate(spec);
  if (!ok) {
    const errors: ErrorObject[] = validate.errors ?? [];
    for (const err of errors.slice(0, 30)) {
      console.error(`[validate] ${err.instancePath} ${err.message ?? "(no message)"}`);
    }
    if (errors.length > 30) console.error(`[validate] … and ${errors.length - 30} more`);
    process.exit(1);
  }
  console.log("[validate] OK");

  const coverage = (spec as SpecManifest).manifest?.replyCoverage;
  const total = (spec as SpecManifest).manifest?.commandCount ?? 0;
  if (coverage && total > 0) {
    const schemaPct = ((coverage.structuredFromSchema ?? 0) / total) * 100;
    const proseRespN = coverage.proseDerivedResp3 ?? 0;
    console.log(
      `[validate] reply coverage: ${coverage.structuredFromSchema}/${total} schema-derived ` +
        `(${schemaPct.toFixed(1)}%), ${proseRespN} prose-derived RESP3, ` +
        `${coverage.unknownKinds ?? 0} unknown kinds`,
    );
    const minSchemaPctEnv = process.env.MIN_SCHEMA_COVERAGE_PCT;
    if (minSchemaPctEnv) {
      const threshold = Number.parseFloat(minSchemaPctEnv);
      if (Number.isFinite(threshold) && schemaPct < threshold) {
        console.error(
          `[validate] schema coverage ${schemaPct.toFixed(1)}% below required ${threshold}% (MIN_SCHEMA_COVERAGE_PCT)`,
        );
        process.exit(2);
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
