import type { CommandSpec, Indexes } from "../schema/commandSpec.js";

const BLOCKING_FLAGS = new Set(["blocking"]);

export function buildIndexes(commands: Record<string, CommandSpec>): Indexes {
  const byGroup: Record<string, string[]> = {};
  const byModule: Record<string, string[]> = {};
  const byContainer: Record<string, string[]> = {};
  const deprecated: string[] = [];
  const blocking: string[] = [];

  for (const [name, cmd] of Object.entries(commands)) {
    pushSorted(byGroup, cmd.group, name);
    if (cmd.module) pushSorted(byModule, cmd.module, name);
    if (cmd.container) pushSorted(byContainer, cmd.container, name);
    if (cmd.deprecatedSince || cmd.replacedBy) deprecated.push(name);
    const flags = cmd.commandFlags ?? [];
    const hasBlocking = flags.some((f) => BLOCKING_FLAGS.has(f.toLowerCase()));
    const reqPolicy = cmd.commandTips.requestPolicy;
    const blocksOnFanout = reqPolicy === "ALL_NODES" || reqPolicy === "ALL_SHARDS";
    if (hasBlocking || blocksOnFanout) blocking.push(name);
  }

  for (const k of Object.keys(byGroup)) byGroup[k]!.sort();
  for (const k of Object.keys(byModule)) byModule[k]!.sort();
  for (const k of Object.keys(byContainer)) byContainer[k]!.sort();
  deprecated.sort();
  blocking.sort();

  return { byGroup, byModule, byContainer, deprecated, blocking };
}

function pushSorted(map: Record<string, string[]>, key: string, value: string): void {
  const list = map[key];
  if (list) list.push(value);
  else map[key] = [value];
}
