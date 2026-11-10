import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";
import { YOLO_DIRECTIVE, SUPER_YOLO_DIRECTIVE, type PermissionMode } from "../lib/yolo-session-policy.ts";
import { AUTO_DIRECTIVE } from "../lib/auto-permission-runtime.ts";

function harness(t: test.TestContext, child = false) {
	const root = mkdtempSync(join(tmpdir(), "permission-prompt-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, "config"), workspace = join(root, "workspace");
	mkdirSync(home); mkdirSync(workspace);
	const handlers = new Map<string, (event: any, ctx: ExtensionContext) => unknown>();
	const commands = new Map<string, { handler(args: string, ctx: ExtensionContext): Promise<void> }>();
	let captures = 0, clone = "clone-a", session = "session-a";
	let confirmAction = () => false;
	const confirmations: Array<[string, string]> = [];
	const pi = {
		on: (name: string, fn: (event: any, ctx: ExtensionContext) => unknown) => handlers.set(name, fn),
		registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionContext): Promise<void> }) => commands.set(name, command),
		registerTool() {}, registerMessageRenderer() {}, registerFlag() {}, getActiveTools: () => [],
		events: { on() {}, emit() {} },
	} as unknown as ExtensionAPI;
	const ctx = {
		cwd: workspace, mode: "tui", hasUI: true,
		sessionManager: { getSessionId: () => session },
		ui: { notify() {}, setStatus() {}, setWidget() {}, confirm: async (title: string, message: string) => {
			confirmations.push([title, message]); return confirmAction();
		} },
	} as unknown as ExtensionContext;
	createGentleAiExtension({
		processEnv: { TOMIDEV_CONFIG_HOME: home, TOMIDEV_AGENTS_CHILD: child ? "1" : "0" },
		resolvePermissionIdentity: async () => { captures++; return clone; },
		resolveTelemetryTriggerBinary: () => "",
		autoPermissionClassifier: { run: async () => assert.fail("prompt composition must not classify tools"), cancel() {} },
	})(pi);
	const options = { appendSystemPrompt: "project harness stays" };
	return {
		ctx, confirmations, options, captures: () => captures,
		files: () => readdirSync(home),
		setClone: () => { clone = "clone-b"; }, setSession: () => { session = "session-b"; },
		onConfirm: (action: () => boolean) => { confirmAction = action; },
		async select(mode: PermissionMode) { await commands.get("td:mode")!.handler(mode, ctx); },
		async prompt(agentName?: string) {
			assert.equal(await handlers.get("before_agent_start")!({ systemPrompt: "base", systemPromptOptions: options, agentName }, ctx), undefined);
			return options.appendSystemPrompt;
		},
		tool: async (toolName: string, toolCallId: string, input: unknown) => handlers.get("tool_call")!({ toolName, toolCallId, input }, ctx),
	};
}

function assertMode(prompt: string, mode: PermissionMode) {
	for (const [candidate, directive] of [["yolo", YOLO_DIRECTIVE], ["super-yolo", SUPER_YOLO_DIRECTIVE], ["auto", AUTO_DIRECTIVE]]) {
		assert.equal(prompt.split(directive).length - 1, candidate === mode ? 1 : 0, `${mode}: ${candidate} directive`);
	}
	assert.ok(prompt.startsWith("project harness stays"));
}

test("each primary prompt resolves identity once freshly, including unchanged consecutive prompts", async t => {
	const h = harness(t);
	for (let turn = 0; turn < 2; turn++) {
		const before = h.captures();
		assertMode(await h.prompt(), "normal");
		assert.equal(h.captures() - before, 1, "one fresh boundary resolution per prompt, not three or a cached result");
	}
	assert.deepEqual(h.confirmations, []);
	assert.deepEqual(h.files(), []);
});

test("consecutive prompts reflect all live mode transitions and remove stale directives from reused options", async t => {
	const h = harness(t);
	for (const mode of ["normal", "auto", "yolo", "super-yolo", "yolo", "auto", "normal"] as const) {
		await h.select(mode);
		assertMode(await h.prompt(), mode);
	}
	assert.deepEqual(h.confirmations, []);
	assert.deepEqual(h.files(), [], "prompt and live selections do not migrate or save configuration");
});

test("a fresh prompt revokes elevated identity after clone or live-session replacement", async t => {
	for (const replacement of ["clone", "session"]) {
		const h = harness(t);
		await h.select("super-yolo"); assertMode(await h.prompt(), "super-yolo");
		if (replacement === "clone") h.setClone(); else h.setSession();
		assertMode(await h.prompt(), "normal");
		assertMode(await h.prompt(), "normal");
		assert.deepEqual(h.files(), []);
	}
});

test("named agents and children receive no permission directive or primary identity capture", async t => {
	for (const child of [false, true]) {
		const h = harness(t, child);
		if (!child) { await h.select("super-yolo"); assertMode(await h.prompt(), "super-yolo"); }
		const before = h.captures();
		assertMode(await h.prompt(child ? undefined : "gentle-ai-worker"), "normal");
		assert.equal(h.captures(), before);
	}
});

test("Git approval revalidates identity again after the human dialog, not against the prompt snapshot", async t => {
	const h = harness(t);
	await h.select("super-yolo"); assertMode(await h.prompt(), "super-yolo");
	const before = h.captures();
	h.onConfirm(() => { h.setClone(); return true; });
	assert.deepEqual(await h.tool("bash", "approved-push", { command: "git push origin main" }), {
		block: true, reason: "Permission mode changed during tool admission. This action was not run; retry under the current mode.",
	});
	assert.equal(h.confirmations.length, 1);
	assert.equal(h.captures() - before, 2, "captures before and after confirmation are independent of prompt composition");
	assertMode(await h.prompt(), "normal");
	assert.deepEqual(h.files(), []);
});

test("prompt snapshots never replace tool admission captures, private-path blocks, or independent Git confirmation", async t => {
	const h = harness(t);
	for (const mode of ["normal", "auto", "yolo", "super-yolo"] as const) {
		await h.select(mode); assertMode(await h.prompt(), mode);
		const before = h.captures();
		assert.deepEqual(await h.tool("read", `${mode}-private`, { path: "private-fixture/.env" }), {
			block: true, reason: "Gentle AI safety policy blocked access to sensitive path: private-fixture/.env. Ask the user for an explicit safer plan.",
		});
		assert.ok(h.captures() > before, "tool dispatch must revalidate after the prompt snapshot");
		for (const command of ["git commit -m fixture", "git push origin main"]) {
			const count = h.confirmations.length;
			const result = await h.tool("bash", `${mode}-${count}`, { command });
			assert.equal((result as { block: boolean }).block, true);
			assert.equal(h.confirmations.length, count + 1, "even Super YOLO waits for the human");
			assert.ok(h.confirmations.at(-1)![1].includes(command));
		}
	}
	assert.deepEqual(h.files(), []);
});

// S2/S3: independent verifier probes, preserved as public-hook regressions.
test("independent confirmation identity replacement across modes", async t => {
	for (const mode of ["normal", "auto", "yolo", "super-yolo"] as const) {
		for (const action of ["commit -m x", "push origin main"]) {
			const h = harness(t);
			await h.select(mode);
			await h.prompt();
			h.onConfirm(() => { h.setClone(); return true; });
			const r = await h.tool("bash", mode + action, { command: "git " + action });
			assert.deepEqual(r, {
				block: true,
				reason: "Permission mode changed during tool admission. This action was not run; retry under the current mode.",
			});
		}
	}
});

test("independent reused options and subsequent separate private admissions", async t => {
	const h = harness(t);
	await h.select("yolo");
	assertMode(await h.prompt(), "yolo");
	h.setClone();
	assertMode(await h.prompt(), "normal");
	for (const id of ["one", "two"]) {
		const before = h.captures();
		const r = await h.tool("read", id, { path: "private-fixture/.env" });
		assert.equal((r as { block: boolean }).block, true);
		assert.ok(h.captures() > before);
	}
});
