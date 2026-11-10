import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { __testing, createGentleAiExtension } from "../extensions/gentle-ai.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

test("S4/T12: the fixed senior architect preserves language and identity rules", () => {
	const prompt = __testing.buildGentlePrompt();
	assert.match(prompt, /Follow the senior architect persona: direct, concise, technical, and professional\./);
	assert.match(prompt, /Always respond in the same language the user writes in/);
	assert.match(prompt, /When the user writes in Spanish, answer in professional, technical Spanish\./);
	assert.doesNotMatch(prompt, /Current persona mode|voseo|Rioplatense/i);
});

test("S4/T12: persona command is absent and existing config is ignored without writes", async (t) => {
	const root = mkdtempSync(join(tmpdir(), "td-persona-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const global = join(root, "config");
	const project = join(root, ".pi", "gentle-ai");
	mkdirSync(global, { recursive: true });
	mkdirSync(project, { recursive: true });
	const files = [join(global, "persona.json"), join(project, "persona.json")];
	const previous = process.env.TOMIDEV_CONFIG_HOME;
	process.env.TOMIDEV_CONFIG_HOME = global;
	t.after(() => { if (previous === undefined) delete process.env.TOMIDEV_CONFIG_HOME; else process.env.TOMIDEV_CONFIG_HOME = previous; });
	const commands = new Map<string, unknown>();
	const hooks = new Map<string, Function>();
	createGentleAiExtension({ processEnv: {} })({
		on(name: string, handler: Function) { hooks.set(name, handler); },
		registerTool() {},
		registerCommand(name: string, command: unknown) { commands.set(name, command); },
		getActiveTools: () => [],
	} as unknown as ExtensionAPI);
	assert.equal(commands.has("td:persona"), false);
	assert.ok(commands.has("td:profiles"), "model routing remains available");
	const prompts: string[] = [];
	for (const contents of ['{"mode":"neutral"}', '{"mode":"gentleman"}', "not JSON"]) {
		for (const file of files) writeFileSync(file, contents);
		const options: Record<string, unknown> = {};
		await hooks.get("before_agent_start")!({ systemPromptOptions: options }, {
			cwd: root, mode: "tui", hasUI: false,
			sessionManager: { getSessionId: () => "fixed-persona" },
		});
		prompts.push(JSON.stringify(options));
		for (const file of files) assert.equal(readFileSync(file, "utf8"), contents);
	}
	assert.equal(prompts[0], prompts[1]);
	assert.equal(prompts[1], prompts[2]);
	assert.match(prompts[0], /Follow the senior architect persona/);
});
