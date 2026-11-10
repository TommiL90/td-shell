import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import test from "node:test";
import { CHANNEL_SCHEMA, MainChannelError, channelStatePath, installOwner, mainChannelAdapter, mainVersion, packMainShell, readChannel, resolveMainCommit, writeChannel } from "../scripts/main-channel.mjs";
const SHA = "6e7e3a18f794223396527a54c7c36d19c7d236c6";
const OLD_AI = "1f9d5e6423e37f7d2316859045f379ba9b5d8c3a";
function sandbox() {
	const home = mkdtempSync(join(tmpdir(), "tomidev-main-"));
	return { home, ctx: { home, env: {} }, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}
test("channel state defaults to release, writes shell-only records and reads legacy main records", async () => {
	const s = sandbox();
	try {
		assert.equal(channelStatePath(s.ctx), join(s.home, ".pi", "gentle-ai", "channel.json"));
		assert.equal(channelStatePath({ home: s.home, env: { TOMIDEV_CONFIG_HOME: join(s.home, "cfg") } }), join(s.home, "cfg", "channel.json"));
		assert.deepEqual(await readChannel(s.ctx, fs), { channel: "release" });
		await writeChannel(s.ctx, { channel: "main", shellCommit: SHA }, fs);
		assert.deepEqual(JSON.parse(readFileSync(channelStatePath(s.ctx), "utf8")), { schema: CHANNEL_SCHEMA, channel: "main", shellCommit: SHA });
		writeFileSync(channelStatePath(s.ctx), JSON.stringify({ schema: CHANNEL_SCHEMA, channel: "main", shellCommit: SHA, gentleAiCommit: OLD_AI }));
		assert.deepEqual(await readChannel(s.ctx, fs), { channel: "main", shellCommit: SHA });
	} finally { s.cleanup(); }
});
test("malformed channel records fail closed and rejected writes preserve state", async () => {
	const s = sandbox();
	try {
		await writeChannel(s.ctx, { channel: "release" }, fs);
		const before = readFileSync(channelStatePath(s.ctx), "utf8");
		await assert.rejects(writeChannel(s.ctx, { channel: "main", shellCommit: "abc" }, fs), (e: MainChannelError) => e.code === "channel-state-invalid");
		assert.equal(readFileSync(channelStatePath(s.ctx), "utf8"), before);
		for (const bad of ["not json", { schema: CHANNEL_SCHEMA, channel: "nightly" }, { schema: CHANNEL_SCHEMA, channel: "main", shellCommit: "abc", gentleAiCommit: OLD_AI }, { schema: CHANNEL_SCHEMA, channel: "main", shellCommit: SHA, extra: true }]) {
			writeFileSync(channelStatePath(s.ctx), typeof bad === "string" ? bad : JSON.stringify(bad));
			await assert.rejects(readChannel(s.ctx, fs), (e: MainChannelError) => e.code === "channel-state-invalid");
		}
	} finally { s.cleanup(); }
});
test("main resolution accepts only exact SHAs from the fork and mainVersion preserves the base", async () => {
	const requests: string[] = [];
	assert.equal(await resolveMainCommit("TommiL90/td-shell", { fetch: async (url: string, init: { headers: Record<string, string> }) => {
		requests.push(url); assert.equal(init.headers.Accept, "application/vnd.github.sha"); return { ok: true, text: async () => `${SHA}\n` };
	} }), SHA);
	assert.deepEqual(requests, ["https://api.github.com/repos/TommiL90/td-shell/commits/main"]);
	for (const response of [{ ok: true, status: 200, text: async () => "abc123" }, { ok: false, status: 403, text: async () => SHA }]) {
		await assert.rejects(resolveMainCommit("TommiL90/td-shell", { fetch: async () => response }), (e: MainChannelError) => e.code === "main-commit-unavailable");
	}
	assert.equal(mainVersion("4.0.0", SHA), "4.0.0-main.6e7e3a18f794");
});
for (const platform of ["linux", "darwin", "win32"]) test(`packMainShell on ${platform} retains postinstall but removes prepack and prepare`, async () => {
	const s = sandbox();
	try {
		const calls: string[] = [];
		const fetch = async (url: string) => { assert.equal(url, `https://codeload.github.com/TommiL90/td-shell/tar.gz/${SHA}`); return { ok: true, arrayBuffer: async () => Buffer.from("archive") }; };
		const run = async (command: string, argv: string[], options: { cwd?: string }) => {
			calls.push(command);
			if (argv[0] === "-xzf") writeFileSync(join(argv[argv.indexOf("-C") + 1], "package.json"), JSON.stringify({ name: "tomidev", version: "4.0.0", scripts: { prepack: "suite", prepare: "prepare", postinstall: "fullscreen" } }));
			else {
				const manifest = JSON.parse(readFileSync(join(options.cwd!, "package.json"), "utf8"));
				assert.equal(manifest.version, "4.0.0-main.6e7e3a18f794");
				assert.deepEqual(manifest.scripts, { postinstall: "fullscreen" });
				writeFileSync(join(argv[argv.indexOf("--pack-destination") + 1], `tomidev-${manifest.version}.tgz`), "tgz");
			}
			return { code: 0 };
		};
		const tgz = await packMainShell({ commit: SHA, ctx: s.ctx, fetch, run, pnpm: { command: "/fake/pnpm", prefix: [] }, fs, platform });
		assert.ok(existsSync(tgz));
		assert.deepEqual(calls, [platform === "win32" ? win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar", "/fake/pnpm"]);
		assert.equal(existsSync(join(s.home, ".pi", "gentle-ai", "main", ".source")), false);
	} finally { s.cleanup(); }
});
test("failed extraction preserves bounded stderr as the error cause and cleans source scratch", async () => {
	const s = sandbox();
	try {
		await assert.rejects(packMainShell({ commit: SHA, ctx: s.ctx, fs, platform: "linux", pnpm: { command: "/fake/pnpm", prefix: [] },
			fetch: async () => ({ ok: true, arrayBuffer: async () => Buffer.from("archive") }),
			run: async (_: string, __: string[], options: { stderrTail?: number }) => { assert.equal(options.stderrTail, 4096); return { code: 2, stderrTail: "tar failed\n" }; },
		}), (e: MainChannelError) => e.code === "main-shell-pack-failed" && e.cause instanceof Error && e.cause.message === "tar failed");
		assert.equal(existsSync(join(s.home, ".pi", "gentle-ai", "main", ".source")), false);
	} finally { s.cleanup(); }
});
test("main adapter exposes shell operations only and records shell-only channel state", async () => {
	const s = sandbox();
	try {
		const adapter = mainChannelAdapter({ fs, fetch: async () => ({ ok: true, text: async () => SHA }) });
		assert.deepEqual(Object.keys(adapter).sort(), ["packShell", "resolveCommit", "writeChannel"]);
		assert.equal(await adapter.resolveCommit("TommiL90/td-shell"), SHA);
		await adapter.writeChannel(s.ctx, { channel: "main", shellCommit: SHA });
		assert.deepEqual(await readChannel(s.ctx, fs), { channel: "main", shellCommit: SHA });
	} finally { s.cleanup(); }
});
test("installOwner confines npm and pnpm ownership, including scoped Pi and Windows case folding", () => {
	for (const name of ["tomidev", "@earendil-works/pi-coding-agent"]) {
		const roots = { pnpmHome: "/u/pnpm", npmRoot: "/u/npm/node_modules", name, platform: "linux" };
		assert.equal(installOwner({ ...roots, packageRoot: `/u/pnpm/global/node_modules/${name}` }), "pnpm");
		assert.equal(installOwner({ ...roots, packageRoot: `/u/npm/node_modules/${name}` }), "npm");
		for (const packageRoot of ["/u/checkout", "/u/pnpm", "/u/npm/node_modules", `/u/npm/node_modules/other/${name}`]) assert.equal(installOwner({ ...roots, packageRoot }), null);
	}
	assert.equal(installOwner({ pnpmHome: "C:\\Users\\u\\pnpm", npmRoot: null, packageRoot: "c:\\users\\U\\PNPM\\global\\node_modules\\tomidev", platform: "win32" }), "pnpm");
	assert.equal(installOwner({ pnpmHome: null, npmRoot: "C:\\npm\\node_modules", packageRoot: "c:\\NPM\\NODE_MODULES\\TOMIDEV", platform: "win32" }), "npm");
	assert.equal(installOwner({ pnpmHome: null, npmRoot: "/u/npm/node_modules", packageRoot: "/u/npm/node_modules/TOMIDEV", platform: "linux" }), null);
});
