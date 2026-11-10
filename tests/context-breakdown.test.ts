import assert from "node:assert/strict";
import test from "node:test";
import { buildContextBreakdown, formatContextBreakdown, jsonBytes } from "../lib/context-breakdown.ts";

const secret = "DO_NOT_PRINT_THIS_CONTENT";
const catalog = `<skills><available_skills><skill><name>tiny</name><description>${secret}</description></skill><skill><name>large</name><description>${secret.repeat(3)}</description></skill></available_skills></skills>`;
const options = { cwd: "/repo", contextFiles: [{ path: "/repo/AGENTS.md", content: secret }], appendSystemPrompt: secret.repeat(2), sections: { engram: secret.repeat(4) } };
const prompt = `<rules>base</rules>\n${secret}\n${catalog}\n${options.appendSystemPrompt}\n<engram>${options.sections.engram}</engram>`;

test("breakdown partitions UTF-8 prompt bytes, sorts rows and details, and keeps totals additive", () => {
 const report = buildContextBreakdown({ systemPrompt: prompt, systemPromptOptions: options, tools: [{ name: "read", description: secret, parameters: { type: "object" }, sourceInfo: { source: "builtin", path: "builtin:read" } }, { name: "custom", description: secret.repeat(5), parameters: {}, sourceInfo: { source: "pkg", path: "/extensions/custom.ts" } }], messages: [{ role: "user", content: secret }], usage: { tokens: 123 }, providerPayloadBytes: 456 });
 assert.equal(report.system.bytes, Buffer.byteLength(prompt));
 assert.equal(report.system.rows.reduce((sum, row) => sum + row.bytes, 0), report.system.bytes);
 assert.equal(report.total.bytes, report.system.bytes + report.tools.bytes + report.conversation.bytes);
 assert.equal(report.total.approxTokens, report.total.bytes / 4);
 assert.equal(report.providerPayload?.bytes, 456);
 assert.equal(report.usageTokens, 123);
 assert.equal(report.skills.count, 2);
 assert.deepEqual(report.skills.top.map(row => row.name), ["large", "tiny"]);
 assert.deepEqual(report.tools.top.map(row => row.name), ["custom", "read"]);
 assert.ok(report.system.rows.some(row => row.name === "Context file: /repo/AGENTS.md" && row.bytes === Buffer.byteLength(secret)));
 assert.ok(report.system.rows.some(row => row.name === "Package appends"));
 assert.ok(report.system.rows.some(row => row.name === "Memory section: engram"));
 assert.deepEqual(report.rows.map(row => row.bytes), report.rows.map(row => row.bytes).sort((a,b) => b-a));
 assert.ok(Math.abs(report.rows.reduce((sum, row) => sum + row.percent, 0) - 100) < 0.0001);
 assert.ok(report.tools.groups.some(row => row.name === "pkg (/extensions/custom.ts)"));
 assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
 assert.doesNotMatch(formatContextBreakdown(report), new RegExp(secret));
});

test("opaque prompts use honest fallback attribution and empty inputs have finite percentages", () => {
 const report = buildContextBreakdown({ systemPrompt: "é", systemPromptOptions: options, tools: [{ name: "unknown", description: secret, parameters: {} }], messages: [] });
 assert.equal(report.system.bytes, 2);
 assert.deepEqual(report.system.rows.map(row => row.name), ["Pi base / unattributed prompt"]);
 assert.equal(report.tools.groups[0].name, "Unknown owner");
 assert.equal(report.skills.count, 0);
 assert.equal(report.usageTokens, null);
 assert.equal(report.providerPayload, null);
 const empty = buildContextBreakdown({ systemPrompt: "", tools: [], messages: [] });
 assert.ok(empty.rows.every(row => Number.isFinite(row.percent)));
 assert.equal(jsonBytes(undefined), 0);
});

test("context wrappers and literal NUL bytes remain additive without double-counting bodies", () => {
 const systemPrompt = `<project_context>\n<project_instructions path="/repo/AGENTS.md">${secret}</project_instructions>\n</project_context>\u0000`;
 const report = buildContextBreakdown({ systemPrompt, systemPromptOptions: options, tools: [], messages: [] });
 assert.equal(report.system.rows.reduce((sum, row) => sum + row.bytes, 0), Buffer.byteLength(systemPrompt));
 assert.equal(report.system.rows.find(row => row.name === "Context file: /repo/AGENTS.md")?.bytes, Buffer.byteLength(secret));
});

test("catalog and tool detail limits never omit bytes from totals", () => {
 const skills = Array.from({length: 7}, (_, i) => `<skill><name>s${i}</name><description>${"x".repeat(i+1)}</description></skill>`).join("");
 const tools = Array.from({length: 12}, (_, i) => ({ name: `t${i}`, description: "x".repeat(i), parameters: {} }));
 const report = buildContextBreakdown({ systemPrompt: `<skills>${skills}</skills>`, tools, messages: [] });
 assert.equal(report.skills.count, 7);
 assert.equal(report.skills.top.length, 5);
 assert.equal(report.tools.top.length, 10);
 assert.equal(report.tools.count, 12);
 assert.equal(report.tools.bytes, tools.reduce((sum, tool) => sum + jsonBytes(tool), 0));
});
