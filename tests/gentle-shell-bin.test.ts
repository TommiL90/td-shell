import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertNotRealHome } from "./support/isolated-home.ts";

// Integration tests for the thin bin/gentle-shell.mjs entry: they run the real
// file via spawnSync with an isolated HOME and a fake pi script standing in for
// the real @earendil-works/pi-coding-agent runtime, so the launcher's own logic
// (already covered at the unit level in tests/gentle-shell-launcher.test.ts)
// gets exercised end-to-end through real argv, env, and child-process wiring.

const binUrl = new URL("../bin/tomidev.mjs", import.meta.url);
const binPath = fileURLToPath(binUrl);
const packageRoot = dirname(dirname(binPath));

test("Herdr activity is discoverable through the isolated launcher package", async () => {
	const { buildPiInvocation } = await import("../lib/gentle-shell-launcher.ts");
	const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	assert.ok(manifest.pi.extensions.includes("./extensions"));
	assert.ok(existsSync(join(packageRoot, "extensions", "gentle-herdr-activity.ts")));
	for (const takeOver of [false, true]) {
		const invocation = buildPiInvocation({
			runtime: { kind: "path", command: "fake-pi", args: [] },
			home: { mode: "isolated", source: "default", dir: "/fake/home" },
			packageRoot, declaration: undefined, takeOver, otherPackagePaths: [],
			passthrough: [], baseEnv: {}, homedir: "/fake", cwd: "/fake/cwd",
		});
		assert.ok(invocation.args.includes(packageRoot));
		assert.equal(invocation.env.PI_CODING_AGENT_DIR, "/fake/home");
	}
});

test("real adjacent Pi resolves through its public entry without PATH or a runtime override", (t) => {
	const f = fixture(t);
	const result = spawnSync(process.execPath, [binPath, "--version"], {
		env: assertNotRealHome({ HOME: f.home, USERPROFILE: f.home, PATH: "", TOMIDEV_NO_AUTO_SETUP: "1" }),
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	// The adjacent peer is the release the open development range resolved,
	// not the manifest specifier.
	const installed: string = JSON.parse(readFileSync(join(packageRoot, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"), "utf8")).version;
	assert.match(result.stdout, new RegExp(`pi ${installed.replace(/\./g, "\\.")}\\b`));
	assert.equal(existsSync(join(f.home, ".tomidev", "agent")), false);
});

// A private copy places the launcher's resolution root outside this checkout,
// so absent-peer fallback is exercised without moving any real dependency.
function standaloneLauncher(t: test.TestContext) {
	const f = fixture(t);
	const root = join(f.root, "standalone");
	mkdirSync(join(root, "bin"), { recursive: true });
	writeFileSync(join(root, "bin", "tomidev.mjs"), readFileSync(binPath));
	writeFileSync(join(root, "package.json"), readFileSync(join(packageRoot, "package.json")));
	for (const dir of ["runtime", "scripts"]) symlinkSync(join(packageRoot, dir), join(root, dir), "junction");
	const env = {
		HOME: f.home, USERPROFILE: f.home, PATH: `${root}${delimiter}${dirname(process.execPath)}`, TOMIDEV_NO_AUTO_SETUP: "1",
		// Keep executable discovery isolated without making cmd shims unlaunchable.
		...(process.platform === "win32" ? { ComSpec: process.env.ComSpec, SystemRoot: process.env.SystemRoot } : {}),
	};
	return { ...f, root, env, launcher: join(root, "bin", "tomidev.mjs") };
}

test("a genuinely absent adjacent peer falls back to PATH", (t) => {
	const f = standaloneLauncher(t);
	writePathPiScript(f.root, "1.2.1");
	const result = spawnSync(process.execPath, [f.launcher, "--version"], { env: f.env, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /pi 1\.2\.1/);
});

test("a bundled runtime launch performs zero real version-probe spawns", (t) => {
	const f = standaloneLauncher(t);
	const peer = join(f.root, "node_modules", "@earendil-works", "pi-coding-agent");
	mkdirSync(join(peer, "dist", "bundle"), { recursive: true });
	writeFileSync(join(peer, "dist", "index.js"), "");
	writeFileSync(join(peer, "package.json"), JSON.stringify({
		name: "@earendil-works/pi-coding-agent", type: "module", version: "1.2.5",
		exports: { ".": { import: "./dist/index.js" } }, bin: { pi: "dist/bundle/cli.js" },
	}));
	const log = join(f.root, "version-probes.log");
	writeFileSync(log, "");
	writeFileSync(join(peer, "dist", "bundle", "cli.js"), [
		"import { appendFileSync } from 'node:fs';",
		"const args = process.argv.slice(2);",
		`if (args.length === 1 && args[0] === '--version') { appendFileSync(${JSON.stringify(log)}, 'x'); console.error('unexpected-version-probe'); process.exit(77); }`,
		"console.log('bundled-session-ok');",
	].join("\n"));
	const result = spawnSync(process.execPath, [f.launcher], { env: f.env, encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, "bundled-session-ok\n");
	assert.doesNotMatch(result.stderr, /unexpected-version-probe/);
	assert.equal(readFileSync(log, "utf8"), "", "only --version invocations record a probe");
});

test("malformed adjacent metadata never silently falls back to PATH; env override still wins", (t) => {
	const f = standaloneLauncher(t);
	const peer = join(f.root, "node_modules", "@earendil-works", "pi-coding-agent");
	mkdirSync(join(peer, "dist", "bundle"), { recursive: true });
	writeFileSync(join(peer, "dist", "index.js"), "");
	writePiScript(join(peer, "dist", "bundle", "cli.js"), "1.2.0");
	const fallback = writePathPiScript(f.root, "1.2.1");
	const base = { name: "@earendil-works/pi-coding-agent", type: "module", exports: { ".": { import: "./dist/index.js" } }, bin: { pi: "dist/bundle/cli.js" } };
	for (const metadata of [{ ...base, name: "impostor" }, { ...base, bin: { pi: "../outside.js" } }, { ...base, bin: {} }, "malformed"]) {
		writeFileSync(join(peer, "package.json"), metadata === "malformed" ? "{" : JSON.stringify(metadata));
		const result = spawnSync(process.execPath, [f.launcher, "--version"], { env: f.env, encoding: "utf8" });
		assert.equal(result.status, 1);
		assert.equal(result.stdout, "");
	}
	writeFileSync(join(peer, "package.json"), JSON.stringify({ ...base, name: "impostor" }));
	const override = spawnSync(process.execPath, [f.launcher, "--version"], { env: { ...f.env, TOMIDEV_PI: fallback }, encoding: "utf8" });
	assert.equal(override.status, 0, override.stderr);
	assert.match(override.stdout, /pi 1\.2\.1/);
});

// The launcher's own gentle-pi version, exactly as `ownPackageVersion()` in
// bin/gentle-shell.mjs reads it (package.json at packageRoot) — used to
// assert the post-install gentle-pi removal message and the provisioning
// marker's `gentlePi` field without hardcoding this package's own version.
function ownGentlePiVersion(): string {
	return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;
}

// TOMIDEV_NO_AUTO_SETUP=1 is in the base fixture env so every test that
// is not itself about auto-provisioning (S7) keeps today's plain-launch
// behavior: without it, every fixture-driven test against a fresh isolated
// home would install the companion packages through pi unless it also
// happened to disable the flow. The auto-provision test section below opts
// back in per test via enableAutoProvision.
function fixture(t: test.TestContext) {
	const root = mkdtempSync(join(tmpdir(), "gentle-shell-bin-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, "home");
	mkdirSync(home, { recursive: true });
	const piScript = join(root, "fake-pi.mjs");
	writePiScript(piScript, "1.2.0");
	const gentleShellHome = join(root, "gentle-shell-home");
	const env: NodeJS.ProcessEnv = {
		...process.env,
		HOME: home,
		USERPROFILE: home,
		TOMIDEV_HOME: gentleShellHome,
		TOMIDEV_PI: piScript,
		TOMIDEV_NO_AUTO_SETUP: "1",
		FAKE_PI_LOG: join(root, "pi-calls.log"),
	};
	// A suite launched from inside a Tomidev Shell session inherits the outer
	// session's recorded user Pi home, which --link now honours first (#2015).
	delete env.TOMIDEV_USER_PI_HOME;
	return { root, home, gentleShellHome, piScript, env };
}

// Removes the fixture's default TOMIDEV_NO_AUTO_SETUP=1 opt-out, for a
// test that specifically exercises auto-provisioning (S7).
function enableAutoProvision(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const { TOMIDEV_NO_AUTO_SETUP, ...rest } = env;
	return rest;
}

// Fake `pi` runtime for the setup and launch tests. For the packages setup
// manages (the companions and the two removals), each `install`/`remove` call
// appends one JSON line to $FAKE_PI_LOG (command, source, PI_CODING_AGENT_DIR,
// this script) and edits the home's settings.json `packages` list like the
// real command. Knobs, all optional: $FAKE_PI_FAIL="<command> <source> <exit
// code|KILL>" makes that call fail (KILL: the fake kills itself),
// $FAKE_PI_HANG="<command> <source>" makes it hang after announcing itself on
// stderr, and $FAKE_PI_DELAY_MS delays those calls. Every other invocation,
// including a forwarded `tomidev install npm:x`, prints one JSON line of what
// it received and leaves the home untouched.
function writePiScript(path: string, version: string) {
	writeFileSync(
		path,
		[
			"#!/usr/bin/env node",
			"const fs = process.getBuiltinModule('node:fs');",
			"const path = process.getBuiltinModule('node:path');",
			"const args = process.argv.slice(2);",
			`if (args.includes("--version")) { console.log(${JSON.stringify(version)}); process.exit(0); }`,
			"const [command, source] = args;",
			"const managed = ['npm:gentle-engram', 'npm:pi-web-access', 'npm:pi-btw', 'npm:pi-antigravity', 'npm:pi-cursor-sdk', 'npm:@juicesharp/rpiv-ask-user-question', 'npm:gentle-pi'];",
			"if ((command === 'install' || command === 'remove') && managed.includes(source)) {",
			"  const agentDir = process.env.PI_CODING_AGENT_DIR;",
			"  if (process.env.FAKE_PI_LOG) fs.appendFileSync(process.env.FAKE_PI_LOG, JSON.stringify({ command, source, PI_CODING_AGENT_DIR: agentDir, script: process.argv[1] }) + '\\n');",
			"  const [failCommand, failSource, failWith] = (process.env.FAKE_PI_FAIL ?? '').split(' ');",
			"  const finish = () => {",
			"    if (failCommand === command && failSource === source) {",
			"      if (failWith === 'KILL') process.kill(process.pid, 'SIGKILL');",
			"      process.stderr.write(`fake pi: ${command} ${source} failed\\n`);",
			"      process.exit(Number(failWith));",
			"    }",
			"    const settingsPath = path.join(agentDir, 'settings.json');",
			"    let settings = {};",
			"    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}",
			"    const identity = (spec) => { const body = spec.slice(4); const at = body.indexOf('@', body.startsWith('@') ? 1 : 0); return at === -1 ? body : body.slice(0, at); };",
			"    const entrySource = (entry) => typeof entry === 'string' ? entry : entry.source;",
			"    const packages = Array.isArray(settings.packages) ? settings.packages : [];",
			"    const same = (entry) => { const s = entrySource(entry); return s.startsWith('npm:') && identity(s) === identity(source); };",
			"    settings.packages = command === 'install' ? (packages.some(same) ? packages : [...packages, source]) : packages.filter((entry) => !same(entry));",
			"    fs.mkdirSync(agentDir, { recursive: true });",
			"    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\\n');",
			"    process.exit(0);",
			"  };",
			"  if (process.env.FAKE_PI_HANG === `${command} ${source}`) { process.stderr.write('TOMIDEV_TEST_CHILD_READY\\n'); setTimeout(finish, 60000); }",
			"  else setTimeout(finish, Number(process.env.FAKE_PI_DELAY_MS ?? 0));",
			"} else {",
			"  console.log(JSON.stringify({ args, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR, TOMIDEV_AGENT_HOME: process.env.TOMIDEV_AGENT_HOME, TOMIDEV_USER_PI_HOME: process.env.TOMIDEV_USER_PI_HOME, TOMIDEV_CHILD_PACKAGE_INJECTION: process.env.TOMIDEV_CHILD_PACKAGE_INJECTION, TOMIDEV_HERDR_REPORTER: process.env.TOMIDEV_HERDR_REPORTER }));",
			"  process.exit(0);",
			"}",
			"",
		].join("\n"),
	);
	chmodSync(path, 0o755);
}

// Match the real platform lookup: POSIX accepts the shebang executable,
// Windows discovers a .cmd shim via PATHEXT. Bundled JS peers stay unchanged.
function writePathPiScript(root: string, version: string): string {
	const script = join(root, process.platform === "win32" ? "pi-fixture.mjs" : "pi");
	writePiScript(script, version);
	if (process.platform !== "win32") return script;
	const command = join(root, "pi.cmd");
	writeFileSync(command, `@echo off\r\n"${process.execPath}" "${script}" %*\r\nexit /b %errorlevel%\r\n`);
	return command;
}

function run(env: NodeJS.ProcessEnv, args: string[], options: { cwd?: string } = {}) {
	return spawnSync(process.execPath, [binPath, ...args], { encoding: "utf8", env: assertNotRealHome(env), ...options });
}

// Herdr tests model terminal/socket metadata only: no socket is opened and the
// real managed bridge is never imported. The fake pi records launch resources.
function herdrFixture(t: test.TestContext) {
	const f = fixture(t);
	const bridge = join(f.home, ".pi", "agent", "extensions", "herdr-agent-state.ts");
	mkdirSync(dirname(bridge), { recursive: true });
	writeFileSync(bridge, "export default function () {}\n");
	const socket = join(f.root, "mock-herdr.sock");
	const preload = join(f.root, "terminal-and-socket.cjs");
	writeFileSync(preload, [
		"const fs = require('node:fs');",
		"const { syncBuiltinESMExports } = require('node:module');",
		"const originalStat = fs.statSync;",
		"fs.statSync = (path, ...args) => path === process.env.HERDR_SOCKET_PATH",
		"  ? { isSocket: () => process.env.TEST_SOCKET_VALID === '1' } : originalStat(path, ...args);",
		"process.stdin.isTTY = process.env.TEST_STDIN_TTY === '1';",
		"process.stdout.isTTY = process.env.TEST_STDOUT_TTY === '1';",
		"require('node:net').createConnection = () => { throw new Error('Live socket forbidden'); };",
		"syncBuiltinESMExports();",
	].join("\n"));
	const env: NodeJS.ProcessEnv = {
		...f.env,
		HERDR_ENV: "1", HERDR_SOCKET_PATH: socket, HERDR_PANE_ID: "mock-pane",
		TEST_SOCKET_VALID: "1", TEST_STDIN_TTY: "1", TEST_STDOUT_TTY: "1",
	};
	delete env.TOMIDEV_AGENTS_CHILD;
	// Keep parent agent-home inheritance out of every portable test fixture.
	delete env.PI_CODING_AGENT_DIR;
	const launchWithEnv = (args: string[] = [], overrides: NodeJS.ProcessEnv = {}) => {
		const result = spawnSync(process.execPath, ["--require", preload, binPath, ...args], {
			encoding: "utf8", env: assertNotRealHome({ ...env, ...overrides }), cwd: f.root,
		});
		assert.equal(result.status, 0, result.stderr);
		return JSON.parse(result.stdout) as { args: string[]; TOMIDEV_HERDR_REPORTER?: string };
	};
	const launch = (args: string[] = [], overrides: NodeJS.ProcessEnv = {}) => launchWithEnv(args, overrides).args;
	return { ...f, bridge, env, launch, launchWithEnv };
}

function extensionPaths(args: string[]): string[] {
	return args.flatMap((arg, i) => arg === "-e" || arg === "--extension" ? [args[i + 1]] : []);
}

test("Herdr isolated TUI launch reports as Tomidev Shell instead of loading Herdr's Pi bridge", (t) => {
	const f = herdrFixture(t);
	const launched = f.launchWithEnv();
	assert.ok(!extensionPaths(launched.args).includes(realpathSync(f.bridge)));
	assert.equal(launched.TOMIDEV_HERDR_REPORTER, "1");
	assert.equal(readFileSync(f.bridge, "utf8"), "export default function () {}\n");
});

test("Herdr keeps a bridge the selected home discovers anyway and never adds a competing reporter", (t) => {
	const f = herdrFixture(t);
	const previousHome = join(f.root, "previous-agent");
	const previousBridge = join(previousHome, "extensions", "herdr-agent-state.ts");
	mkdirSync(dirname(previousBridge), { recursive: true });
	writeFileSync(previousBridge, "export default function () {}\n");
	const previous = f.launchWithEnv([], { PI_CODING_AGENT_DIR: previousHome });
	assert.ok(!extensionPaths(previous.args).includes(realpathSync(previousBridge)));
	assert.ok(!extensionPaths(previous.args).includes(realpathSync(f.bridge)));
	assert.equal(previous.TOMIDEV_HERDR_REPORTER, "1");
	const selectedBridge = join(f.gentleShellHome, "extensions", "herdr-agent-state.ts");
	mkdirSync(dirname(selectedBridge), { recursive: true });
	writeFileSync(selectedBridge, "export default function () {}\n");
	const selected = f.launchWithEnv([], { PI_CODING_AGENT_DIR: previousHome, TOMIDEV_HERDR_REPORTER: "1" });
	assert.ok(extensionPaths(selected.args).includes(realpathSync(selectedBridge)));
	assert.ok(!extensionPaths(selected.args).includes(realpathSync(previousBridge)));
	assert.ok(!extensionPaths(selected.args).includes(realpathSync(f.bridge)));
	assert.equal(selected.TOMIDEV_HERDR_REPORTER, undefined);
});

test("Herdr keeps the managed bridge when the home's own declared gentle-pi is loaded instead of this package", (t) => {
	const f = herdrFixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	writeFileSync(join(f.gentleShellHome, "settings.json"), JSON.stringify({ packages: ["npm:tomidev@3.5.1"] }));
	// An installed copy may predate the Tomidev Shell reporter, so the pane must
	// not lose its only lifecycle reporter.
	const launched = f.launchWithEnv([], { TOMIDEV_HERDR_REPORTER: "1" });
	assert.ok(extensionPaths(launched.args).includes(realpathSync(f.bridge)));
	assert.equal(launched.TOMIDEV_HERDR_REPORTER, undefined);
});

test("Herdr identity handoff respects disabled extensions, headless modes and child launches", (t) => {
	const f = herdrFixture(t);
	const inherited = { TOMIDEV_HERDR_REPORTER: "1" };
	for (const args of [["--no-extensions"], ["-ne"], ["-p", "prompt"], ["--print", "prompt"],
		["--mode", "rpc"], ["--mode", "json"], ["--export", "session.jsonl"], ["--list-models"],
		["--link"], ["--home", f.gentleShellHome], ["list"]]) {
		const launched = f.launchWithEnv(args, inherited);
		assert.ok(!extensionPaths(launched.args).includes(realpathSync(f.bridge)), JSON.stringify(args));
		assert.equal(launched.TOMIDEV_HERDR_REPORTER, undefined, JSON.stringify(args));
	}
	for (const overrides of [{ HERDR_ENV: "0" }, { HERDR_ENV: undefined }, { HERDR_PANE_ID: "" },
		{ HERDR_SOCKET_PATH: "" }, { TEST_SOCKET_VALID: "0" }, { TEST_STDIN_TTY: "0" },
		{ TEST_STDOUT_TTY: "0" }, { TOMIDEV_AGENTS_CHILD: "1" }]) {
		const launched = f.launchWithEnv([], { ...inherited, ...overrides });
		assert.ok(!extensionPaths(launched.args).includes(realpathSync(f.bridge)), JSON.stringify(overrides));
		assert.equal(launched.TOMIDEV_HERDR_REPORTER, undefined, JSON.stringify(overrides));
	}
	assert.equal(f.launchWithEnv(["--mode", "text"]).TOMIDEV_HERDR_REPORTER, "1");
});

test("Herdr identity needs no installed Pi bridge and explicit resources are preserved", (t) => {
	const f = herdrFixture(t);
	const absentHome = join(f.root, "empty-home");
	mkdirSync(absentHome);
	assert.equal(f.launchWithEnv([], { HOME: absentHome, USERPROFILE: absentHome }).TOMIDEV_HERDR_REPORTER, "1");
	const alias = join(f.root, "bridge-alias.ts");
	symlinkSync(f.bridge, alias);
	const explicit = f.launchWithEnv(["-e", alias]);
	assert.ok(extensionPaths(explicit.args).includes(alias));
	assert.ok(!extensionPaths(explicit.args).includes(realpathSync(f.bridge)));
	assert.equal(explicit.TOMIDEV_HERDR_REPORTER, undefined);
	const disabled = f.launchWithEnv(["--no-extensions", "-e", alias]);
	assert.ok(extensionPaths(disabled.args).includes(alias));
	assert.ok(!extensionPaths(disabled.args).includes(realpathSync(f.bridge)));
	assert.equal(disabled.TOMIDEV_HERDR_REPORTER, undefined);
});

test("Pi real resource loader deduplicates the bridge across discovery, explicit files and package directories", async (t) => {
	const { DefaultResourceLoader, SettingsManager, createEventBus } = await import("@earendil-works/pi-coding-agent");
	for (const scenario of ["discovered", "explicit", "directory"] as const) {
		const f = fixture(t);
		const agentDir = join(f.home, ".pi", "agent");
		const bridge = join(agentDir, "extensions", "herdr-agent-state.ts");
		mkdirSync(dirname(bridge), { recursive: true });
		writeFileSync(bridge, "export default function (pi) { pi.events.emit('mock:bridge-loaded', {}); }\n");
		const canonical = realpathSync(bridge);
		const alias = join(f.root, "alias.ts");
		symlinkSync(bridge, alias);
		writeFileSync(join(agentDir, "package.json"), JSON.stringify({ pi: { extensions: ["./extensions/herdr-agent-state.ts"] } }));
		const eventBus = createEventBus();
		let factoryCalls = 0;
		eventBus.on("mock:bridge-loaded", () => { factoryCalls++; });
		const additionalExtensionPaths = scenario === "explicit" ? [alias, canonical, canonical]
			: scenario === "directory" ? [agentDir, canonical] : [canonical];
		const loader = new DefaultResourceLoader({ cwd: f.root, agentDir, eventBus,
			settingsManager: SettingsManager.inMemory({ extensions: ["-builtin:mcp", "-builtin:llama.cpp", "-builtin:codemode", "-builtin:tool-search"] }),
			additionalExtensionPaths, noExtensions: scenario !== "discovered", noSkills: true,
			noPromptTemplates: true, noThemes: true, noContextFiles: true,
		});
		await loader.reload();
		const loaded = loader.getExtensions();
		assert.deepEqual(loaded.errors, [], scenario);
		assert.equal(loaded.extensions.length, 1, scenario);
		assert.equal(factoryCalls, 1, scenario);
	}
});

// --- native setup helpers (T4a) ------------------------------------------------
//
// `setup` drives the resolved pi itself (writePiScript above) and no longer
// spawns gentle-ai. These read what the fake pi recorded, in call order, and
// the home's own settings and provisioning record.

const COMPANIONS = [
	"npm:gentle-engram",
	"npm:pi-web-access",
	"npm:pi-btw",
	"npm:pi-antigravity",
	"npm:pi-cursor-sdk",
];
const RPIV_SOURCE = "npm:@juicesharp/rpiv-ask-user-question";
const LEGACY_TOMIDEV_SOURCE = "npm:gentle-pi";

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function piCalls(f: { root: string }): { command: string; source: string; PI_CODING_AGENT_DIR: string; script: string }[] {
	const path = join(f.root, "pi-calls.log");
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
}

function installedSources(f: { root: string }): string[] {
	return piCalls(f).filter((call) => call.command === "install").map((call) => call.source);
}

function removedSources(f: { root: string }): string[] {
	return piCalls(f).filter((call) => call.command === "remove").map((call) => call.source);
}

function readSettings(dir: string) {
	return JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
}

function writeSettings(dir: string, settings: unknown) {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "settings.json"), `${JSON.stringify(settings)}\n`);
}

function readProvisioned(home: string): Record<string, Record<string, unknown>> | undefined {
	const configPath = join(home, ".tomidev", "config.json");
	return existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")).provisioned : undefined;
}

test("--help exits 0 and prints usage", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--help"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Usage: tomidev/);
});

test("home with no args prints the default isolated home", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["home"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout.trim(), `isolated ${f.gentleShellHome}`);
});

test("home link persists and a later home reflects it", (t) => {
	const f = fixture(t);
	const save = run(f.env, ["home", "link"]);
	assert.equal(save.status, 0, save.stderr);
	const configPath = join(f.home, ".tomidev", "config.json");
	assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { home: "link" });
	const check = run(f.env, ["home"]);
	assert.equal(check.status, 0, check.stderr);
	assert.match(check.stdout, /^link /);
});

test("home <path> persists a custom directory", (t) => {
	const f = fixture(t);
	const target = join(f.root, "custom-home");
	const save = run(f.env, ["home", target]);
	assert.equal(save.status, 0, save.stderr);
	const configPath = join(f.home, ".tomidev", "config.json");
	assert.deepEqual(JSON.parse(readFileSync(configPath, "utf8")), { home: target });
	const check = run(f.env, ["home"]);
	assert.equal(check.stdout.trim(), `path ${target}`);
});

// Test/development-only: TOMIDEV_CONFIG overrides the launcher
// config.json path (normally <homedir>/.tomidev/config.json), so a test
// or a field run against the real HOME (for example the packed-artifact E2E
// script, which needs `--link` probes against the real pi home) never
// touches the real ~/.tomidev/config.json. Documented as
// test/development-only in docs/readme-reference.md.
test("TOMIDEV_CONFIG redirects the config.json path used by 'home' and auto-provisioning", (t) => {
	const f = fixture(t);
	const overridePath = join(f.root, "alt-config.json");
	const env = { ...f.env, TOMIDEV_CONFIG: overridePath };

	const save = run(env, ["home", "link"]);
	assert.equal(save.status, 0, save.stderr);
	assert.deepEqual(JSON.parse(readFileSync(overridePath, "utf8")), { home: "link" });
	assert.equal(existsSync(join(f.home, ".tomidev", "config.json")), false);

	const check = run(env, ["home"]);
	assert.match(check.stdout, /^link /);
});

test("first isolated run bootstraps the home, writes fullscreen, and prints the hint once", (t) => {
	const f = fixture(t);
	assert.equal(existsSync(f.gentleShellHome), false);

	const first = run(f.env, []);
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stderr, /using a separate home at/);
	assert.match(first.stderr, /tomidev --link/);
	const settings = JSON.parse(readFileSync(join(f.gentleShellHome, "settings.json"), "utf8"));
	assert.equal(settings.tuiMode, "fullscreen");

	const second = run(f.env, []);
	assert.equal(second.status, 0, second.stderr);
	assert.doesNotMatch(second.stderr, /using a separate home at/);
});

// --- home import-pi ----------------------------------------------------------

function importPiFixture(t: test.TestContext) {
	const f = fixture(t);
	const env = { ...f.env, PI_CODING_AGENT_DIR: undefined };
	const piHome = join(f.home, ".pi", "agent");
	mkdirSync(piHome, { recursive: true });
	writeFileSync(join(piHome, "auth.json"), JSON.stringify({ anthropic: { type: "oauth", refresh: "dummy-refresh" } }), { mode: 0o600 });
	writeFileSync(join(piHome, "mcp.json"), JSON.stringify({ mcpServers: {} }));
	writeFileSync(join(piHome, "settings.json"), JSON.stringify({ defaultProvider: "anthropic", defaultModel: "m", packages: ["npm:foreign"], extensions: ["./x.ts"] }));
	writeFileSync(join(piHome, "mcp-cache.json"), "{}");
	return { ...f, env, piHome };
}

test("first isolated run without a pi home keeps the plain --link hint", (t) => {
	const f = fixture(t);
	const first = run({ ...f.env, PI_CODING_AGENT_DIR: undefined }, []);
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stderr, /Run 'tomidev --link' to reuse your pi sign-ins and chats\.\n/);
	assert.doesNotMatch(first.stderr, /import-pi/);
});

test("first isolated run with a pi sign-in also mentions home import-pi", (t) => {
	const f = importPiFixture(t);
	const first = run(f.env, []);
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stderr, /'tomidev --link' to reuse your pi sign-ins and chats, or 'tomidev home import-pi'/);
});

test("--help lists home import-pi", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--help"]);
	assert.match(result.stdout, /tomidev \[home selectors\] home import-pi \[--dry-run\]/);
});

test("home import-pi copies sign-ins, MCP servers and default model into the isolated home only", (t) => {
	const f = importPiFixture(t);
	const result = run(f.env, ["home", "import-pi"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /auth\.json: copied \(0600\)/);
	assert.match(result.stdout, /settings\.json defaultProvider: copied/);
	assert.doesNotMatch(result.stdout + result.stderr, /dummy-refresh/);
	assert.ok(existsSync(join(f.gentleShellHome, "auth.json")));
	assert.equal(existsSync(join(f.gentleShellHome, "mcp-cache.json")), false);
	if (process.platform !== "win32") assert.equal(statSync(join(f.gentleShellHome, "auth.json")).mode & 0o777, 0o600);
	const settings = JSON.parse(readFileSync(join(f.gentleShellHome, "settings.json"), "utf8"));
	assert.equal(settings.defaultProvider, "anthropic");
	assert.equal(settings.tuiMode, "fullscreen", "the home is bootstrapped as a normal first launch would");
	assert.equal(settings.packages, undefined);
	assert.equal(settings.extensions, undefined);
	assert.ok(existsSync(join(f.gentleShellHome, ".tomidev-home")));

	const again = run(f.env, ["home", "import-pi"]);
	assert.equal(again.status, 0, again.stderr);
	assert.match(again.stdout, /auth\.json: already present, kept/);
	assert.match(again.stdout, /Nothing to import/);
});

test("home import-pi --dry-run prints the plan and creates nothing", (t) => {
	const f = importPiFixture(t);
	const result = run(f.env, ["home", "import-pi", "--dry-run"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /auth\.json: would copy/);
	assert.equal(existsSync(f.gentleShellHome), false);
	assert.equal(existsSync(join(f.home, ".tomidev")), false);
});

test("home import-pi refuses link mode and a target that is the pi home itself", (t) => {
	const f = importPiFixture(t);
	const before = readFileSync(join(f.piHome, "settings.json"), "utf8");
	for (const argv of [["--link", "home", "import-pi"], ["--home", f.piHome, "home", "import-pi"]]) {
		const result = run(f.env, argv);
		assert.equal(result.status, 1, argv.join(" "));
		assert.match(result.stderr, /tomidev home import-pi: .*nothing to import/);
	}
	assert.equal(run(f.env, ["home", "link"]).status, 0);
	assert.equal(run(f.env, ["home", "import-pi"]).status, 1);
	assert.equal(readFileSync(join(f.piHome, "settings.json"), "utf8"), before);
	assert.equal(run(f.env, ["home", "import-pi", "--force"]).status, 2);
});

test("a --home filled by home import-pi is still auto-provisioned as gentle-shell's own", (t) => {
	const f = importPiFixture(t);
	const fresh = join(f.root, "fresh-home");
	const empty = join(f.root, "empty-home");
	mkdirSync(empty);
	const env = enableAutoProvision(f.env);
	for (const [index, target] of [fresh, empty].entries()) {
		const imported = run(f.env, ["--home", target, "home", "import-pi"]);
		assert.equal(imported.status, 0, imported.stderr);
		assert.match(imported.stdout, /auth\.json: copied/);
		const launch = run(env, ["--home", target, "--mode", "rpc"]);
		assert.equal(launch.status, 0, launch.stderr);
		assert.doesNotMatch(launch.stderr, /already has content and was not set up by tomidev/);
		assert.equal(installedSources(f).length, 5 * (index + 1), `auto-provisioning ran for ${target}`);
	}
});

test("home import-pi exits 1 and names the item when a write fails", { skip: process.platform === "win32" }, (t) => {
	const f = importPiFixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	writeFileSync(join(f.gentleShellHome, "settings.json"), "{}");
	writeFileSync(join(f.gentleShellHome, ".tomidev-home"), "{}");
	chmodSync(f.gentleShellHome, 0o500);
	let result;
	try {
		result = run(f.env, ["home", "import-pi"]);
	} finally {
		chmodSync(f.gentleShellHome, 0o700); // before the fixture's own cleanup
	}
	assert.equal(result.status, 1);
	assert.match(result.stdout, /auth\.json: failed/);
});

test("forwarded args reach pi after the injected extension flags, in order", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--mode", "rpc", "-p", "hi"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"-e",
		packageRoot,
		"--mode",
		"rpc",
		"-p",
		"hi",
	]);
	assert.equal(payload.TOMIDEV_AGENT_HOME, f.gentleShellHome);
});

// #1690: the spawned pi must carry the launcher's own -e set so the subagent
// runner can forward it to delegated children; a stale inherited value is replaced.
test("an isolated launch without a gentle-pi declaration signals its package injection to pi", (t) => {
	const f = fixture(t);
	const stale = JSON.stringify({ version: 1, noExtensions: true, extensionPaths: [join(f.root, "outer")] });
	for (const inherited of [undefined, stale]) {
		const result = run({ ...f.env, TOMIDEV_CHILD_PACKAGE_INJECTION: inherited }, ["--mode", "rpc"]);
		assert.equal(result.status, 0, result.stderr);
		const payload = JSON.parse(result.stdout);
		assert.deepEqual(payload.args.slice(0, 2), ["-e", packageRoot]);
		assert.deepEqual(JSON.parse(payload.TOMIDEV_CHILD_PACKAGE_INJECTION), { version: 1, noExtensions: false, extensionPaths: [packageRoot] });
	}
});

test("an isolated launch keeps its own agent home and carries the user's original Pi home, even when nested", (t) => {
	const f = fixture(t);
	const base = { ...f.env };
	delete base.PI_CODING_AGENT_DIR;
	delete base.TOMIDEV_USER_PI_HOME;
	const launch = (overrides: NodeJS.ProcessEnv, args: string[] = []) => {
		const result = run({ ...base, ...overrides }, [...args, "--mode", "rpc"]);
		assert.equal(result.status, 0, result.stderr);
		return JSON.parse(result.stdout);
	};
	const conventional = launch({});
	assert.equal(conventional.PI_CODING_AGENT_DIR, f.gentleShellHome);
	assert.equal(conventional.TOMIDEV_USER_PI_HOME, join(f.home, ".pi", "agent"));
	const customHome = join(f.root, "custom-pi");
	const custom = launch({ PI_CODING_AGENT_DIR: customHome });
	assert.equal(custom.PI_CODING_AGENT_DIR, f.gentleShellHome);
	assert.equal(custom.TOMIDEV_AGENT_HOME, f.gentleShellHome);
	assert.equal(custom.TOMIDEV_USER_PI_HOME, customHome);
	// A gentle-shell started from inside a Tomidev Shell session inherits both variables.
	const nested = launch({ PI_CODING_AGENT_DIR: custom.PI_CODING_AGENT_DIR, TOMIDEV_USER_PI_HOME: custom.TOMIDEV_USER_PI_HOME });
	assert.equal(nested.PI_CODING_AGENT_DIR, f.gentleShellHome);
	assert.equal(nested.TOMIDEV_USER_PI_HOME, customHome);
	const linked = launch({ PI_CODING_AGENT_DIR: customHome }, ["--link"]);
	assert.equal(linked.PI_CODING_AGENT_DIR, customHome);
	assert.equal(linked.TOMIDEV_USER_PI_HOME, customHome);
	// --link from inside an isolated session reuses the preserved original home (#2015).
	const nestedLinked = launch({ PI_CODING_AGENT_DIR: f.gentleShellHome, TOMIDEV_USER_PI_HOME: customHome }, ["--link"]);
	assert.equal(nestedLinked.PI_CODING_AGENT_DIR, customHome);
	assert.equal(nestedLinked.TOMIDEV_USER_PI_HOME, customHome);
	assert.equal(existsSync(join(customHome, "sessions")), false);
});

test("--link skips injection and leaves settings.json byte-identical when it already declares gentle-pi", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });
	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = '{"packages":["npm:tomidev"],"theme":"kept"}';
	writeFileSync(settingsPath, settingsText);
	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };

	const result = run(env, ["--link", "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--mode", "rpc"]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
	assert.equal(payload.PI_CODING_AGENT_DIR, piAgentDir);
	assert.equal(existsSync(join(piAgentDir, ".tomidev")), false);
});

// --- injection skip for isolated/--home homes once they declare gentle-pi (S3) ---
//
// `tomidev setup` installs npm:gentle-pi into the home's settings.json;
// once that declaration exists, isolated and --home homes must stop
// injecting the launcher's own copy on top of it, the same way --link
// already does. Homes without a declaration keep the plain injection.

test("an isolated home whose settings.json declares npm:gentle-pi gets no injection", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	writeFileSync(join(f.gentleShellHome, "settings.json"), JSON.stringify({ packages: ["npm:tomidev@3.5.1"], tuiMode: "fullscreen" }));

	const result = run(f.env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--mode", "rpc"]);
	assert.equal(payload.PI_CODING_AGENT_DIR, f.gentleShellHome);
});

test("an isolated home whose settings.json does not declare gentle-pi keeps the plain injection", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	writeFileSync(join(f.gentleShellHome, "settings.json"), JSON.stringify({ tuiMode: "fullscreen" }));

	const result = run(f.env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"-e",
		packageRoot,
		"--mode",
		"rpc",
	]);
});

test("an isolated home whose settings.json declares a path-based gentle-pi takes over, same as --link", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));
	writeFileSync(join(f.gentleShellHome, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"], tuiMode: "fullscreen" }));

	const result = run(f.env, ["--mode", "rpc"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over tomidev from/);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		packageRoot,
		"--mode",
		"rpc",
	]);
});

test("tomidev list forwards to pi as a bare subcommand, with no injected extension flags", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["list"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["list"]);
	assert.equal(payload.PI_CODING_AGENT_DIR, f.gentleShellHome);
});

test("tomidev install npm:<pkg> forwards the subcommand and its argument verbatim", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["install", "npm:some-other-pkg"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["install", "npm:some-other-pkg"]);
	assert.equal(payload.PI_CODING_AGENT_DIR, f.gentleShellHome);
});

// #2140: pi dispatches `mcp` on argv[0] only, so an injected -e ahead of it
// turned `tomidev mcp list` into an interactive prompt.
test("tomidev mcp add <server> -- <cmd> forwards to pi's own mcp verbatim, with no injected extension flags", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["mcp", "add", "demo", "--", "npx", "-y", "demo-server"]);
	assert.equal(result.status, 0, result.stderr);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["mcp", "add", "demo", "--", "npx", "-y", "demo-server"]);
	assert.equal(payload.PI_CODING_AGENT_DIR, f.gentleShellHome);
});

test("a too-old pi exits 1 naming both versions", (t) => {
	const f = fixture(t);
	writePiScript(f.piScript, "0.80.0");
	const result = run(f.env, []);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /0\.80\.0/);
	assert.match(result.stderr, /1\.2\.0/);
});

test("--version prints three lines", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--version"]);
	assert.equal(result.status, 0, result.stderr);
	const lines = result.stdout.trim().split("\n");
	assert.equal(lines.length, 3);
	assert.match(lines[0], /^tomidev /);
	assert.match(lines[1], /^pi 1\.2\.0$/);
	assert.match(lines[2], /^home isolated /);
});

// --- setup subcommand -------------------------------------------------------

test("tomidev setup installs the three companion packages through the resolved pi into a fresh home", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(installedSources(f), COMPANIONS);
	assert.deepEqual(removedSources(f), []);
	for (const call of piCalls(f)) {
		assert.equal(call.PI_CODING_AGENT_DIR, f.gentleShellHome);
		assert.equal(call.script, f.piScript, "setup must drive the same pi gentle-shell resolved");
	}
	assert.deepEqual(readSettings(f.gentleShellHome).packages, COMPANIONS);
	assert.equal(result.stdout, "", "manual setup prints nothing on stdout");
});

test("tomidev setup keeps the bootstrap defaults and excludes builtin codemode, and never writes -builtin:mcp", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	const settings = readSettings(f.gentleShellHome);
	assert.equal(settings.tuiMode, "fullscreen");
	assert.equal(settings.theme, "tomidev");
	assert.deepEqual(settings.extensions, [CODEMODE_EXCLUSION]);
	assert.ok(!settings.extensions.includes("-builtin:mcp"));
});

test("tomidev setup skips a companion the home already declares, whatever its version", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: ["npm:pi-btw@0.3.0"] });
	const result = run(f.env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(installedSources(f), ["npm:gentle-engram", "npm:pi-web-access", "npm:pi-antigravity", "npm:pi-cursor-sdk"]);
	assert.deepEqual(readSettings(f.gentleShellHome).packages, ["npm:pi-btw@0.3.0", "npm:gentle-engram", "npm:pi-web-access", "npm:pi-antigravity", "npm:pi-cursor-sdk"]);
});

test("tomidev setup removes only a declared rpiv ask-user-question package, before it installs the companions", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: [`${RPIV_SOURCE}@1.2.3`, "npm:pi-btw"] });
	const result = run(f.env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(
		piCalls(f).map((call) => `${call.command} ${call.source}`),
		[`remove ${RPIV_SOURCE}`, "install npm:gentle-engram", "install npm:pi-web-access", "install npm:pi-antigravity", "install npm:pi-cursor-sdk"],
	);
	assert.deepEqual(readSettings(f.gentleShellHome).packages, ["npm:pi-btw", "npm:gentle-engram", "npm:pi-web-access", "npm:pi-antigravity", "npm:pi-cursor-sdk"]);
});

test("tomidev setup removes a declared npm:gentle-pi once, then leaves it alone", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: ["npm:gentle-pi@3.5.1", "npm:pi-btw"] });
	const first = run(f.env, ["setup"]);
	assert.equal(first.status, 0, first.stderr);
	assert.deepEqual(removedSources(f), [LEGACY_TOMIDEV_SOURCE]);
	assert.ok(!readSettings(f.gentleShellHome).packages.some((entry) => String(entry).startsWith("npm:gentle-pi")));

	const before = piCalls(f).length;
	const second = run(f.env, ["setup"]);
	assert.equal(second.status, 0, second.stderr);
	assert.deepEqual(piCalls(f).slice(before).filter((call) => call.command === "remove"), []);
});

test("tomidev setup keeps MCP enabled: it warns about a built-in MCP exclusion the user set, and never adds one", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { tuiMode: "fullscreen", extensions: ["-builtin:mcp"], packages: [] });
	const mcpPath = join(f.gentleShellHome, "mcp.json");
	const mcpText = '{"mcpServers":{"context7":{"command":"npx","args":["context7-mcp"]}}}';
	writeFileSync(mcpPath, mcpText);
	const result = run(f.env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(readSettings(f.gentleShellHome).extensions, ["-builtin:mcp", CODEMODE_EXCLUSION]);
	assert.match(result.stderr, /WARNING: Pi built-in MCP is disabled/);
	assert.equal(readFileSync(mcpPath, "utf8"), mcpText);
});

test("tomidev setup --dry-run writes nothing, runs no pi, and prints the planned steps", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["setup", "--dry-run"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(f.gentleShellHome), false, "a dry run must not bootstrap the home either");
	assert.equal(existsSync(join(f.home, ".tomidev", "config.json")), false);
	assert.deepEqual(piCalls(f), []);
	for (const source of COMPANIONS) {
		assert.match(result.stderr, new RegExp(`would install ${escapeRegExp(source)} into ${escapeRegExp(f.gentleShellHome)}`));
	}
});

test("tomidev setup --dry-run leaves an existing home byte-identical and names the removal it would make", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { tuiMode: "fullscreen", packages: [`${RPIV_SOURCE}@1.2.3`, "npm:pi-btw"] });
	const settingsPath = join(f.gentleShellHome, "settings.json");
	const before = readFileSync(settingsPath, "utf8");
	const result = run(f.env, ["setup", "--dry-run"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(readFileSync(settingsPath, "utf8"), before);
	assert.deepEqual(piCalls(f), []);
	assert.equal(existsSync(join(f.home, ".tomidev", "config.json")), false);
	assert.match(result.stderr, new RegExp(`would remove ${escapeRegExp(RPIV_SOURCE)} from ${escapeRegExp(f.gentleShellHome)}`));
	assert.match(result.stderr, /would install npm:gentle-engram/);
	assert.doesNotMatch(result.stderr, /would install npm:pi-btw/);
});

test("a failing pi install exits manual setup with its status, names the package, stops, and records nothing", (t) => {
	const f = fixture(t);
	const result = run({ ...f.env, FAKE_PI_FAIL: "install npm:pi-web-access 7" }, ["setup"]);
	assert.equal(result.status, 7, result.stderr);
	assert.match(result.stderr, /tomidev: could not install npm:pi-web-access; run `tomidev install npm:pi-web-access` before starting/);
	assert.deepEqual(installedSources(f), ["npm:gentle-engram", "npm:pi-web-access"], "stops at the first failure");
	assert.equal(readProvisioned(f.home), undefined);
});

test("a failing pi remove of the rpiv package exits manual setup with its status and an actionable message", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: [RPIV_SOURCE] });
	const result = run({ ...f.env, FAKE_PI_FAIL: `remove ${RPIV_SOURCE} 7` }, ["setup"]);
	assert.equal(result.status, 7, result.stderr);
	assert.match(result.stderr, /tomidev: could not remove npm:@juicesharp\/rpiv-ask-user-question; run `tomidev remove npm:@juicesharp\/rpiv-ask-user-question` before starting/);
	assert.deepEqual(installedSources(f), [], "no companion is installed after a failed removal");
});

// The remediation must name the home the setup ran against, shell-quoted, so a
// copy-pasted command acts on the same home.
test("a failing pi remove under --home names that home in the remediation, shell-quoted", (t) => {
	const f = fixture(t);
	const target = join(f.root, "custom home");
	writeSettings(target, { packages: [RPIV_SOURCE] });
	const result = run({ ...f.env, FAKE_PI_FAIL: `remove ${RPIV_SOURCE} 7` }, ["--home", target, "setup"]);
	assert.equal(result.status, 7, result.stderr);
	assert.match(
		result.stderr,
		new RegExp(`run \`tomidev --home '${escapeRegExp(target)}' remove npm:@juicesharp/rpiv-ask-user-question\` before starting`),
	);
});

test("setup MCP migration warns without re-enabling configured servers", (t) => {
	for (const mode of ["link", "path"]) {
		const f = fixture(t);
		const target = join(f.root, "mcp-home");
		mkdirSync(target);
		const settings = { packages: COMPANIONS, extensions: ["-builtin:mcp", "user.ts"] };
		writeFileSync(join(target, "settings.json"), JSON.stringify(settings));
		const mcp = '{"mcpServers":{"context7":{"command":"npx"}}}';
		writeFileSync(join(target, "mcp.json"), mcp);
		const args = mode === "link" ? ["--link", "setup"] : ["--home", target, "setup"];
		const result = run({ ...f.env, PI_CODING_AGENT_DIR: target }, args);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "");
		assert.equal(result.stderr, `tomidev: provisioning ${target} with the companion packages\n` +
			`tomidev: WARNING: Pi built-in MCP is disabled in ${join(target, "settings.json")}; pi-mcp-adapter is absent or inactive, so servers in ${join(target, "mcp.json")} will not load. If you want these servers enabled, remove -builtin:mcp from extensions in ${join(target, "settings.json")}, then restart Pi. If MCP is intentionally disabled, keep the setting.\n`);
		assert.deepEqual(JSON.parse(settingsText(target)), settings);
		assert.equal(readFileSync(join(target, "mcp.json"), "utf8"), mcp);
		assert.deepEqual(piCalls(f), []);
	}
});

test("setup MCP migration keeps enabled, unconfigured and dry-run homes unchanged", (t) => {
	for (const scenario of ["enabled", "unconfigured", "dry-run", "active-adapter"]) {
		const f = fixture(t);
		const target = join(f.root, "mcp-home");
		mkdirSync(target);
		const settings = JSON.stringify({ extensions: scenario === "enabled" ? [] : ["-builtin:mcp"], packages: [...COMPANIONS, ...(scenario === "active-adapter" ? ["npm:pi-mcp-adapter@3.0.0"] : [])] });
		const mcp = JSON.stringify({ mcpServers: scenario === "unconfigured" ? {} : { context7: { command: "npx" } } });
		writeFileSync(join(target, "settings.json"), settings);
		writeFileSync(join(target, "mcp.json"), mcp);
		const result = run({ ...f.env, PI_CODING_AGENT_DIR: target }, ["--link", "setup", ...(scenario === "dry-run" ? ["--dry-run"] : [])]);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "");
		assert.doesNotMatch(result.stderr, /WARNING:/);
		assert.equal(settingsText(target), settings);
		assert.equal(readFileSync(join(target, "mcp.json"), "utf8"), mcp);
		assert.deepEqual(piCalls(f), []);
	}
});

test("setup MCP migration warns when adapter resource loading is disabled", (t) => {
	for (const adapter of [
		{ source: "npm:pi-mcp-adapter", autoload: false },
		{ source: "npm:pi-mcp-adapter", autoload: false, extensions: ["!**"] },
		{ source: "npm:pi-mcp-adapter", extensions: ["!**"] },
		{ source: "npm:pi-mcp-adapter", extensions: ["index.ts"] },
	]) {
		const f = fixture(t);
		const target = join(f.root, "mcp-home");
		mkdirSync(target);
		const settings = JSON.stringify({ extensions: ["-builtin:mcp"], packages: [...COMPANIONS, adapter] });
		const mcp = '{"mcpServers":{"context7":{"command":"npx"}}}';
		writeFileSync(join(target, "settings.json"), settings);
		writeFileSync(join(target, "mcp.json"), mcp);
		const result = run({ ...f.env, PI_CODING_AGENT_DIR: target }, ["--link", "setup"]);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, "");
		assert.match(result.stderr, /WARNING: Pi built-in MCP is disabled/);
		assert.match(result.stderr, adapter.extensions?.includes("index.ts") ? /activity cannot be confirmed.*may not load/ : /absent or inactive.*will not load/);
		assert.equal(settingsText(target), settings);
		assert.equal(readFileSync(join(target, "mcp.json"), "utf8"), mcp);
		assert.deepEqual(piCalls(f), []);
	}
});

test("tomidev setup removes both conflicting packages in declaration order", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome);
	writeFileSync(join(f.gentleShellHome, "settings.json"), JSON.stringify({ packages: [LEGACY_TOMIDEV_SOURCE, RPIV_SOURCE, ...COMPANIONS] }));
	const result = run(f.env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, "");
	assert.deepEqual(removedSources(f), [LEGACY_TOMIDEV_SOURCE, RPIV_SOURCE]);
	assert.deepEqual(installedSources(f), []);
	assert.deepEqual(JSON.parse(settingsText(f.gentleShellHome)).packages, COMPANIONS);
});

test("tomidev setup never spawns or requires a gentle-ai binary", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /gentle-ai/);
	assert.deepEqual(installedSources(f), COMPANIONS);
});

test("tomidev --link setup installs the companions into the user's own pi home, without theme or codemode changes", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent-link");
	writeSettings(piAgentDir, { tuiMode: "fullscreen" });
	const result = run({ ...f.env, PI_CODING_AGENT_DIR: piAgentDir }, ["--link", "setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(installedSources(f), COMPANIONS);
	const settings = readSettings(piAgentDir);
	assert.equal(settings.theme, undefined, "link mode never gains a theme");
	assert.equal(settings.extensions, undefined, "link mode never gains the codemode exclusion");
});

test("tomidev setup accepts a home selector before it and provisions that home", (t) => {
	const f = fixture(t);
	const target = join(f.root, "custom-home");
	const result = run(f.env, ["--home", target, "setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(installedSources(f).length, 5);
	assert.ok(piCalls(f).every((call) => call.PI_CODING_AGENT_DIR === target));
	assert.equal(readSettings(target).tuiMode, "fullscreen");
});

test("tomidev setup passes through the exit status of a failing companion install", (t) => {
	const f = fixture(t);
	const result = run({ ...f.env, FAKE_PI_FAIL: "install npm:gentle-engram 3" }, ["setup"]);
	assert.equal(result.status, 3, result.stderr);
});

test("a successful manual setup records the home with the launcher's setup version", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision(f.env);
	const setup = run(env, ["setup"]);
	assert.equal(setup.status, 0, setup.stderr);
	const entry = readProvisioned(f.home)?.[realpathSync(f.gentleShellHome)];
	assert.equal(entry?.setupVersion, 2);
	assert.equal(entry?.gentlePi, ownGentlePiVersion());
	assert.equal(entry?.gentleAi, undefined, "the record no longer names a gentle-ai pin");
	assert.equal(typeof entry?.at, "string");

	const launch = run(env, ["--mode", "rpc"]);
	assert.equal(launch.status, 0, launch.stderr);
	assert.doesNotMatch(launch.stderr, /first run in/);
	assert.equal(installedSources(f).length, 5, "the first launch must not install the companions again");
});

test("an entry written by the gentle-ai based setup re-provisions exactly once, then is rewritten", (t) => {
	const f = fixture(t);
	const home = f.gentleShellHome;
	writeSettings(home, { tuiMode: "fullscreen", theme: "tomidev" });
	mkdirSync(join(f.home, ".tomidev"), { recursive: true });
	writeFileSync(
		join(f.home, ".tomidev", "config.json"),
		JSON.stringify({ provisioned: { [realpathSync(home)]: { gentleAi: "3.6.1", gentlePi: ownGentlePiVersion(), at: "2026-01-01T00:00:00.000Z" } } }),
	);
	const env = enableAutoProvision(f.env);

	const first = run(env, ["--mode", "rpc"]);
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stderr, /setup version changed \(unknown -> 2\)/);
	assert.deepEqual(installedSources(f), COMPANIONS);
	const entry = readProvisioned(f.home)?.[realpathSync(home)];
	assert.equal(entry?.setupVersion, 2);
	assert.equal(entry?.gentleAi, undefined);

	const second = run(env, ["--mode", "rpc"]);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(installedSources(f).length, 5, "the rewritten record stops further re-provisioning");
});

test("a declared npm:gentle-pi is removed before a failing companion install, and the launch then injects the local package", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: [`${LEGACY_TOMIDEV_SOURCE}@3.5.1`] });
	const env = enableAutoProvision({ ...f.env, FAKE_PI_FAIL: "install npm:gentle-engram 5" });
	const result = run(env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(removedSources(f), [LEGACY_TOMIDEV_SOURCE]);
	assert.match(result.stderr, /tomidev: automatic setup failed \(exit 5\); starting anyway and retrying next run\. Run `tomidev setup` to see the full output\./);
	assert.deepEqual(JSON.parse(result.stdout).args, ["-e", packageRoot, "--mode", "rpc"]);
});

test("a later normal launch injects the launcher's own package root once gentle-pi is removed from settings.json", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: [`${LEGACY_TOMIDEV_SOURCE}@3.5.1`] });
	const setupResult = run(f.env, ["setup"]);
	assert.equal(setupResult.status, 0, setupResult.stderr);
	assert.ok(!readSettings(f.gentleShellHome).packages.includes(`${LEGACY_TOMIDEV_SOURCE}@3.5.1`));

	const result = run(f.env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout).args, ["-e", packageRoot, "--mode", "rpc"]);
});

// A hung pi remove must be killed at the ceiling and reported in seconds.
test("a hung pi remove during automatic provisioning is killed after the timeout ceiling and reports it in seconds", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: [RPIV_SOURCE] });
	const env = enableAutoProvision({
		...f.env,
		FAKE_PI_HANG: `remove ${RPIV_SOURCE}`,
		TOMIDEV_AUTO_SETUP_TIMEOUT_MS: "2000",
	});

	const started = Date.now();
	const result = run(env, ["--mode", "rpc", "-p", "hi"]);
	const elapsed = Date.now() - started;
	assert.equal(result.status, 0, result.stderr);
	assert.ok(elapsed < 15000, `expected the hung 'pi remove' to be killed quickly, took ${elapsed}ms`);
	assert.match(result.stderr, /tomidev: pi remove npm:@juicesharp\/rpiv-ask-user-question timed out after 2 seconds/);
	assert.deepEqual(JSON.parse(result.stdout).args.slice(-4), ["--mode", "rpc", "-p", "hi"]);
});

// --- automatic first-run provisioning (S7) ---------------------------------
//
// A plain `gentle-shell` in an isolated or `--home` home runs the same flow as
// `tomidev setup` before launching pi, when the home was never provisioned or
// was provisioned by an older setup version (or launcher version).

test("first launch auto-provisions the isolated home, writes the record, then launches pi; stdout carries only pi's output", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision(f.env);

	const result = run(env, ["--mode", "rpc", "-p", "hi"]);
	assert.equal(result.status, 0, result.stderr);

	assert.deepEqual(installedSources(f), COMPANIONS);
	// stdout carries only the final pi invocation's own output: the flow's own
	// output and the launcher's notices all went to stderr.
	const stdoutLines = result.stdout.trim().split("\n").filter((line) => line.length > 0);
	assert.equal(stdoutLines.length, 1, result.stdout);
	assert.deepEqual(JSON.parse(stdoutLines[0]).args.slice(-4), ["--mode", "rpc", "-p", "hi"]);

	assert.match(result.stderr, /tomidev: first run in .+: installing the companion packages \(one time; set TOMIDEV_NO_AUTO_SETUP=1 to skip\)/);
	const entry = readProvisioned(f.home)?.[realpathSync(f.gentleShellHome)];
	assert.equal(entry?.setupVersion, 2);
	assert.equal(entry?.gentlePi, ownGentlePiVersion());
	assert.equal(typeof entry?.at, "string");
	assert.equal(existsSync(join(f.gentleShellHome, ".tomidev-setup.lock")), false);
});

test("a second launch against an already-provisioned home skips the flow entirely", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision(f.env);

	const first = run(env, []);
	assert.equal(first.status, 0, first.stderr);
	assert.equal(installedSources(f).length, 5);

	const second = run(env, []);
	assert.equal(second.status, 0, second.stderr);
	assert.doesNotMatch(second.stderr, /first run in|setup version changed|tomidev package changed/);
	assert.equal(installedSources(f).length, 5, "pi must not install the companions a second time");
});

// A record without a `gentlePi` field predates launcher version tracking: it
// never counts as a match, so the next launch re-provisions and backfills it.
test("a record without a gentlePi field re-runs the flow and backfills it", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision(f.env);
	assert.equal(run(env, []).status, 0);

	const configPath = join(f.home, ".tomidev", "config.json");
	const homeKey = realpathSync(f.gentleShellHome);
	const staleConfig = JSON.parse(readFileSync(configPath, "utf8"));
	delete staleConfig.provisioned[homeKey].gentlePi;
	writeFileSync(configPath, JSON.stringify(staleConfig));

	const second = run(env, []);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(readProvisioned(f.home)?.[homeKey]?.gentlePi, ownGentlePiVersion());
});

test("a changed gentle-pi version re-runs the flow and prints the gentle-pi-changed line", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision(f.env);
	assert.equal(run(env, []).status, 0);

	const configPath = join(f.home, ".tomidev", "config.json");
	const homeKey = realpathSync(f.gentleShellHome);
	const staleConfig = JSON.parse(readFileSync(configPath, "utf8"));
	staleConfig.provisioned[homeKey].gentlePi = "0.0.0-previous-launcher";
	writeFileSync(configPath, JSON.stringify(staleConfig));

	const second = run(env, []);
	assert.equal(second.status, 0, second.stderr);
	assert.match(second.stderr, new RegExp(`tomidev: tomidev package changed \\(0\\.0\\.0-previous-launcher -> ${escapeRegExp(ownGentlePiVersion())}\\): updating`));
	assert.equal(readProvisioned(f.home)?.[homeKey]?.gentlePi, ownGentlePiVersion());
});

test("a failing companion install in automatic mode warns, still launches pi, and records nothing", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision({ ...f.env, FAKE_PI_FAIL: "install npm:pi-btw 7" });

	const result = run(env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stderr,
		/tomidev: automatic setup failed \(exit 7\); starting anyway and retrying next run\. Run `tomidev setup` to see the full output\./,
	);
	assert.match(result.stderr, /tomidev: could not install npm:pi-btw; run `tomidev install npm:pi-btw` before starting/);
	assert.deepEqual(JSON.parse(result.stdout).args.slice(-2), ["--mode", "rpc"]);
	assert.equal(readProvisioned(f.home), undefined, "a failed setup is retried on the next launch");
});

test("a failing automatic setup names the --home selector in its retry remediation", (t) => {
	const f = fixture(t);
	const target = join(f.root, "custom-home");
	const env = enableAutoProvision({ ...f.env, FAKE_PI_FAIL: "install npm:gentle-engram 5" });

	const result = run(env, ["--home", target, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stderr,
		new RegExp(`Run \`tomidev --home ${escapeRegExp(target)} setup\` to see the full output\\.`),
	);
});

test("a failing automatic setup includes the underlying message on the line after the generic failure line", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision({ ...f.env, FAKE_PI_FAIL: "install npm:pi-web-access 7" });

	const result = run(env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const lines = result.stderr.trim().split("\n");
	const failureIndex = lines.findIndex((line) => /tomidev: automatic setup failed/.test(line));
	assert.notEqual(failureIndex, -1, result.stderr);
	assert.match(lines[failureIndex + 1], /tomidev: could not install npm:pi-web-access/);
});

test("a failing automatic setup whose child dies by a signal on its own is an ordinary failure: pi still launches", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision({ ...f.env, FAKE_PI_FAIL: "install npm:gentle-engram KILL" });

	const result = run(env, ["--mode", "rpc", "-p", "hi"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /tomidev: automatic setup failed/);
	assert.deepEqual(JSON.parse(result.stdout).args.slice(-4), ["--mode", "rpc", "-p", "hi"]);
});

test("a failing automatic setup removes declared npm:gentle-pi only once, even across a retry", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { packages: [`${LEGACY_TOMIDEV_SOURCE}@3.5.1`] });
	const failing = enableAutoProvision({ ...f.env, FAKE_PI_FAIL: "install npm:gentle-engram 5" });
	assert.equal(run(failing, ["--mode", "rpc"]).status, 0);

	const retry = enableAutoProvision(f.env);
	assert.equal(run(retry, ["--mode", "rpc"]).status, 0);
	assert.deepEqual(removedSources(f), [LEGACY_TOMIDEV_SOURCE]);
	assert.deepEqual(installedSources(f), ["npm:gentle-engram", "npm:gentle-engram", "npm:pi-web-access", "npm:pi-btw", "npm:pi-antigravity", "npm:pi-cursor-sdk"]);
});

test("TOMIDEV_NO_AUTO_SETUP=1 skips auto-provisioning entirely", (t) => {
	const f = fixture(t);
	const env = { ...f.env, TOMIDEV_NO_AUTO_SETUP: "1" };

	const result = run(env, []);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(piCalls(f), []);
	assert.equal(existsSync(join(f.home, ".tomidev", "config.json")), false);
});

test("--link never auto-provisions", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });
	const env = enableAutoProvision({ ...f.env, PI_CODING_AGENT_DIR: piAgentDir });

	const result = run(env, ["--link", "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(piCalls(f), []);
	assert.equal(existsSync(join(piAgentDir, ".tomidev-setup.lock")), false);
});

test("a pi subcommand (list) never auto-provisions", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision(f.env);

	const result = run(env, ["list"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(piCalls(f), []);
	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["list"]);
});

test("a fresh concurrent lock skips auto-provisioning for this run, without removing the lock", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	const lockPath = join(f.gentleShellHome, ".tomidev-setup.lock");
	writeFileSync(lockPath, "");
	const env = enableAutoProvision(f.env);

	const result = run(env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(piCalls(f), []);
	assert.match(result.stderr, /already provisioning/);
	assert.equal(existsSync(lockPath), true);
});

test("a stale lock (older than 15 minutes) is removed and auto-provisioning proceeds", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	const lockPath = join(f.gentleShellHome, ".tomidev-setup.lock");
	writeFileSync(lockPath, "");
	const staleTime = new Date(Date.now() - 16 * 60 * 1000);
	utimesSync(lockPath, staleTime, staleTime);
	const env = enableAutoProvision(f.env);

	const result = run(env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(installedSources(f), COMPANIONS);
	assert.equal(existsSync(lockPath), false, "the lock must be released once the flow completes");
});

// --- auto-provisioning only touches homes gentle-shell owns (R1-001) -------

test("a --home pointing at an existing non-empty, unmarked directory is never auto-provisioned", (t) => {
	const f = fixture(t);
	const target = join(f.root, "existing-pi-home");
	writeSettings(target, {});
	const env = enableAutoProvision(f.env);

	const result = run(env, ["--home", target, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(piCalls(f), [], "pi must never install into a foreign, unmarked home");
	assert.match(
		result.stderr,
		new RegExp(`tomidev: ${escapeRegExp(target)} already has content and was not set up by tomidev`),
	);
	assert.match(result.stderr, new RegExp(`run \`tomidev --home ${escapeRegExp(target)} setup\` to provision it`));
});

test("an empty or nonexistent --home is still auto-provisioned", (t) => {
	const f = fixture(t);
	const target = join(f.root, "brand-new-home");
	const env = enableAutoProvision(f.env);

	const result = run(env, ["--home", target, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(installedSources(f), COMPANIONS, "a fresh --home must still be auto-provisioned");
});

test("manual setup records nothing for a dry run, a failed setup or pi's own default agent home", (t) => {
	const f = fixture(t);
	const env = { ...f.env, PI_CODING_AGENT_DIR: undefined };

	assert.equal(run(env, ["setup", "--dry-run"]).status, 0);
	assert.equal(readProvisioned(f.home), undefined, "dry run");
	assert.notEqual(run({ ...env, FAKE_PI_FAIL: "install npm:gentle-engram 3" }, ["setup"]).status, 0);
	assert.equal(readProvisioned(f.home), undefined, "failed setup");
	const defaultPiHome = join(f.home, ".pi", "agent");
	const own = run(env, ["--home", defaultPiHome, "setup"]);
	assert.equal(own.status, 0, own.stderr);
	assert.equal(readProvisioned(f.home), undefined, "pi's own default agent home is never recorded, so it is never auto-provisioned later");
});

test("a --home equal to pi's own default agent home is never auto-provisioned, even when empty", (t) => {
	const f = fixture(t);
	const defaultPiHome = join(f.home, ".pi", "agent");
	// Exercise the default Pi home, not an ambient PI_CODING_AGENT_DIR override.
	const env = enableAutoProvision({ ...f.env, PI_CODING_AGENT_DIR: undefined });

	const result = run(env, ["--home", defaultPiHome, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(piCalls(f), [], "pi must never run against pi's own default agent home");
	assert.match(result.stderr, /never auto-provisions it/);
});

// --- --home ownership marker and retry after a failed first attempt (R3-001) -----

test("a freshly bootstrapped isolated or --home directory gets a gentle-shell ownership marker file", (t) => {
	const f = fixture(t);
	const target = join(f.root, "marked-home");
	const result = run(f.env, ["--home", target, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const marker = JSON.parse(readFileSync(join(target, ".tomidev-home"), "utf8"));
	assert.equal(marker.createdBy, "tomidev");
	assert.equal(marker.version, ownGentlePiVersion());
});

test("a --home directory gentle-shell itself bootstrapped is retried after its first auto-provision attempt fails", (t) => {
	const f = fixture(t);
	const target = join(f.root, "retry-home");
	const firstEnv = enableAutoProvision({ ...f.env, FAKE_PI_FAIL: "install npm:gentle-engram 1" });

	const first = run(firstEnv, ["--home", target, "--mode", "rpc"]);
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stderr, /tomidev: automatic setup failed/);
	assert.ok(existsSync(join(target, "settings.json")), "bootstrap must have seeded settings.json before the failed attempt");
	assert.ok(existsSync(join(target, ".tomidev-home")), "bootstrap must mark the home as gentle-shell-owned");

	const second = run(enableAutoProvision(f.env), ["--home", target, "--mode", "rpc"]);
	assert.equal(second.status, 0, second.stderr);
	assert.doesNotMatch(second.stderr, /already has content and was not set up by tomidev/);
	assert.equal(installedSources(f).length, 6, "the retry must install the companions into the previously-failed home");
	assert.equal(readProvisioned(f.home)?.[realpathSync(target)]?.setupVersion, 2);
});

// --- auto-provisioning interrupts, resilience, timeouts, atomic writes -----

// Waits until `child`'s stderr has emitted a line matching `pattern`, so a
// test can send a signal only once the flow has actually started (never
// racing the signal against the child process not existing yet).
function waitForStderrMatch(child, pattern) {
	return new Promise((resolve, reject) => {
		let buffer = "";
		const onData = (chunk) => {
			buffer += chunk.toString("utf8");
			if (pattern.test(buffer)) {
				child.stderr.off("data", onData);
				resolve(buffer);
			}
		};
		child.stderr.on("data", onData);
		child.once("error", reject);
	});
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	return new Promise((resolve) => {
		child.once("exit", (code, signal) => resolve({ code, signal }));
	});
}

// The fake pi announces this on stderr (see writePiScript's FAKE_PI_HANG) the
// instant its hung call starts, so the signal below is only ever sent to a
// child that really exists and has its signal forwarding wired up.
const CHILD_READY_TOKEN = "TOMIDEV_TEST_CHILD_READY";

test("SIGINT during automatic provisioning kills the child and exits 130 without launching pi", { timeout: 10000 }, async (t) => {
	const f = fixture(t);
	const env = enableAutoProvision({ ...f.env, FAKE_PI_HANG: "install npm:gentle-engram" });

	const child = spawn(process.execPath, [binPath, "--mode", "rpc", "-p", "hi"], { env: assertNotRealHome(env), stdio: ["ignore", "pipe", "pipe"] });
	let stdout = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString("utf8");
	});
	t.after(() => {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	});

	await waitForStderrMatch(child, new RegExp(CHILD_READY_TOKEN));
	child.kill("SIGINT");
	const { code, signal } = await waitForExit(child);

	assert.equal(signal, null, "the launcher process itself must exit normally, not be killed by the signal");
	assert.equal(code, 130);
	assert.equal(stdout.trim(), "", "pi must never launch once an auto-provision spawn was interrupted");
});

test(
	"an unexpected error writing the provisioning record (e.g. an unwritable config directory) still launches pi",
	{ skip: process.platform === "win32" ? "chmod-based write restriction is not portable to Windows" : false },
	(t) => {
		const f = fixture(t);
		// The config.json path does not exist yet, and its parent directory is
		// read+execute only: the install succeeds, then writing the record fails
		// with EACCES. That isolates the failure to the write step the launch
		// wraps in its own error handling.
		const restrictedRoot = join(f.root, "locked-config-root");
		mkdirSync(restrictedRoot, { recursive: true });
		const configPath = join(restrictedRoot, ".tomidev", "config.json");
		chmodSync(restrictedRoot, 0o500);

		const env = enableAutoProvision({ ...f.env, TOMIDEV_CONFIG: configPath });

		const result = run(env, ["--mode", "rpc", "-p", "hi"]);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stderr, /tomidev: automatic setup failed unexpectedly/);
		assert.deepEqual(JSON.parse(result.stdout).args.slice(-4), ["--mode", "rpc", "-p", "hi"]);
	},
);

test("a hung companion install during automatic provisioning is killed after the timeout ceiling, treated as a failure, and pi still launches", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision({
		...f.env,
		FAKE_PI_HANG: "install npm:gentle-engram",
		TOMIDEV_AUTO_SETUP_TIMEOUT_MS: "300",
	});

	const started = Date.now();
	const result = run(env, ["--mode", "rpc", "-p", "hi"]);
	const elapsed = Date.now() - started;
	assert.equal(result.status, 0, result.stderr);
	assert.ok(elapsed < 15000, `expected the hung child to be killed quickly, took ${elapsed}ms`);
	assert.match(result.stderr, /tomidev: automatic setup failed/);
	// 300ms is not a whole number of minutes, so the ceiling renders in seconds.
	assert.match(result.stderr, /timed out after 0\.3 seconds/);
	assert.deepEqual(JSON.parse(result.stdout).args.slice(-4), ["--mode", "rpc", "-p", "hi"]);
});

test("manual setup never times out even past the auto-mode ceiling override", (t) => {
	const f = fixture(t);
	const env = { ...f.env, FAKE_PI_DELAY_MS: "300", TOMIDEV_AUTO_SETUP_TIMEOUT_MS: "50" };

	const result = run(env, ["setup"]);
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /timed out/);
	assert.equal(installedSources(f).length, 5);
});

test("the provisioning record write leaves no stray temp file behind", (t) => {
	const f = fixture(t);
	const env = enableAutoProvision(f.env);

	const result = run(env, []);
	assert.equal(result.status, 0, result.stderr);
	const configDir = join(f.home, ".tomidev");
	assert.deepEqual(readdirSync(configDir), ["config.json"]);
});

// --- default tomidev theme -------------------------------------------

test("a freshly bootstrapped home defaults to the tomidev theme", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const settings = JSON.parse(readFileSync(join(f.gentleShellHome, "settings.json"), "utf8"));
	assert.equal(settings.theme, "tomidev");
});

test("automatic setup never overwrites a theme the home already declared", (t) => {
	const f = fixture(t);
	const target = join(f.root, "themed-home");
	mkdirSync(target, { recursive: true });
	writeFileSync(join(target, "settings.json"), JSON.stringify({ tuiMode: "fullscreen", theme: "rose" }));
	writeFileSync(join(target, ".tomidev-home"), JSON.stringify({ createdBy: "tomidev", version: ownGentlePiVersion() }));
	const env = enableAutoProvision(f.env);

	const result = run(env, ["--home", target, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	const settings = JSON.parse(readFileSync(join(target, "settings.json"), "utf8"));
	assert.equal(settings.theme, "rose");
});

test("tomidev --link setup never touches the home's theme", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent-link");
	mkdirSync(piAgentDir, { recursive: true });
	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ tuiMode: "fullscreen" }));
	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };

	const result = run(env, ["--link", "setup"]);
	assert.equal(result.status, 0, result.stderr);
	const settings = JSON.parse(readFileSync(join(piAgentDir, "settings.json"), "utf8"));
	assert.equal(settings.theme, undefined, "link mode must never gain a theme from gentle-shell's own default-theme logic");
});

// --- builtin codemode exclusion ----------------------------------------------
//
// gentle-pi registers its own decorated codemode tool, so Pi's replaceable
// builtin codemode always loses to it and Pi prints a startup warning. The
// only per-builtin opt-out Pi supports is a `-builtin:codemode` entry in the
// settings `extensions` array, which every normal launch ensures in a home
// gentle-shell owns — never in --link, a foreign --home, pi's own default
// agent home, a pi subcommand, or `setup --dry-run`.

const CODEMODE_EXCLUSION = "-builtin:codemode";

function settingsText(dir: string): string {
	return readFileSync(join(dir, "settings.json"), "utf8");
}

test("a fresh isolated home excludes Pi's builtin codemode, and a second launch changes nothing", (t) => {
	const f = fixture(t);
	const first = run(f.env, ["--mode", "rpc"]);
	assert.equal(first.status, 0, first.stderr);
	const settings = JSON.parse(settingsText(f.gentleShellHome));
	assert.deepEqual(settings.extensions, [CODEMODE_EXCLUSION]);
	assert.equal(settings.tuiMode, "fullscreen");
	assert.equal(settings.theme, "tomidev");

	const before = settingsText(f.gentleShellHome);
	const second = run(f.env, ["--mode", "rpc"]);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(settingsText(f.gentleShellHome), before);
	assert.doesNotMatch(second.stderr, /builtin codemode/);
});

test("an existing isolated home gains the exclusion after its own extension entries, keeping every other key and its formatting", (t) => {
	for (const [indent, newline] of [[4, "\n"], [undefined, ""]] as const) {
		const f = fixture(t);
		mkdirSync(f.gentleShellHome, { recursive: true });
		const original = { tuiMode: "fullscreen", theme: "rose", extensions: ["./ext/a.ts", "!./ext/b.ts"], packages: ["npm:pi-btw"] };
		writeFileSync(join(f.gentleShellHome, "settings.json"), `${JSON.stringify(original, null, indent)}${newline}`);

		const result = run(f.env, ["--mode", "rpc"]);
		assert.equal(result.status, 0, result.stderr);
		const expected = { ...original, extensions: [...original.extensions, CODEMODE_EXCLUSION] };
		assert.equal(settingsText(f.gentleShellHome), `${JSON.stringify(expected, null, indent)}${newline}`);
		assert.match(result.stderr, /builtin codemode/);
	}
});

test("an explicit user entry for builtin:codemode is left byte-identical", (t) => {
	for (const entry of ["+builtin:codemode", "!builtin:codemode", "builtin:codemode", CODEMODE_EXCLUSION]) {
		const f = fixture(t);
		mkdirSync(f.gentleShellHome, { recursive: true });
		const text = JSON.stringify({ tuiMode: "fullscreen", extensions: ["./ext/a.ts", entry] });
		writeFileSync(join(f.gentleShellHome, "settings.json"), text);

		const result = run(f.env, ["--mode", "rpc"]);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(settingsText(f.gentleShellHome), text, entry);
	}
});

test("a malformed or unexpected settings.json is never overwritten and pi still starts", (t) => {
	for (const text of ["{ not json", "[]", '{"extensions":"oops"}']) {
		const f = fixture(t);
		mkdirSync(f.gentleShellHome, { recursive: true });
		writeFileSync(join(f.gentleShellHome, "settings.json"), text);

		const result = run(f.env, ["--mode", "rpc"]);
		assert.equal(result.status, 0, result.stderr);
		assert.deepEqual(JSON.parse(result.stdout).args.slice(-2), ["--mode", "rpc"]);
		assert.equal(settingsText(f.gentleShellHome), text);
	}
});

test("the exclusion is ensured after automatic setup rewrites settings.json", (t) => {
	const f = fixture(t);
	writeSettings(f.gentleShellHome, { tuiMode: "fullscreen", extensions: [CODEMODE_EXCLUSION], theme: "chosen" });
	const result = run(enableAutoProvision(f.env), ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout).args.slice(-2), ["--mode", "rpc"]);
	const settings = readSettings(f.gentleShellHome);
	assert.deepEqual(settings.extensions, [CODEMODE_EXCLUSION]);
	assert.deepEqual(settings.packages, COMPANIONS);
	assert.equal(settings.theme, "chosen");
	assert.equal(installedSources(f).length, 5, "Pi rewrote settings for the five companion installs");
});

test("an owned home without settings.json is not given one", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	const result = run(f.env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(join(f.gentleShellHome, "settings.json")), false);
});

test("--link never gains the exclusion", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent-link");
	mkdirSync(piAgentDir, { recursive: true });
	const text = JSON.stringify({ tuiMode: "fullscreen" });
	writeFileSync(join(piAgentDir, "settings.json"), text);

	const result = run({ ...f.env, PI_CODING_AGENT_DIR: piAgentDir }, ["--link", "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(settingsText(piAgentDir), text);
});

test("a foreign --home and pi's own default agent home are never edited, while a bootstrapped --home is", (t) => {
	const f = fixture(t);
	const foreign = join(f.root, "existing-pi-home");
	const defaultPiHome = join(f.home, ".pi", "agent");
	const text = JSON.stringify({ tuiMode: "fullscreen" });
	for (const dir of [foreign, defaultPiHome]) {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "settings.json"), text);
		const result = run({ ...f.env, PI_CODING_AGENT_DIR: undefined }, ["--home", dir, "--mode", "rpc"]);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(settingsText(dir), text, dir);
	}

	const bootstrapped = join(f.root, "brand-new-home");
	const result = run(f.env, ["--home", bootstrapped, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(settingsText(bootstrapped)).extensions, [CODEMODE_EXCLUSION]);
});

test("a pi subcommand and setup --dry-run never edit the home's settings", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	const text = JSON.stringify({ tuiMode: "fullscreen" });
	writeFileSync(join(f.gentleShellHome, "settings.json"), text);
	const env = f.env;

	for (const args of [["list"], ["setup", "--dry-run"]]) {
		const result = run(env, args);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(settingsText(f.gentleShellHome), text, args.join(" "));
	}
});

// --- atomic writes keep symlinked config files intact ------------------------
//
// Dotfile managers (Nix home-manager, stow, ...) ship settings.json and
// config.json as symlinks. Every atomic launcher write must rename onto the
// link's real target, so the link survives and the target gets the new
// bytes with its own permission bits.

// File symlinks need extra privileges on Windows; skip where unavailable.
const fileSymlinkSkip = (() => {
	const dir = mkdtempSync(join(tmpdir(), "gentle-shell-symlink-probe-"));
	try {
		writeFileSync(join(dir, "target"), "");
		symlinkSync(join(dir, "target"), join(dir, "link"), "file");
		return false;
	} catch {
		return "file symlinks are unavailable here";
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
})();

function symlinkedFile(linkPath: string, targetPath: string, text: string, mode: number) {
	mkdirSync(dirname(linkPath), { recursive: true });
	mkdirSync(dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, text);
	chmodSync(targetPath, mode);
	symlinkSync(targetPath, linkPath, "file");
}

function assertStillLinkedTo(linkPath: string, targetPath: string, mode: number) {
	assert.ok(lstatSync(linkPath).isSymbolicLink(), `${linkPath} is still a symlink`);
	assert.equal(realpathSync(linkPath), realpathSync(targetPath));
	if (process.platform !== "win32") assert.equal(statSync(targetPath).mode & 0o777, mode);
	for (const dir of [dirname(linkPath), dirname(targetPath)]) {
		assert.deepEqual(readdirSync(dir).filter((name) => name.endsWith(".tmp")), [], `no temp file left in ${dir}`);
	}
}

test("the builtin codemode exclusion writes through a symlinked settings.json", { skip: fileSymlinkSkip }, (t) => {
	const f = fixture(t);
	const linkPath = join(f.gentleShellHome, "settings.json");
	const targetPath = join(f.root, "dotfiles", "settings.json");
	symlinkedFile(linkPath, targetPath, JSON.stringify({ tuiMode: "fullscreen", theme: "rose" }), 0o640);

	const result = run(f.env, ["--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assertStillLinkedTo(linkPath, targetPath, 0o640);
	assert.deepEqual(JSON.parse(readFileSync(targetPath, "utf8")), { tuiMode: "fullscreen", theme: "rose", extensions: [CODEMODE_EXCLUSION] });
});

test("'home' persistence writes through a symlinked config.json", { skip: fileSymlinkSkip }, (t) => {
	const f = fixture(t);
	const linkPath = join(f.root, "config", "config.json");
	const targetPath = join(f.root, "dotfiles", "config.json");
	symlinkedFile(linkPath, targetPath, "{}\n", 0o600);

	const result = run({ ...f.env, TOMIDEV_CONFIG: linkPath }, ["home", "link"]);
	assert.equal(result.status, 0, result.stderr);
	assertStillLinkedTo(linkPath, targetPath, 0o600);
	assert.deepEqual(JSON.parse(readFileSync(targetPath, "utf8")), { home: "link" });
});

test("a dangling config.json symlink is replaced in place, never followed to create its target", { skip: fileSymlinkSkip }, (t) => {
	const f = fixture(t);
	const linkPath = join(f.root, "config", "config.json");
	const missingTarget = join(f.root, "missing", "config.json");
	mkdirSync(dirname(linkPath), { recursive: true });
	symlinkSync(missingTarget, linkPath, "file");

	const result = run({ ...f.env, TOMIDEV_CONFIG: linkPath }, ["home", "link"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(lstatSync(linkPath).isSymbolicLink(), false);
	assert.deepEqual(JSON.parse(readFileSync(linkPath, "utf8")), { home: "link" });
	assert.equal(existsSync(dirname(missingTarget)), false);
});

// --- --package-root silently ignored in a declared non-link home ----------

test("--package-root warns and is ignored when an isolated home already declares gentle-pi", (t) => {
	const f = fixture(t);
	mkdirSync(f.gentleShellHome, { recursive: true });
	writeFileSync(join(f.gentleShellHome, "settings.json"), JSON.stringify({ packages: ["npm:tomidev@3.5.1"], tuiMode: "fullscreen" }));
	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const result = run(f.env, ["--package-root", forcedRoot, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(
		result.stderr,
		new RegExp(
			`--package-root only forces a take-over in --link mode; ${f.gentleShellHome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} declares tomidev, so the installed package is used and ${forcedRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is ignored`,
		),
	);
	assert.doesNotMatch(result.stderr, /taking over tomidev from/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--mode", "rpc"]);
});

test("--package-root prints no warning when the home does not declare gentle-pi", (t) => {
	const f = fixture(t);
	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const result = run(f.env, ["--package-root", forcedRoot, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /--package-root only forces a take-over/);
});

test("--help mentions the setup subcommand", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--help"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /\bsetup\b/);
});

test("--help lists the mcp subcommand", (t) => {
	const f = fixture(t);
	const result = run(f.env, ["--help"]);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /tomidev mcp /);
});

// --- --link takeover of a conflicting path package -----------------------
//
// Regression coverage for the settings.json shape that triggered the tool
// conflict bug: gentle-pi declared as a relative *path* package (not
// npm:gentle-pi) alongside another package. findGentlePiDeclaration now
// recognises that path declaration by reading its package.json "name", and
// the launcher takes over the pi invocation instead of also injecting its
// own -e, which used to load two copies of gentle-pi side by side.

test("--link takes over a path-declared conflicting gentle-pi: --no-extensions, the other package's dir, then this launcher's own -e, settings byte-identical", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	// "npm:some-other" must actually be installed under
	// <agentDir>/npm/node_modules for it to be re-injected (R3-001): a
	// declared-but-missing package dir is now skipped with a warning instead.
	mkdirSync(join(piAgentDir, "npm", "node_modules", "some-other"), { recursive: true });

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other", "../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--mode", "rpc"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	assert.match(result.stderr, /taking over tomidev from/);
	assert.match(result.stderr, /other-gentle-pi/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(piAgentDir, "npm", "node_modules", "some-other"),
		"-e",
		packageRoot,
		"--mode",
		"rpc",
	]);

	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
	assert.equal(payload.PI_CODING_AGENT_DIR, piAgentDir);
});

test("--link install npm:x with a path-declared conflicting gentle-pi in settings forwards the bare subcommand, no take-over", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other", "../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "install", "npm:x"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /taking over tomidev from/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["install", "npm:x"]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
	assert.equal(payload.PI_CODING_AGENT_DIR, piAgentDir);
});

test("--link does not take over a git-sourced other package: it is skipped with a warning, not injected", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	const settingsPath = join(piAgentDir, "settings.json");
	writeFileSync(settingsPath, JSON.stringify({ packages: ["git:github.com/foo/bar", "../other-gentle-pi"] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /skipping git-sourced package/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot]);
});

test("--package-root forces a takeover even when settings already declare a matching npm:gentle-pi", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });
	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:tomidev"] });
	writeFileSync(settingsPath, settingsText);

	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", forcedRoot], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over tomidev from npm:tomidev/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", forcedRoot]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--package-root forces a takeover even with no gentle-pi declaration at all: --no-extensions and the other packages are still injected", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });
	// "npm:some-other" must actually be installed under
	// <agentDir>/npm/node_modules for it to be re-injected (R3-001).
	mkdirSync(join(piAgentDir, "npm", "node_modules", "some-other"), { recursive: true });
	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other"] });
	writeFileSync(settingsPath, settingsText);

	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", forcedRoot], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over tomidev from the requested package root/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(piAgentDir, "npm", "node_modules", "some-other"),
		"-e",
		forcedRoot,
	]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--link take-over with --package-root injects exactly one -e when a settings path entry reaches the same physical directory through a symlink (R4-forced-root-symlink-double-injection)", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const packagesDir = join(piAgentDir, "packages");
	const realOtherDir = join(packagesDir, "real-other");
	mkdirSync(realOtherDir, { recursive: true });
	const linkOtherDir = join(packagesDir, "link-other");
	symlinkSync(realOtherDir, linkOtherDir, "dir");

	// settings declares the SYMLINK path; --package-root names the REAL path
	// directly. Both spellings reach the same physical directory, so it must
	// be injected exactly once instead of twice (once as an "other package"
	// via the symlink, once as this launcher's own package root).
	const settingsPath = join(piAgentDir, "settings.json");
	writeFileSync(settingsPath, JSON.stringify({ packages: [join("packages", "link-other")] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", realOtherDir], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.equal(payload.args.filter((arg: string) => arg === "-e").length, 1);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		realOtherDir,
	]);
});

// --- loose extension files re-injected during a take-over -----------------
//
// Regression coverage for R4-003/R3-003 (and the follow-up bug it left
// behind): --no-extensions drops pi's normal settings-driven extension
// discovery, which also happens to be how pi finds loose (non-package)
// extensions under <agentDir>/extensions and the project-local
// <cwd>/.pi/extensions. Re-injecting those two directories wholesale as
// `-e <dir>` does not work: pi's `-e` flag hands the path straight to its
// module loader (no directory-discovery pass), so a bare directory holding
// only loose files fails with "Cannot find module ...". A take-over must
// instead discover each loose file the same way pi's own directory scan
// would (see discoverLooseExtensionEntries) and inject it individually.

test("--link take-over re-injects loose extension files, one -e per discovered file, from <agentDir>/extensions and the project-local .pi/extensions", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	// <agentDir>/extensions: a.ts, b.js, c.ts.bak-pre-fullscreen-fix (skipped,
	// suffix doesn't end in .ts/.js/.mjs), sub/index.ts, .hidden.ts (skipped).
	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(join(looseAgentExtensions, "sub"), { recursive: true });
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");
	writeFileSync(join(looseAgentExtensions, "b.js"), "export default () => {};");
	writeFileSync(join(looseAgentExtensions, "gentle-agent-state.ts.bak-pre-fullscreen-fix"), "stale backup");
	writeFileSync(join(looseAgentExtensions, ".hidden.ts"), "export default () => {};");
	writeFileSync(join(looseAgentExtensions, "sub", "index.ts"), "export default () => {};");

	const projectDir = join(f.root, "project");
	const looseProjectExtensions = join(projectDir, ".pi", "extensions");
	mkdirSync(looseProjectExtensions, { recursive: true });
	writeFileSync(join(looseProjectExtensions, "project-ext.mjs"), "export default () => {};");
	// The launcher derives this dir from process.cwd() inside the spawned
	// child, which resolves symlinks (e.g. macOS's /tmp -> /private/tmp);
	// realpath the expectation the same way so the two agree everywhere.
	const resolvedLooseProjectExtensions = join(realpathSync(projectDir), ".pi", "extensions");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--mode", "rpc"], { cwd: projectDir });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over tomidev from/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "a.ts"),
		"-e",
		join(looseAgentExtensions, "b.js"),
		"-e",
		join(looseAgentExtensions, "sub", "index.ts"),
		"-e",
		join(resolvedLooseProjectExtensions, "project-ext.mjs"),
		"-e",
		packageRoot,
		"--mode",
		"rpc",
	]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--link take-over injects a root-level index.ts as its own loose file entry, alongside a sibling loose file (R4-loose-index-collapses-sibling-extensions)", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "index.ts"), "export default () => {};");
	// A root-level index.ts is just another loose file, not a marker that
	// collapses the whole directory into a single -e <dir>: pi's own
	// discovery loads every direct *.ts/*.js/*.mjs file individually, so a
	// sibling like extra.ts must keep loading too instead of being dropped.
	writeFileSync(join(looseAgentExtensions, "extra.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "extra.ts"),
		"-e",
		join(looseAgentExtensions, "index.ts"),
		"-e",
		packageRoot,
	]);
});

test("--link take-over injects a subdirectory's own index.ts entry point even when the loose extensions dir has no other direct files", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	const subDir = join(looseAgentExtensions, "sub");
	mkdirSync(subDir, { recursive: true });
	writeFileSync(join(subDir, "index.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(subDir, "index.ts"),
		"-e",
		packageRoot,
	]);
});

test("--link take-over omits -e flags for loose extension dirs that do not exist", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot]);
});

// --- R3-001/R4-takeover-injects-unverified-package-dirs -------------------
//
// A settings.json package that is declared but not actually installed on
// disk (hand-edited file, a failed or interrupted `pi install`, an npm store
// laid out anywhere other than <agentDir>/npm/node_modules) must not be
// handed to pi as an unresolvable -e: pi's module loader fails on it with
// "Cannot find module", which would break every take-over launch against a
// partially-installed home. It is filtered the same way loose extension
// candidates already are, with one stderr warning naming the source and the
// resolved path, and the launch still succeeds.

test("--link take-over skips a declared package directory that is not installed, warns, and still launches; an installed one is still injected", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	// "npm:some-other" is declared but never installed under
	// <agentDir>/npm/node_modules, so its resolved directory does not exist.
	// "npm:installed-other" IS installed, so it must still be injected.
	const installedOtherDir = join(piAgentDir, "npm", "node_modules", "installed-other");
	mkdirSync(installedOtherDir, { recursive: true });

	const settingsPath = join(piAgentDir, "settings.json");
	const settingsText = JSON.stringify({ packages: ["npm:some-other", "npm:installed-other", "../other-gentle-pi"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--mode", "rpc"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	assert.match(result.stderr, /skipping declared package "npm:some-other"/);
	assert.match(result.stderr, /is not a directory/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		installedOtherDir,
		"-e",
		packageRoot,
		"--mode",
		"rpc",
	]);
	assert.equal(readFileSync(settingsPath, "utf8"), settingsText);
});

test("--link take-over injects the launcher's own package root once when --package-root names a directory settings also declare as a plain path entry", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const settingsPath = join(piAgentDir, "settings.json");
	// The forced root is also declared as an ordinary (non-gentle-pi) path
	// package, so otherPackageInjections would resolve it to the same
	// directory as --package-root.
	const settingsText = JSON.stringify({ packages: ["../forced-root"] });
	writeFileSync(settingsPath, settingsText);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link", "--package-root", forcedRoot], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	const eFlags = payload.args.filter((arg: string, index: number) => payload.args[index - 1] === "-e");
	assert.deepEqual(eFlags, [forcedRoot]);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		forcedRoot,
	]);
});

test("--isolated --package-root produces the plain injection (no --no-extensions): the take-over path is gated on link mode", (t) => {
	const f = fixture(t);
	const forcedRoot = join(f.root, "forced-root");
	mkdirSync(forcedRoot, { recursive: true });

	const result = run(f.env, ["--isolated", "--package-root", forcedRoot, "--mode", "rpc"]);
	assert.equal(result.status, 0, result.stderr);
	assert.doesNotMatch(result.stderr, /taking over tomidev from/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"-e",
		forcedRoot,
		"--mode",
		"rpc",
	]);
});

test("--package-root naming a directory that does not exist fails with a clear error instead of launching", (t) => {
	const f = fixture(t);
	const missingRoot = join(f.root, "does-not-exist");

	const result = run(f.env, ["--package-root", missingRoot]);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /--package-root/);
	assert.match(result.stderr, /does not exist|not a directory/);
});

// --- R4-loose-extension-enumeration-fails-silently -------------------------

test("--link take-over warns once when a loose extensions directory cannot be read, instead of failing silently", { skip: process.platform === "win32" || process.getuid?.() === 0 ? "mode bits do not block readdir here" : false }, (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");
	chmodSync(looseAgentExtensions, 0o000);

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	// Restore permissions immediately, before any assertion can throw and
	// skip cleanup: fixture()'s own t.after (registered before this test body
	// runs) removes f.root recursively, which requires read/execute
	// permission on every subdirectory, including this one.
	chmodSync(looseAgentExtensions, 0o755);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /could not read loose extension directory/);
	assert.match(result.stderr, /extensions/);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot]);
});

// --- R3-004: loose-extensions manifest branch coverage ----------------------

test("--link take-over falls through to per-file discovery when a loose dir's package.json declares an empty pi.extensions array", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "package.json"), JSON.stringify({ pi: { extensions: [] } }));
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "a.ts"),
		"-e",
		packageRoot,
	]);
});

test("--link take-over treats a malformed package.json as no manifest and falls through to per-file discovery", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const looseAgentExtensions = join(piAgentDir, "extensions");
	mkdirSync(looseAgentExtensions, { recursive: true });
	writeFileSync(join(looseAgentExtensions, "package.json"), "{ not valid json");
	writeFileSync(join(looseAgentExtensions, "a.ts"), "export default () => {};");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, [
		"--no-extensions",
		"-e",
		join(looseAgentExtensions, "a.ts"),
		"-e",
		packageRoot,
	]);
});

// --- R4-takeover-leaves-two-gentle-pi-skill-sets-loaded ---------------------

test("--link take-over stderr message also notes that the taken-over declaration's skills, prompts, and themes still load alongside this launcher's", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /taking over tomidev from/);
	assert.match(result.stderr, /skills, prompts, and themes/);
});

test("--link take-over treats a file named `extensions` as not a loose extension dir", (t) => {
	const f = fixture(t);
	const piAgentDir = join(f.root, "pi-agent");
	mkdirSync(piAgentDir, { recursive: true });

	const otherGentlePiDir = join(f.root, "other-gentle-pi");
	mkdirSync(otherGentlePiDir, { recursive: true });
	writeFileSync(join(otherGentlePiDir, "package.json"), JSON.stringify({ name: "tomidev" }));

	writeFileSync(join(piAgentDir, "settings.json"), JSON.stringify({ packages: ["../other-gentle-pi"] }));
	writeFileSync(join(piAgentDir, "extensions"), "not a directory");

	const env = { ...f.env, PI_CODING_AGENT_DIR: piAgentDir };
	const result = run(env, ["--link"], { cwd: f.root });
	assert.equal(result.status, 0, result.stderr);

	const payload = JSON.parse(result.stdout);
	assert.deepEqual(payload.args, ["--no-extensions", "-e", packageRoot]);
});

// --- resume-hint handoff (lib/gentle-shell-resume-hint.ts) ----------------------

// A stand-in pi that writes a resume handoff like extensions/resume-hint.ts
// does, prints pi's own exit hint, and exits with the given code.
function writeHandoffPiScript(path: string, exitCode = 0) {
	writeFileSync(
		path,
		[
			"#!/usr/bin/env node",
			"const { writeFileSync } = require('node:fs');",
			"const args = process.argv.slice(2);",
			"if (args.includes('--version')) { console.log('1.2.0'); process.exit(0); }",
			"const handoff = process.env.TOMIDEV_RESUME_HANDOFF;",
			"if (handoff) writeFileSync(handoff, JSON.stringify({ sessionId: 'abc' }));",
			"if (process.env.PI_STUB_PRINT_ENV) console.log(JSON.stringify({ args, handoff }));",
			"process.stdout.write('To resume this session: pi --session abc\\n');",
			`process.exit(${exitCode});`,
			"",
		].join("\n"),
	);
	chmodSync(path, 0o755);
}

test("interactive launch hands pi a private resume handoff and cleans it up", (t) => {
	const f = fixture(t);
	const piScript = join(f.root, "handoff-pi.cjs");
	writeHandoffPiScript(piScript);
	const result = run({ ...f.env, TOMIDEV_PI: piScript, PI_STUB_PRINT_ENV: "1" }, []);
	assert.equal(result.status, 0, result.stderr);
	const lines = result.stdout.trim().split("\n");
	const { handoff } = JSON.parse(lines[0]);
	assert.equal(typeof handoff, "string");
	assert.match(handoff, /gentle-shell-resume-/);
	assert.equal(existsSync(dirname(handoff)), false, "handoff dir must be removed after pi exits");
	// Not a TTY: like pi's own hint, the gentle-shell line is not printed.
	assert.deepEqual(lines.slice(1), ["To resume this session: pi --session abc"]);
});

test("pi subcommands get no resume handoff", (t) => {
	const f = fixture(t);
	const piScript = join(f.root, "handoff-pi.cjs");
	writeHandoffPiScript(piScript);
	const result = run({ ...f.env, TOMIDEV_PI: piScript, PI_STUB_PRINT_ENV: "1" }, ["list"]);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(JSON.parse(result.stdout.trim().split("\n")[0]).handoff, undefined);
});

// The hint is only printed to a real TTY, so drive the launcher through a
// pseudo-terminal. Python's pty module is the portable POSIX way to get one
// without a native dependency; skipped where it is unavailable.
const hasPythonPty = process.platform !== "win32" && spawnSync("python3", ["-c", "import pty"], { stdio: "ignore" }).status === 0;
const PTY_RUNNER = [
	"import fcntl, os, pty, struct, subprocess, sys, termios",
	"m, s = pty.openpty()",
	"fcntl.ioctl(s, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 120, 0, 0))",
	"p = subprocess.Popen(sys.argv[1:], stdin=s, stdout=s, stderr=s)",
	"os.close(s)",
	"out = b''",
	// PTY_SIGNAL_AFTER: once this text appears, send PTY_SIGNAL to the launcher.
	"after = os.environ.get('PTY_SIGNAL_AFTER', '').encode()",
	"while True:",
	"    try: d = os.read(m, 4096)",
	"    except OSError: break",
	"    if not d: break",
	"    out += d",
	"    if after and after in out:",
	"        after = b''",
	"        os.kill(p.pid, int(os.environ['PTY_SIGNAL']))",
	"sys.stdout.write(out.decode())",
	"sys.exit(p.wait())",
].join("\n");

function runInPty(env: NodeJS.ProcessEnv, args: string[], expectedStatus = 0): string {
	// Pin the color environment so the launcher's hasColors() check does not
	// depend on the machine running the tests; a test can still override it.
	const { NO_COLOR, FORCE_COLOR, NODE_DISABLE_COLORS, ...rest } = env;
	const colorEnv = { ...rest, TERM: "xterm-256color", ...(env.PTY_NO_COLOR ? { NO_COLOR: "1" } : {}) };
	// Bounded so a stand-in pi that never exits fails the test instead of hanging CI.
	const result = spawnSync("python3", ["-c", PTY_RUNNER, process.execPath, binPath, ...args], { encoding: "utf8", env: assertNotRealHome(colorEnv), timeout: 30_000 });
	assert.equal(result.error, undefined, String(result.error));
	assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
	return result.stdout;
}

const PI_HINT = "To resume this session: pi --session abc\r\n";
const GENTLE_HINT = "\u001b[2mTo resume in tomidev:\u001b[22m tomidev --link --session abc\r\n";

test("on a TTY the launcher appends a gentle-shell resume line below pi's hint", { skip: !hasPythonPty && "needs python3 pty" }, (t) => {
	const f = fixture(t);
	const piScript = join(f.root, "tty-pi.cjs");
	writeHandoffPiScript(piScript);
	const out = runInPty({ ...f.env, TOMIDEV_PI: piScript }, ["--link"]);
	assert.ok(out.endsWith(PI_HINT + GENTLE_HINT), JSON.stringify(out));
});

test("on a TTY the gentle-shell line still follows a non-zero pi exit, keeping the code", { skip: !hasPythonPty && "needs python3 pty" }, (t) => {
	const f = fixture(t);
	const piScript = join(f.root, "tty-pi.cjs");
	writeHandoffPiScript(piScript, 3);
	const out = runInPty({ ...f.env, TOMIDEV_PI: piScript }, ["--link"], 3);
	assert.ok(out.endsWith(PI_HINT + GENTLE_HINT), JSON.stringify(out));
});

// A stand-in pi that writes the handoff and then waits: it quits with its
// own hint on SIGHUP/SIGTERM, but survives SIGINT (like an interrupted turn)
// and quits only on the next line of input.
function writeWaitingPiScript(path: string) {
	writeFileSync(
		path,
		[
			"#!/usr/bin/env node",
			"const { writeFileSync } = require('node:fs');",
			"if (process.argv.includes('--version')) { console.log('1.2.0'); process.exit(0); }",
			"writeFileSync(process.env.TOMIDEV_RESUME_HANDOFF, JSON.stringify({ sessionId: 'abc' }));",
			"const quit = () => { process.stdout.write('To resume this session: pi --session abc\\n'); process.exit(0); };",
			"process.on('SIGHUP', quit);",
			"process.on('SIGTERM', quit);",
			"process.on('SIGINT', () => { process.stdout.write('interrupted\\n'); setTimeout(quit, 50); });",
			"process.stdout.write('ready\\n');",
			"setInterval(() => {}, 1000);",
			"",
		].join("\n"),
	);
	chmodSync(path, 0o755);
}

test("on a TTY the launcher prints nothing extra after the terminal hangs up", { skip: !hasPythonPty && "needs python3 pty" }, (t) => {
	const f = fixture(t);
	const piScript = join(f.root, "tty-pi.cjs");
	writeWaitingPiScript(piScript);
	const out = runInPty({ ...f.env, TOMIDEV_PI: piScript, PTY_SIGNAL_AFTER: "ready", PTY_SIGNAL: "1" }, ["--link"]);
	// pi quit cleanly with its own hint; only the gentle-shell line is withheld.
	assert.ok(out.endsWith(PI_HINT), JSON.stringify(out));
	assert.equal(out.includes("tomidev --"), false, JSON.stringify(out));
});

test("on a TTY a forwarded SIGINT that pi survives does not silence the gentle-shell line", { skip: !hasPythonPty && "needs python3 pty" }, (t) => {
	const f = fixture(t);
	const piScript = join(f.root, "tty-pi.cjs");
	writeWaitingPiScript(piScript);
	const out = runInPty({ ...f.env, TOMIDEV_PI: piScript, PTY_SIGNAL_AFTER: "ready", PTY_SIGNAL: "2" }, ["--link"]);
	assert.ok(out.includes("interrupted"), JSON.stringify(out));
	assert.ok(out.endsWith(PI_HINT + GENTLE_HINT), JSON.stringify(out));
});

test("on a TTY a cross-project session resumes by its session file", { skip: !hasPythonPty && "needs python3 pty" }, (t) => {
	const f = fixture(t);
	const sessionFile = join(f.root, "other project", "session.jsonl");
	const piScript = join(f.root, "tty-pi.cjs");
	writeFileSync(
		piScript,
		[
			"#!/usr/bin/env node",
			"const { writeFileSync } = require('node:fs');",
			"if (process.argv.includes('--version')) { console.log('1.2.0'); process.exit(0); }",
			`writeFileSync(process.env.TOMIDEV_RESUME_HANDOFF, JSON.stringify({ sessionId: 'abc', sessionFile: ${JSON.stringify(sessionFile)} }));`,
			"process.stdout.write('To resume this session: pi --session abc\\n');",
			"",
		].join("\n"),
	);
	chmodSync(piScript, 0o755);
	const out = runInPty({ ...f.env, TOMIDEV_PI: piScript }, ["--link"]);
	assert.ok(
		out.endsWith(`${PI_HINT}\u001b[2mTo resume in tomidev:\u001b[22m tomidev --link --session '${sessionFile}'\r\n`),
		JSON.stringify(out),
	);
});

test("on a TTY without colors the gentle-shell line has no ANSI styling", { skip: !hasPythonPty && "needs python3 pty" }, (t) => {
	const f = fixture(t);
	const piScript = join(f.root, "tty-pi.cjs");
	writeHandoffPiScript(piScript);
	const out = runInPty({ ...f.env, TOMIDEV_PI: piScript, PTY_NO_COLOR: "1" }, ["--link"]);
	assert.ok(out.endsWith(`${PI_HINT}To resume in tomidev: tomidev --link --session abc\r\n`), JSON.stringify(out));
});

