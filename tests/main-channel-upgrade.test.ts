import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CHANNEL_SCHEMA, MainChannelError, channelStatePath, ownerManager, readChannel, removeGlobalShell, runUpgrade, writeChannel } from "../scripts/main-channel.mjs";
const SHA = "6e7e3a18f794223396527a54c7c36d19c7d236c6";
const NEXT = "3".repeat(40);
type Invocation = { command: string; prefix: string[] } | null;
function world({ owner = "pnpm", latest = "4.1.0", commit = SHA, tools = ["pnpm", "npm"], platform = "linux", failInstall = false,
	invocation = undefined as ((name: string) => Promise<Invocation>) | undefined,
	migrate = undefined as ((input: { latest: string; owner: () => Promise<unknown> }) => Promise<unknown>) | undefined } = {}) {
	const home = mkdtempSync(join(tmpdir(), "tomidev-upgrade-"));
	const pnpmHome = join(home, "pnpm"), npmRoot = join(home, "npm", "node_modules");
	const packageRoot = owner === "pnpm" ? join(pnpmHome, "global", "node_modules", "tomidev") : owner === "npm" ? join(npmRoot, "tomidev") : join(home, "checkout");
	mkdirSync(packageRoot, { recursive: true }); mkdirSync(npmRoot, { recursive: true });
	const ctx = { home, env: { PNPM_HOME: pnpmHome } };
	const calls: string[][] = [], fetches: string[] = [], lookups: string[] = [], lines: string[] = [];
	const run = async (command: string, argv: string[], options: { cwd?: string } = {}) => {
		calls.push([command, ...argv]);
		if (argv.slice(-2).join(" ") === "root -g") return { code: 0, stdout: npmRoot };
		if (argv[0] === "-xzf") writeFileSync(join(argv[argv.indexOf("-C") + 1], "package.json"), JSON.stringify({ name: "tomidev", version: "4.1.0" }));
		if (argv.includes("pack")) {
			const version = JSON.parse(readFileSync(join(options.cwd!, "package.json"), "utf8")).version;
			writeFileSync(join(argv[argv.indexOf("--pack-destination") + 1], `tomidev-${version}.tgz`), "tgz");
		}
		return { code: failInstall && argv.includes("-g") ? 1 : 0, stdout: "" };
	};
	const which = async (name: string) => { lookups.push(name); return tools.includes(name) ? `/fake/${name}${platform === "win32" ? ".cmd" : ""}` : null; };
	const adapters = { fs: platform === "win32" ? { ...fs, realpath: (path: string) => fs.realpath(path.replaceAll("\\", "/")) } : fs, run, which,
		fetch: async (url: string) => {
			fetches.push(url); assert.match(url, /TommiL90\/tomidev-shell/);
			if (url.endsWith("releases/latest")) return { ok: latest !== "", json: async () => ({ tag_name: `v${latest}` }) };
			return { ok: true, text: async () => commit, arrayBuffer: async () => Buffer.from("source") };
		}, ...(invocation ? { invocation } : {}), ...(migrate ? { migrate } : {}) };
	const upgrade = (args: string[] = [], currentVersion = "4.0.0") => runUpgrade({ args, ctx, platform, packageRoot, currentVersion, adapters, out: (line: string) => lines.push(line) });
	const manager = (command = "upgrade") => ownerManager({ ctx, platform, packageRoot, adapters, command });
	return { home, ctx, calls, fetches, lookups, lines, upgrade, manager, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
test("current release is a no-op and latest discovery failures mutate nothing", async () => {
	for (const latest of ["4.0.0", ""]) {
		const w = world({ latest });
		try {
			if (latest) { assert.equal(await w.upgrade(), 0); assert.deepEqual(w.lines, ["tomidev 4.0.0 is already the latest release."]); }
			else await assert.rejects(w.upgrade(), (e: MainChannelError) => e.code === "latest-release-unavailable");
			assert.deepEqual(w.calls, []); assert.equal(existsSync(channelStatePath(w.ctx)), false);
		} finally { w.cleanup(); }
	}
});
for (const owner of ["pnpm", "npm"]) test(`release upgrades only tomidev with its ${owner} owner`, async () => {
	const w = world({ owner });
	try {
		assert.equal(await w.upgrade(), 0);
		assert.deepEqual(w.calls.filter((c) => c.includes("-g") && !c.includes("root")), [[`/fake/${owner}`, owner === "pnpm" ? "add" : "install", "-g", "git:github.com/TommiL90/tomidev-shell#v4.1.0", ...(owner === "pnpm" ? ["--allow-build=tomidev"] : [])]]);
		assert.deepEqual(await readChannel(w.ctx, fs), { channel: "release" });
		assert.deepEqual(w.lines, ["Updated tomidev 4.0.0 to 4.1.0 (release)."]);
		assert.equal((await w.manager("uninstall")).name, owner);
	} finally { w.cleanup(); }
});
test("linked checkouts and missing owning managers keep upgrade and uninstall refusals", async () => {
	for (const command of ["upgrade", "uninstall"]) {
		const linked = world({ owner: "linked" }), missing = world({ tools: ["npm"] });
		try {
			await assert.rejects(linked.manager(command), (e: MainChannelError) => e.code === `${command}-owner-unknown`);
			await assert.rejects(missing.manager(command), (e: MainChannelError) => e.code === `${command}-manager-missing`);
			assert.equal(linked.calls.some((c) => c.includes("add") || c.includes("install")), false);
		} finally { linked.cleanup(); missing.cleanup(); }
	}
});
test("main updates only the fork, records its SHA and ignores native development state", async () => {
	const w = world({ commit: NEXT });
	try {
		await writeChannel(w.ctx, { channel: "main", shellCommit: SHA }, fs);
		const registration = join(w.home, ".pi", "gentle-ai", "dev-binary.json");
		writeFileSync(registration, "user-owned");
		assert.equal(await w.upgrade([], `4.0.0-main.${SHA.slice(0, 12)}`), 0);
		assert.deepEqual(await readChannel(w.ctx, fs), { channel: "main", shellCommit: NEXT });
		assert.equal(readFileSync(registration, "utf8"), "user-owned");
		assert.equal(w.lookups.includes("go"), false);
		assert.equal(w.fetches.length, 2);
		assert.deepEqual(w.lines, ["Updated to the latest main: tomidev 333333333333."]);
		w.calls.length = 0; w.lines.length = 0;
		assert.equal(await w.upgrade([], "4.1.0-main.333333333333"), 0);
		assert.deepEqual(w.calls, []);
		assert.deepEqual(w.lines, ["tomidev is already at the latest main: tomidev 333333333333."]);
	} finally { w.cleanup(); }
});
test("failed main installation does not record a channel", async () => {
	const w = world({ failInstall: true });
	try {
		await assert.rejects(w.upgrade(["--channel", "main"]), (e: MainChannelError) => e.code === "upgrade-install-failed");
		assert.equal(existsSync(channelStatePath(w.ctx)), false); assert.deepEqual(w.lines, []);
	} finally { w.cleanup(); }
});
test("main requires pnpm but not Go; invalid arguments fail before network or commands", async () => {
	for (const args of [["--channel"], ["--channel", "nightly"], ["--force"], ["main"], ["--channel", "main"]]) {
		const w = world({ tools: ["npm"] });
		try {
			await assert.rejects(w.upgrade(args), (e: MainChannelError) => e.code === (args[1] === "main" ? "main-requires-tools" : "upgrade-usage"));
			assert.deepEqual(w.calls, []); assert.deepEqual(w.fetches, []);
		} finally { w.cleanup(); }
	}
});
test("Windows runs package managers through host invocations, never cmd shims", async () => {
	const invocation = async (name: string) => ({ command: "C:\\fake\\node.exe", prefix: [`C:\\fake\\${name}.mjs`] });
	for (const owner of ["pnpm", "npm"]) {
		const w = world({ owner, platform: "win32", invocation });
		try { assert.equal(await w.upgrade(), 0); assert.equal(w.calls.some((c) => /\.(cmd|bat)$/.test(c[0])), false); assert.equal((await w.manager("uninstall")).command, "C:\\fake\\node.exe"); }
		finally { w.cleanup(); }
	}
	const missing = world({ platform: "win32" });
	try { await assert.rejects(missing.upgrade(["--channel", "main"]), (e: MainChannelError) => e.code === "main-requires-tools"); assert.deepEqual(missing.calls, []); }
	finally { missing.cleanup(); }
});
test("release migration preserves bundled success/failure handling and legacy channel records", async () => {
	for (const outcome of [{ code: 0, installed: true }, { code: 1, installed: true }, null]) {
		let asked = 0;
		const w = world({ migrate: async ({ latest, owner }) => { asked++; assert.equal(latest, "4.1.0"); assert.equal((await owner() as { name: string }).name, "pnpm"); return outcome; } });
		try {
			await writeChannel(w.ctx, { channel: "main", shellCommit: SHA }, fs);
			writeFileSync(channelStatePath(w.ctx), JSON.stringify({ schema: CHANNEL_SCHEMA, channel: "main", shellCommit: SHA, gentleAiCommit: "1".repeat(40) }));
			assert.equal(await w.upgrade(["--channel=release"]), outcome?.code ?? 0);
			assert.equal(asked, 1); assert.deepEqual(await readChannel(w.ctx, fs), { channel: "release" });
			assert.equal(w.calls.some((c) => c.includes("add")), outcome === null);
		} finally { w.cleanup(); }
	}
	let asked = 0;
	const w = world({ migrate: async () => { asked++; return null; } });
	try { assert.equal(await w.upgrade(["--channel", "main"]), 0); assert.equal(asked, 0); } finally { w.cleanup(); }
});
test("switching to release removes only legacy main-owned overrides, retaining user registrations", async () => {
	for (const owned of [true, false]) {
		const w = world();
		try {
			await writeChannel(w.ctx, { channel: "main", shellCommit: SHA }, fs);
			const registration = join(w.home, ".pi", "gentle-ai", "dev-binary.json");
			const binary = owned ? join(w.home, ".pi", "gentle-ai", "main", "gentle-ai", SHA, "gentle-ai") : "/independent/user-binary";
			const record = JSON.stringify({ schema: "tomidev.dev-binary/v1", path: binary });
			writeFileSync(registration, record);
			assert.equal(await w.upgrade(["--channel", "release"]), 0);
			assert.equal(existsSync(registration), !owned);
			if (!owned) assert.equal(readFileSync(registration, "utf8"), record);
		} finally { w.cleanup(); }
	}
});
test("removeGlobalShell removes only the retired global gentle-pi with the verified owner", async () => {
	const calls: string[][] = [];
	const run = async (command: string, argv: string[]) => { calls.push([command, ...argv]); return { code: calls.length === 3 ? 1 : 0 }; };
	assert.equal(await removeGlobalShell({ name: "pnpm", command: "/fake/pnpm", prefix: [] }, run), true);
	assert.equal(await removeGlobalShell({ name: "npm", command: "C:\\fake\\node.exe", prefix: ["npm.mjs"] }, run), true);
	assert.equal(await removeGlobalShell({ name: "npm", command: "/fake/npm", prefix: [] }, run), false);
	assert.deepEqual(calls, [["/fake/pnpm", "remove", "-g", "gentle-pi"], ["C:\\fake\\node.exe", "npm.mjs", "uninstall", "-g", "gentle-pi"], ["/fake/npm", "uninstall", "-g", "gentle-pi"]]);
});
