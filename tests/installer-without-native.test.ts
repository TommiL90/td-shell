import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectInventory, planPreflight, requirements } from "../scripts/installer-preflight.mjs";
import { runStandardInstall, PI_INSTALL_VERSION, PI_PACKAGE } from "../scripts/installer-runner.mjs";
import { wizardHandlers } from "../bin/tomidev-install.mjs";
import { readChannel, runUpgrade } from "../scripts/main-channel.mjs";
import { bundledPlan, runBundledInstall } from "../scripts/bundled-wizard.mjs";
import { prefixLayout } from "../scripts/bundled-install.mjs";

const tool = (version: string) => ({ available: true, version, usable: true });
const home = "/sandbox/home";
const pm = `${home}/.local/share/pnpm`;
const root = `${pm}/global/node_modules/tomidev`;
const pi = JSON.stringify({ name: PI_PACKAGE, version: PI_INSTALL_VERSION });
function inventory(platform = "linux") {
	return { platform, arch: "x64", node: tool(requirements.node), pnpm: { ...tool(requirements.pnpm), compatible: true },
		pi: { available: false }, shell: { available: false }, globalBin: { available: true, path: `${pm}/bin`, writable: true, onPath: true }, setup: false };
}
function sandbox() {
	const calls: string[][] = [];
	let listed = false;
	const listing = JSON.stringify([{ dependencies: { [PI_PACKAGE]: { version: PI_INSTALL_VERSION }, tomidev: { version: requirements.shell, path: root } } }]);
	return { calls, adapters: {
		platform: "linux", nodePath: "/tools/node", env: { HOME: home, PATH: `${pm}/bin:/tools`, TOMIDEV_INSTALL_PNPM_NODE: "/tools/node", TOMIDEV_INSTALL_PNPM_ENTRY: "/tools/pnpm.mjs" },
		fs: { isFile: async (path: string) => ["/tools/npm", `${pm}/bin/tomidev`].includes(path), realpath: async (path: string) => path,
			readText: async (path: string) => { if (path.endsWith("pi-coding-agent/package.json")) return pi; throw new Error("missing"); } },
		run: async (command: string, argv: string[]) => {
			calls.push([command, ...argv]);
			let stdout = "";
			if (argv.includes("--version")) stdout = "11.19.0";
			if (argv.join(" ") === "config get prefix") stdout = "/tools";
			if (argv.includes("bin")) stdout = `${pm}/bin`;
			if (argv.includes("list")) stdout = listed ? listing : "[]";
			if (argv.includes("view")) stdout = PI_INSTALL_VERSION;
			if (argv.includes("add")) listed = true;
			return { code: 0, stdout };
		},
		verifyGentleAi: async () => { throw new Error("native verification must not run"); },
	} };
}

test("preflight never probes or provisions gentle-ai or Go on any install channel", async () => {
	for (const platform of ["linux", "darwin", "win32"]) for (const channel of ["release", "main"]) {
		const input = inventory(platform);
		const probes = Object.fromEntries(Object.entries(input).filter(([key]) => !["platform", "arch"].includes(key)).map(([key, value]) => [key, async () => value]));
		let nativeCalls = 0;
		const collected = await collectInventory({ platform, arch: "x64", probes: { ...probes, gentleAi: async () => { nativeCalls++; throw new Error("absent"); }, go: async () => { nativeCalls++; throw new Error("absent"); } } });
		const plan = planPreflight(collected, { channel });
		assert.deepEqual(plan.blockers, []);
		assert.equal(nativeCalls, 0);
		assert.equal(plan.actions.some((a: { id: string; target: string }) => /native|gentle-ai|go/.test(a.id) || a.target === "gentleAi"), false);
	}
});

test("standard installer completes without invoking or verifying gentle-ai", async () => {
	const s = sandbox();
	const result = await runStandardInstall({ plan: planPreflight(inventory()), consent: true }, s.adapters);
	assert.equal(result.outcome, "ready");
	assert.equal(result.completed.includes("verify-gentle-ai"), false);
	assert.equal(s.calls.some((call) => call.some((arg) => /gentle-ai|^go$/.test(arg))), false);
	assert.equal(s.calls.filter((call) => call.at(-1) === "setup").length, 1);
});

test("wizard entry installs without a native integrity adapter", async () => {
	const s = sandbox();
	const handlers = wizardHandlers({ platform: "linux", arch: "x64", env: s.adapters.env, run: s.adapters.run, fs: s.adapters.fs,
		inventory: async () => inventory(), download: async () => { throw Object.assign(new Error("no assets"), { status: 404 }); } });
	const { plan } = await handlers.collectPlan("release");
	const result = await handlers.runInstall({ plan, consent: true }, () => {});
	assert.equal(result.outcome, "ready");
	assert.equal(result.completed.includes("verify-gentle-ai"), false);
});

test("main upgrade packs only the fork with no Go lookup or dev registration", async () => {
	const scratch = mkdtempSync(join(tmpdir(), "tomidev-no-native-"));
	try {
		const ctx = { home: scratch, env: { PNPM_HOME: join(scratch, "pnpm") } };
		const packageRoot = join(ctx.env.PNPM_HOME, "global", "node_modules", "tomidev");
		mkdirSync(packageRoot, { recursive: true });
		const sha = "a".repeat(40), calls: string[][] = [], fetches: string[] = [], lookups: string[] = [], lines: string[] = [];
		const code = await runUpgrade({ args: ["--channel", "main"], ctx, platform: "linux", packageRoot, currentVersion: "1.0.0", out: (line: string) => lines.push(line), adapters: {
			fs, which: async (name: string) => { lookups.push(name); return name === "pnpm" ? "/fake/pnpm" : null; },
			fetch: async (url: string) => { fetches.push(url); assert.match(url, /TommiL90\/td-shell/); return { ok: true, text: async () => sha, arrayBuffer: async () => Buffer.from("source") }; },
			run: async (command: string, argv: string[], options: { cwd?: string }) => {
				calls.push([command, ...argv]);
				if (command === "tar") writeFileSync(join(argv[argv.indexOf("-C") + 1], "package.json"), JSON.stringify({ name: "tomidev", version: "1.0.0" }));
				if (argv.includes("pack")) {
					const version = JSON.parse(readFileSync(join(options.cwd!, "package.json"), "utf8")).version;
					writeFileSync(join(argv[argv.indexOf("--pack-destination") + 1], `tomidev-${version}.tgz`), "package");
				}
				return { code: 0, stdout: "" };
			},
		} });
		assert.equal(code, 0);
		assert.deepEqual(lookups, ["pnpm", "npm", "pnpm"]);
		assert.equal(calls.some((call) => call.some((arg) => /gentle-ai|^go$/.test(arg)) && call[0] !== "tar" && !call.includes("pack") && !call.includes("add")), false);
		assert.equal(existsSync(join(scratch, ".pi", "gentle-ai", "dev-binary.json")), false);
		assert.deepEqual(await readChannel(ctx, fs), { channel: "main", shellCommit: sha });
		assert.deepEqual(lines, ["Updated to the latest main: tomidev aaaaaaaaaaaa."]);
		assert.equal(fetches.length, 2);
	} finally { rmSync(scratch, { recursive: true, force: true }); }
});

test("Windows bundled installation requests no Go runtime", async () => {
	const layout = prefixLayout({ platform: "win32", env: { LOCALAPPDATA: "C:\\sandbox" }, home: "C:\\sandbox\\home" });
	const distribution = { status: "published", manifest: { shell: requirements.shell, pi: PI_INSTALL_VERSION }, lockfile: "fixture" };
	const plan = bundledPlan({ platform: "win32", distribution, layout, path: { kind: "none" } });
	let runtime = 0;
	const result = await runBundledInstall({ plan, consent: true }, { platform: "win32", arch: "x64", env: {}, home: "C:\\sandbox\\home", distribution, operations: {
		claimPrefix: () => layout, userNpmrc: () => "", writeNpmrcAuth: () => {},
		ensureRuntime: async (input: { go?: boolean }) => { runtime++; assert.notEqual(input.go, true); return {}; },
		installVersion: async () => {}, activateVersion: () => {}, ensureLauncher: () => {}, run: async () => ({ status: 0 }),
	} });
	assert.equal(result.outcome, "ready");
	assert.equal(runtime, 1);
	assert.equal(plan.bundled.go ?? null, null);
});
