import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";
import { worktreeGitEnvironment } from "../lib/session-worktree-registry.ts";

// S2/S4 (odd/tasks/startup-home-repo-and-changes.md): a repository rooted at
// HOME makes every Git call scan the user's whole tree. Startup warns once.

type AnyHandler = (event: unknown, ctx: ExtensionContext) => unknown;
type Notice = { message: string; severity: string };
const ENV_KEYS = ["HOME", "USERPROFILE", "TOMIDEV_CONFIG_HOME", "TOMIDEV_AGENT_HOME", "PI_CODING_AGENT_DIR", "XDG_CONFIG_HOME"] as const;

function fixture(t: test.TestContext, gitAtHome: boolean) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "gentle-pi-startup-home-")));
	const home = join(root, "home");
	const state = join(root, "state");
	const cwd = join(home, "project");
	mkdirSync(cwd, { recursive: true });
	mkdirSync(state);
	const git = (directory: string) => execFileSync("git", ["init", "--quiet", directory], { env: worktreeGitEnvironment(), stdio: "pipe" });
	git(gitAtHome ? home : cwd);
	const environment: Record<(typeof ENV_KEYS)[number], string> = {
		HOME: home, USERPROFILE: home,
		TOMIDEV_CONFIG_HOME: join(state, "config"),
		TOMIDEV_AGENT_HOME: join(state, "agents"),
		PI_CODING_AGENT_DIR: join(state, "pi"),
		XDG_CONFIG_HOME: join(state, "xdg"),
	};
	const previous = new Map(ENV_KEYS.map(key => [key, process.env[key]]));
	Object.assign(process.env, environment);
	t.after(() => {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		rmSync(root, { recursive: true, force: true });
	});
	return { cwd, environment };
}

function start(cwd: string, environment: NodeJS.ProcessEnv) {
	const handlers = new Map<string, AnyHandler>();
	const notices: Notice[] = [];
	const pi = {
		appendEntry() {},
		on(name: string, handler: AnyHandler) { handlers.set(name, handler); },
		events: { emit() {} },
		registerCommand() {},
		registerTool() {},
		sendMessage() {},
	} as unknown as ExtensionAPI;
	createGentleAiExtension({
		processEnv: { ...environment, TOMIDEV_AGENTS_CHILD: "0", GENTLE_AI_TELEMETRY: "0" },
		resolveTelemetryTriggerBinary: () => join(cwd, "never-executed"),
		telemetryTriggerSpawn: () => assert.fail("Startup fixtures must not spawn telemetry"),
	})(pi);
	const ctx = {
		cwd,
		hasUI: true,
		ui: { notify: (message: string, severity: string) => { notices.push({ message, severity }); } },
		sessionManager: { getSessionId: () => "startup-home-session", getCwd: () => cwd, getEntries: () => [], getBranch: () => [] },
	} as unknown as ExtensionContext;
	return { handlers, notices, ctx };
}

const homeWarning = (notices: Notice[]) => notices.filter(({ message }) => message.includes("rooted at your home folder"));

test("a repository rooted at HOME warns once", async (t) => {
	const { cwd, environment } = fixture(t, true);
	const { handlers, notices, ctx } = start(cwd, environment);
	await handlers.get("session_start")!({}, ctx);
	const warnings = homeWarning(notices);
	assert.equal(warnings.length, 1, JSON.stringify(notices));
	assert.equal(warnings[0]!.severity, "warning");
	assert.match(warnings[0]!.message, /Open Tomidev Shell inside a project folder/);
	await handlers.get("session_start")!({ reason: "reload" }, ctx);
	assert.equal(homeWarning(notices).length, 1, "the warning is shown once per process and repository");
});

test("a normal project repository does not warn", async (t) => {
	const { cwd, environment } = fixture(t, false);
	const { handlers, notices, ctx } = start(cwd, environment);
	await handlers.get("session_start")!({}, ctx);
	assert.deepEqual(homeWarning(notices), []);
});

// S7 CR3: an unresolvable HOME is unknown, not a home-rooted repository. The
// bootstrap guard still fails closed there; the startup warning does not.
test("an unresolvable HOME neither warns nor breaks", async (t) => {
	const { cwd, environment } = fixture(t, false);
	const missingHome = join(cwd, "..", "..", "missing-home");
	process.env.HOME = missingHome;
	process.env.USERPROFILE = missingHome;
	const { handlers, notices, ctx } = start(cwd, { ...environment, HOME: missingHome, USERPROFILE: missingHome });
	await handlers.get("session_start")!({}, ctx);
	assert.deepEqual(homeWarning(notices), []);
});
