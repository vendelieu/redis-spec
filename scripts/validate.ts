import Ajv, { type ErrorObject } from "ajv";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
