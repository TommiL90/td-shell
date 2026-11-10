import assert from "node:assert/strict";
import test, { after } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import gentleShell from "../extensions/gentle-shell.ts";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";
import { isolatedConfigEnv, removeIsolatedConfigHomes } from "./isolated-config-home.ts";

after(removeIsolatedConfigHomes);

// Records every slash command an extension registers through the public
// registerCommand path. Other pi hooks are no-ops: the test only inspects names.
function registeredCommands(install: (pi: ExtensionAPI) => void): string[] {
	const names: string[] = [];
	const pi = new Proxy({ registerCommand(name: string) { names.push(name); } } as Record<string, unknown>, {
		get(target, property) {
			if (property in target) return target[property as string];
			if (property === "events") return { on() {}, emit() {} };
			return () => undefined;
		},
	}) as unknown as ExtensionAPI;
	install(pi);
	return names;
}

test("no shell or Gentle AI command keeps the retired gentle: namespace", () => {
	const shell = registeredCommands((pi) => gentleShell(pi, isolatedConfigEnv({})));
	const ai = registeredCommands((pi) => createGentleAiExtension({ nativeReviewCli: null })(pi));
	const all = [...shell, ...ai];
	assert.ok(shell.includes("td:customize"), `shell registers td:customize, got ${shell.join(", ")}`);
	assert.ok(ai.includes("td:profiles"), `gentle-ai registers td:profiles, got ${ai.join(", ")}`);
	assert.deepEqual(all.filter((name) => name.startsWith("gentle:")), [], "no gentle: command is registered (S3: no aliases)");
	assert.deepEqual(all.filter((name) => !name.startsWith("td:")), [], "every shell and Gentle AI command uses the td: prefix");
});
