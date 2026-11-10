import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { brandCommand } from "./brand.ts";

interface PromptOptions {
 contextFiles?: readonly { path: string; content: string }[];
 appendSystemPrompt?: string;
 sections?: Record<string, string>;
 hiddenTools?: readonly string[];
}
interface ToolInput {
 name: string;
 description: string;
 parameters: unknown;
 sourceInfo?: { source: string; path: string };
}
export interface SizeRow {
 name: string;
 bytes: number;
 approxTokens: number;
 percent: number;
}
interface BreakdownInput {
 systemPrompt: string;
 systemPromptOptions?: PromptOptions;
 tools: readonly ToolInput[];
 messages: readonly unknown[];
 usage?: { tokens: number | null };
 providerPayloadBytes?: number;
}

export function jsonBytes(value: unknown): number {
 return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}
const bytes = (text: string) => Buffer.byteLength(text, "utf8");
// Metadata may contain terminal escapes/newlines. Never let names control the report.
const nameOnly = (name: string) => name.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
const size = (name: string, count: number, total = 0): SizeRow => ({ name: nameOnly(name), bytes: count, approxTokens: count / 4, percent: total ? count / total * 100 : 0 });
const sorted = (rows: SizeRow[]) => rows.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
const memoryName = (name: string) => /engram|memory/i.test(name);

/** Pure, content-free result. Only matched spans are attributed; leftovers stay explicit. */
export function buildContextBreakdown(input: BreakdownInput) {
 const options = input.systemPromptOptions ?? {};
 let remaining = input.systemPrompt;
 // An absent delimiter marks consumed spans without counting them twice inside wrappers.
 let marker = "\u0000";
 while (input.systemPrompt.includes(marker)) marker += "\u0000";
 const unconsumedBytes = (text: string) => bytes(text.replaceAll(marker, ""));
 const systemRows: SizeRow[] = [];
 const take = (text: string, name: string): boolean => {
  if (!text) return false;
  const at = remaining.indexOf(text);
  if (at < 0) return false;
  systemRows.push(size(name, unconsumedBytes(text)));
  // Keep disjoint pieces disjoint: later matching cannot bridge a removed span.
  remaining = remaining.slice(0, at) + marker + remaining.slice(at + text.length);
  return true;
 };
 // Context file bodies only; formatting wrappers remain in the base/framing row.
 for (const file of options.contextFiles ?? []) take(file.content, `Context file: ${file.path}`);
 const skillsBlock = remaining.match(/<skills>[\s\S]*?<\/skills>/)?.[0];
 const skillEntries = [...(skillsBlock ?? "").matchAll(/<skill>\s*<name>([^<]*)<\/name>[\s\S]*?<\/skill>/g)];
 const skillRows = sorted(skillEntries.map(entry => size(entry[1], bytes(entry[0]))));
 if (skillsBlock) take(skillsBlock, `Skills catalog (${skillRows.length} entries)`);
 // Pi does not expose append provenance. Do not guess an extension from its text.
 take(options.appendSystemPrompt ?? "", "Package appends");
 for (const [tag, content] of Object.entries(options.sections ?? {})) {
  take(`<${tag}>\n${content}\n</${tag}>`, `${memoryName(tag) ? "Memory section" : "Extension section"}: ${tag}`)
   || take(`<${tag}>${content}</${tag}>`, `${memoryName(tag) ? "Memory section" : "Extension section"}: ${tag}`);
 }
 // Recognizable top-level Pi sections; unknown per-turn additions remain unattributed.
 for (const tag of ["tools", "rules", "docs", "cwd", "datetime", "project_context", "engram", "memory", "engram_context"]) {
  const block = remaining.match(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`))?.[0];
  if (block) take(block, `${memoryName(tag) ? "Memory section" : "Pi base section"}: ${tag}`);
 }
 const leftover = unconsumedBytes(remaining);
 if (leftover) systemRows.push(size("Pi base / unattributed prompt", leftover));
 const systemBytes = bytes(input.systemPrompt);
 const toolRows = sorted(input.tools.map(tool => size(tool.name, jsonBytes({ name: tool.name, description: tool.description, parameters: tool.parameters }))));
 const toolBytes = toolRows.reduce((sum, row) => sum + row.bytes, 0);
 const owners = new Map<string, number>();
 for (const tool of input.tools) {
  const owner = tool.sourceInfo ? `${tool.sourceInfo.source} (${tool.sourceInfo.path})` : "Unknown owner";
  owners.set(owner, (owners.get(owner) ?? 0) + jsonBytes({ name: tool.name, description: tool.description, parameters: tool.parameters }));
 }
 const conversationBytes = jsonBytes(input.messages);
 const totalBytes = systemBytes + toolBytes + conversationBytes;
 const relative = (row: SizeRow) => size(row.name, row.bytes, totalBytes);
 const memoryMessages = input.messages.filter(message => {
  if (!message || typeof message !== "object") return false;
  const type = "customType" in message ? message.customType : undefined;
  return typeof type === "string" && memoryName(type);
 });
 return {
  total: size("Total estimated input", totalBytes, totalBytes),
  rows: sorted([...systemRows, size("Tool schemas", toolBytes), size("Conversation (projected messages JSON)", conversationBytes)].map(relative)),
  system: { bytes: systemBytes, rows: sorted(systemRows.map(relative)) },
  skills: { count: skillRows.length, bytes: skillsBlock ? bytes(skillsBlock) : 0, top: skillRows.slice(0, 5).map(relative) },
  tools: { count: input.tools.length, bytes: toolBytes, top: toolRows.slice(0, 10).map(row => {
   const tool = input.tools.find(tool => tool.name === row.name);
   return { ...relative(row), owner: tool?.sourceInfo ? nameOnly(`${tool.sourceInfo.source} (${tool.sourceInfo.path})`) : "Unknown owner" };
  }), groups: sorted([...owners].map(([owner, count]) => size(owner, count, totalBytes))) },
  conversation: size("Conversation (projected messages JSON)", conversationBytes, totalBytes),
  memoryMessages: { count: memoryMessages.length, bytes: memoryMessages.length ? jsonBytes(memoryMessages) : 0 },
  providerPayload: input.providerPayloadBytes === undefined ? null : size("Last observed provider payload JSON", input.providerPayloadBytes),
  usageTokens: input.usage?.tokens ?? null,
 };
}

export function formatContextBreakdown(report: ReturnType<typeof buildContextBreakdown>): string {
 const line = (row: SizeRow) => `${row.name}: ${row.bytes} B · ≈${Math.round(row.approxTokens)} tokens · ${row.percent.toFixed(1)}%`;
 return [
  "Context breakdown · current primary session",
  line(report.total),
  ...report.rows.map(line),
  `Skills: ${report.skills.count} entries · ${report.skills.bytes} B (top 5, included above)`,
  ...report.skills.top.map(row => `  ${line(row)}`),
  `Tool schemas: ${report.tools.count} active declarations · ${report.tools.bytes} B (owners; top 10 tools, included above)`,
  ...report.tools.groups.map(row => `  ${line(row)}`),
  ...report.tools.top.map(row => `  ${line(row)} · ${row.owner}`),
  `Recognizable memory messages: ${report.memoryMessages.count} · ${report.memoryMessages.bytes} B (subset of conversation)`,
  report.providerPayload ? `${report.providerPayload.name}: ${report.providerPayload.bytes} B · ≈${Math.round(report.providerPayload.approxTokens)} tokens (comparison only)` : "Last observed provider payload: unavailable (no request observed)",
  `Pi context usage: ${report.usageTokens ?? "unavailable"} tokens (comparison only)`,
  "≈tokens = UTF-8 bytes / 4, not tokenizer counts. Totals exclude comparison/detail rows.",
  "Base options omit per-turn changes; unmatched text stays unattributed. Append owners unavailable.",
  "Conversation uses compaction-aware projection, before context hooks. Payload may be changed by later hooks; JSON includes transport overhead.",
 ].join("\n");
}

/** Observe only a number, never retain or persist provider payloads. */
export function registerContextCommand(pi: ExtensionAPI): void {
 let lastPayload: { sessionId: string; bytes: number } | undefined;
 pi.on("session_start", () => { lastPayload = undefined; });
 pi.on("session_shutdown", () => { lastPayload = undefined; });
 pi.on("before_provider_request", (event, ctx) => {
  lastPayload = { sessionId: ctx.sessionManager.getSessionId(), bytes: jsonBytes(event.payload) };
 });
 pi.registerCommand(brandCommand("context"), {
  description: "Show input sizes by source (bytes and ≈tokens); --json for raw numbers, no contents",
  handler: async (args, ctx) => {
   if (args.trim() !== "" && args.trim() !== "--json") {
    const help = `Usage: /${brandCommand("context")} [--json]`;
    if (ctx.hasUI) ctx.ui.notify(help, "warning");
    else console.log(help);
    return;
   }
   const options = ctx.getSystemPromptOptions();
   const active = new Set(pi.getActiveTools());
   const hidden = new Set(options.hiddenTools ?? []);
   const report = buildContextBreakdown({
    systemPrompt: ctx.getSystemPrompt(), systemPromptOptions: options,
    tools: pi.getAllTools().filter(tool => active.has(tool.name) && !hidden.has(tool.name)),
    messages: ctx.sessionManager.buildSessionProjection().messages.filter(message => message.role !== "system"),
    usage: ctx.getContextUsage(),
    providerPayloadBytes: lastPayload?.sessionId === ctx.sessionManager.getSessionId() ? lastPayload.bytes : undefined,
   });
   const text = args.trim() === "--json" ? JSON.stringify(report, null, 2) : formatContextBreakdown(report);
   if (ctx.hasUI) ctx.ui.notify(text, "info");
   else console.log(text);
  },
 });
}
