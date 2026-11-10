import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";

// These assertions cover delivered instructions, not an agent's execution of them.
let root: string;
let cwd: string;
let env: NodeJS.ProcessEnv;
const previous = new Map<string, string | undefined>();
before(async () => {
	root = await mkdtemp(join(tmpdir(), "gentle-work-continuity-"));
	cwd = join(root, "project");
	const home = join(root, "home");
	await mkdir(cwd);
	await mkdir(home);
	env = { HOME: home, USERPROFILE: home, TOMIDEV_CONFIG_HOME: join(home, "config"), TOMIDEV_AGENT_HOME: join(home, "agents"), PI_CODING_AGENT_DIR: join(home, "pi"), XDG_CONFIG_HOME: join(home, "xdg") };
	for (const [key, value] of Object.entries(env)) {
		previous.set(key, process.env[key]);
		process.env[key] = value;
	}
});
after(async () => {
	for (const [key, value] of previous) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	if (root) await rm(root, { recursive: true, force: true });
});

async function delivered(): Promise<string> {
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
	const pi = { on(name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) { handlers.set(name, handler); }, events: { emit() {} }, registerCommand() {}, registerTool() {} } as unknown as ExtensionAPI;
	createGentleAiExtension({ nativeReviewCli: null, processEnv: { ...env, TOMIDEV_AGENTS_CHILD: "0", GENTLE_AI_TELEMETRY: "0" }, resolveTelemetryTriggerBinary: () => join(cwd, "never-executed"), telemetryTriggerSpawn: () => assert.fail("fixture must not spawn telemetry") })(pi);
	const event = { systemPrompt: "base", systemPromptOptions: { appendSystemPrompt: "" } };
	const ctx = { cwd, hasUI: true, ui: { notify() {}, setWidget() {} }, sessionManager: { getSessionId: () => "continuity-test", getBranch: () => [] } } as unknown as ExtensionContext;
	await handlers.get("before_agent_start")!(event, ctx);
	const prompt = event.systemPromptOptions.appendSystemPrompt;
	const start = prompt.indexOf("## Authorized work continuity");
	const end = prompt.indexOf("\n## ", start + "## Authorized work continuity".length);
	assert.ok(start >= 0 && end > start, "continuity has its own delivered section boundary");
	assert.ok(prompt.indexOf("## Project harness composition", end) >= end, "composition remains delivered outside continuity");
	return prompt.slice(start, end);
}

function includesAll(text: string, clauses: string[]): void {
	for (const clause of clauses) assert.ok(text.includes(clause), `missing delivered clause: ${clause}`);
}

test("S2: delivered continuity keeps its essentials: in-scope steps continue and stops are limited to real decisions", async () => {
	includesAll(await delivered(), [
		"Continue authorized in-scope implementation, documentation, and verification steps without asking the human to approve each transition.",
		"A progress update is not a request for permission.",
		"Stop only for an unresolved consequential scope or product decision, required consent, a denied action, missing required proof (it blocks completion and delivery), or the human's explicit stop.",
		"Do not infer permission for publishing (push, pull request, release), commits, destructive actions, or unrelated scope",
	]);
});

test("S2: delivered continuity carries no native-review, provider-consent, verifier, or worker-recovery weight", async () => {
	const block = await delivered();
	assert.doesNotMatch(block, /native|provider|review|verifier|worker|gentle_review|RDD/i);
	assert.doesNotMatch(block, /## Project harness composition|Default workflow:/);
	assert.ok(Buffer.byteLength(block, "utf8") <= 1_400, "continuity stays limited to its essentials");
});
