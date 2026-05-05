import type { CommandTips } from "../schema/commandSpec.js";

const REQUEST_POLICIES = ["ALL_NODES", "ALL_SHARDS", "MULTI_SHARD", "SPECIAL"] as const;
const RESPONSE_POLICIES = [
  "ONE_SUCCEEDED",
  "ALL_SUCCEEDED",
  "AGG_LOGICAL_AND",
  "AGG_LOGICAL_OR",
  "AGG_MIN",
  "AGG_MAX",
  "AGG_SUM",
  "SPECIAL",
] as const;

type RequestPolicy = (typeof REQUEST_POLICIES)[number];
type ResponsePolicy = (typeof RESPONSE_POLICIES)[number];

export function parseCommandTips(raw: readonly string[] | null | undefined): CommandTips {
  const list = raw ?? [];
  return {
    nondeterministicOutput: list.includes("NONDETERMINISTIC_OUTPUT"),
    nondeterministicOutputOrder: list.includes("NONDETERMINISTIC_OUTPUT_ORDER"),
    requestPolicy: extract(list, "REQUEST_POLICY:", REQUEST_POLICIES),
    responsePolicy: extract(list, "RESPONSE_POLICY:", RESPONSE_POLICIES),
    raw: [...list],
  };
}

function extract<T extends string>(
  list: readonly string[],
  prefix: string,
  allowed: readonly T[],
): T | null {
  for (const tip of list) {
    if (!tip.startsWith(prefix)) continue;
    const value = tip.slice(prefix.length);
    if ((allowed as readonly string[]).includes(value)) return value as T;
    return null;
  }
  return null;
}

export function emptyCommandTips(): CommandTips {
  return {
    nondeterministicOutput: false,
    nondeterministicOutputOrder: false,
    requestPolicy: null,
    responsePolicy: null,
    raw: [],
  };
}
