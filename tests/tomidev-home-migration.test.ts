import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertNotRealHome } from "./support/isolated-home.ts";

// T6 (S6): the first launch on the default home copies the data of the old
// ~/.gentle-shell once into ~/.tomidev, never moves or edits the old folder,
// and never runs again once ~/.tomidev exists. T6b (S6): the copy is staged in a
// sibling folder and renamed into place in one step, so ~/.tomidev is never half-copied.
// Every run here uses a temporary
// HOME, USERPROFILE and TMPDIR, never the real home.

const binPath = fileURLToPath(new URL("../bin/tomidev.mjs", import.meta.url));
const COPIED_LINE = "tomidev: copied your Tomidev Shell data from ~/.gentle-shell to ~/.tomidev (the old folder was left untouched).";
const canDenyReads = process.platform !== "win32" && process.getuid?.() !== 0;
const posixOnly = process.platform === "win32" ? { skip: "POSIX links and modes" } : {};

interface Sandbox {
	root: string;
	home: string;
	env: NodeJS.ProcessEnv;
}

function sandbox(t: test.TestContext): Sandbox {
	const root = mkdtempSync(join(tmpdir(), "tomidev-home-migration-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const home = join(root, "home");
	const tmp = join(root, "tmp");
	mkdirSync(home, { recursive: true });
	mkdirSync(tmp, { recursive: true });
	const pi = join(root, "fake-pi.mjs");
	writeFileSync(pi, [
		"#!/usr/bin/env node",
		"const args = process.argv.slice(2);",
		"if (args.includes('--version')) { console.log('1.2.0'); process.exit(0); }",
		"console.log(JSON.stringify({ args, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR }));",
		"",
	].join("\n"));
	chmodSync(pi, 0o755);
	// Inherited TOMIDEV_*, GENTLE_* and PI_* values would change the launch; only the sandbox sets them.
	const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
		!/^(TOMIDEV|GENTLE|PI)_/i.test(name) && !/^(HOME|USERPROFILE|TMPDIR|TEMP|TMP)$/i.test(name)));
	const env: NodeJS.ProcessEnv = {
		...inherited,
		HOME: home,
		USERPROFILE: home,
		TMPDIR: tmp,
		TEMP: tmp,
		TMP: tmp,
		TOMIDEV_PI: pi,
		TOMIDEV_NO_AUTO_SETUP: "1",
	};
	return { root, home, env };
}

function launch(sb: Sandbox, args: string[]) {
	return spawnSync(process.execPath, [binPath, ...args], { encoding: "utf8", env: assertNotRealHome(sb.env) });
}

function write(path: string, text: string) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

const read = (path: string) => readFileSync(path, "utf8");

// Every entry under `root` with its type and bytes, so "byte-identical" is checked for the whole tree.
function snapshot(root: string): Record<string, string> {
	const out: Record<string, string> = {};
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			const rel = relative(root, path).split("\\").join("/");
			if (entry.isDirectory()) {
				out[`${rel}/`] = "dir";
				walk(path);
			} else if (entry.isSymbolicLink()) {
				out[rel] = `link:${readlinkSync(path)}`;
			} else {
				out[rel] = `file:${readFileSync(path).toString("base64")}`;
			}
		}
	};
	walk(root);
	return out;
}

function fileNames(root: string): string[] {
	const names: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			names.push(entry.name);
			if (entry.isDirectory()) walk(join(dir, entry.name));
		}
	};
	if (existsSync(root)) walk(root);
	return names;
}

const LEGACY_SETTINGS = `${JSON.stringify({ theme: "tomidev", tuiMode: "fullscreen" }, null, 2)}\n`;

// A complete old ~/.gentle-shell layout with names the migration must copy,
// names it must leave out, and the old-name markers it must never carry over.
function buildLegacyHome(sb: Sandbox, options: { marker?: boolean; config?: boolean } = {}): string {
	const old = join(sb.home, ".gentle-shell");
	const agent = join(old, "agent");
	if (options.marker !== false) write(join(agent, ".gentle-shell-home"), `${JSON.stringify({ createdBy: "gentle-shell", version: "0.0.1" })}\n`);
	write(join(agent, "auth.json"), '{"fixture":"auth"}\n');
	write(join(agent, "settings.json"), LEGACY_SETTINGS);
	write(join(agent, "models-store.json"), '{"fixture":"models"}\n');
	write(join(agent, "trust.json"), '{"fixture":"trust"}\n');
	write(join(agent, "subagents.json"), '{"fixture":"subagents"}\n');
	write(join(agent, "sessions", "--project--", "one.jsonl"), '{"fixture":"session"}\n');
	write(join(agent, "npm", "node_modules", "gentle-engram", "package.json"), '{"name":"gentle-engram"}\n');
	write(join(agent, "gentle-agents", "catalog", "catalog.json"), "{}\n");
	write(join(agent, "web-search-cache", "entry.json"), "{}\n");
	write(join(old, "gentle-ai", "profiles.json"), '{"fixture":"profiles"}\n');
	write(join(old, "gentle-ai", "keymaps.json"), '{"fixture":"keymaps"}\n');
	write(join(old, "gentle-ai", "scratch", "note.txt"), "scratch\n");
	if (options.config !== false) write(join(old, "config.json"), `${JSON.stringify({ home: "isolated", provisioned: { "/custom/home": { setupVersion: 1, gentlePi: "0.0.1", at: "2026-01-01T00:00:00.000Z" } } })}\n`);
	write(join(old, "versions", "1.0.0", "node_modules", "tomidev", "package.json"), "{}\n");
	write(join(old, "runtime", "engram-3.5.2", "engram"), "engram binary\n");
	write(join(old, "current"), "1.0.0\n");
	return old;
}

function newAgent(sb: Sandbox): string {
	return join(sb.home, ".tomidev", "agent");
}

// --- behaviour through the launcher ----------------------------------------

test("a fresh machine creates ~/.tomidev/agent with the tomidev ownership marker and copies nothing", (t) => {
	const sb = sandbox(t);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	assert.ok(existsSync(newAgent(sb)), "the default home is ~/.tomidev/agent");
	assert.equal(existsSync(join(sb.home, ".gentle-shell")), false, "no old folder is created");
	assert.doesNotMatch(result.stderr, /copied your Tomidev Shell data/);
	const marker = JSON.parse(read(join(newAgent(sb), ".tomidev-home")));
	assert.equal(marker.createdBy, "tomidev");
	assert.equal(existsSync(join(newAgent(sb), ".gentle-shell-home")), false, "the old marker name is never written");
});

test("an existing ~/.gentle-shell is copied once: listed data arrives, the old folder stays byte-identical, one exact stderr line", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const before = snapshot(old);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(snapshot(old), before, "the old folder must not change at all");
	const next = join(sb.home, ".tomidev");
	for (const rel of ["agent/auth.json", "agent/models-store.json", "agent/trust.json", "agent/subagents.json", "agent/sessions/--project--/one.jsonl",
		"gentle-ai/profiles.json", "gentle-ai/keymaps.json", "gentle-ai/scratch/note.txt"]) {
		assert.equal(read(join(next, rel)), read(join(old, rel)), `${rel} is copied byte for byte`);
	}
	const settings = JSON.parse(read(join(next, "agent", "settings.json")));
	assert.equal(settings.theme, "tomidev");
	assert.equal(settings.tuiMode, "fullscreen");
	assert.ok(existsSync(join(next, "config.json")));
	assert.equal(JSON.parse(read(join(next, "agent", ".tomidev-home"))).createdBy, "tomidev");
	assert.equal(result.stderr.split("\n").filter((line) => line === COPIED_LINE).length, 1, result.stderr);
});

test("excluded parts of the old home are never copied", (t) => {
	const sb = sandbox(t);
	buildLegacyHome(sb);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	const next = join(sb.home, ".tomidev");
	assert.ok(existsSync(join(next, "agent", "auth.json")), "the listed data is copied, so the exclusions below are real");
	for (const rel of ["versions", "runtime", "current", "agent/npm", "agent/gentle-agents", "agent/web-search-cache", "agent/.gentle-shell-home"]) {
		assert.equal(existsSync(join(next, rel)), false, `${rel} is not copied`);
	}
	assert.equal(fileNames(next).some((name) => name.startsWith(".gentle-shell")), false, "no old-name marker is copied");
});

test("a declared npm:gentle-pi package is dropped from the copied settings.json and nothing else changes", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	write(join(old, "agent", "settings.json"), `${JSON.stringify({ packages: ["npm:gentle-pi", "npm:pi-btw"], theme: "tomidev" }, null, 2)}\n`);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	const settings = JSON.parse(read(join(newAgent(sb), "settings.json")));
	assert.deepEqual(settings.packages, ["npm:pi-btw"]);
	assert.equal(settings.theme, "tomidev");
});

test("the copied config.json points at the new home and forgets the old home's setup record", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const oldAgent = join(old, "agent");
	const record = { setupVersion: 1, gentlePi: "0.0.1", at: "2026-01-01T00:00:00.000Z" };
	write(join(old, "config.json"), `${JSON.stringify({ home: oldAgent, provisioned: { [realpathSync(oldAgent)]: record, "/custom/home": record } })}\n`);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	const config = JSON.parse(read(join(sb.home, ".tomidev", "config.json")));
	assert.equal(config.home, newAgent(sb));
	assert.deepEqual(Object.keys(config.provisioned), ["/custom/home"], "the new home is set up again, other homes keep their records");
});

test("a later launch never copies again, even when a copied file is gone", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const first = launch(sb, []);
	assert.equal(first.status, 0, first.stderr);
	assert.equal(first.stderr.split("\n").filter((line) => line === COPIED_LINE).length, 1);
	unlinkSync(join(newAgent(sb), "auth.json"));
	const before = snapshot(old);
	const second = launch(sb, []);
	assert.equal(second.status, 0, second.stderr);
	assert.equal(existsSync(join(newAgent(sb), "auth.json")), false, "the copy is not repeated");
	assert.doesNotMatch(second.stderr, /copied your Tomidev Shell data/);
	assert.deepEqual(snapshot(old), before);
});

test("a copy that fails midway removes its partial copy, leaves the old folder untouched and warns with the retry step", posixOnly, (t) => {
	if (!canDenyReads) {
		t.skip("file permissions do not stop reads for this user");
		return;
	}
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const locked = join(old, "agent", "sessions", "--locked--");
	write(join(locked, "unreadable.jsonl"), "{}\n");
	const before = snapshot(old);
	chmodSync(locked, 0o000);
	let result;
	try {
		result = launch(sb, []);
	} finally {
		chmodSync(locked, 0o755);
	}
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stderr, /could not copy your Tomidev Shell data/);
	assert.match(result.stderr, /remove ~\/\.tomidev to retry/);
	assert.equal(result.stderr.split("\n").filter((line) => line === COPIED_LINE).length, 0);
	assert.equal(existsSync(join(newAgent(sb), "auth.json")), false, "the partial copy is removed");
	assert.equal(existsSync(join(sb.home, ".tomidev", "gentle-ai", "profiles.json")), false, "the partial copy is removed");
	assert.equal(existsSync(join(newAgent(sb), "sessions")), false, "no partial sessions copy is left in the new home");
	assert.deepEqual(readdirSync(sb.home).filter((name) => name.includes(".migrating-")), [], "no staging folder is left behind");
	assert.deepEqual(snapshot(old), before, "the old folder is untouched");
});

// Every entry of a tree as a relative path, folders with a trailing slash, sorted.
function treeListing(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			const rel = relative(root, path).split("\\").join("/");
			out.push(entry.isDirectory() ? `${rel}/` : rel);
			if (entry.isDirectory()) walk(path);
		}
	};
	walk(root);
	return out.sort();
}

test("leftover staging folders from an interrupted run never block the copy and are never renamed into place", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const oldBefore = snapshot(old);
	const marked = join(sb.home, ".tomidev.migrating-999-abcdef");
	write(join(marked, ".tomidev-migrating"), `${JSON.stringify({ createdBy: "tomidev", pid: 999 })}\n`);
	write(join(marked, "stale.txt"), "stale\n");
	write(join(marked, "agent", "auth.json"), '{"fixture":"stale"}\n');
	const foreign = join(sb.home, ".tomidev.migrating-888-zzzzzz");
	write(join(foreign, "keep.txt"), "keep\n");
	const markedBefore = snapshot(marked);
	const foreignBefore = snapshot(foreign);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	const next = join(sb.home, ".tomidev");
	assert.equal(existsSync(join(next, "stale.txt")), false, "the leftover is not renamed into place");
	assert.equal(read(join(next, "agent", "auth.json")), read(join(old, "agent", "auth.json")), "the copy comes from the old folder");
	assert.equal(result.stderr.split("\n").filter((line) => line === COPIED_LINE).length, 1, result.stderr);
	assert.deepEqual(snapshot(marked), markedBefore, "a leftover with our marker is left as it was");
	assert.deepEqual(snapshot(foreign), foreignBefore, "a leftover without our marker is left as it was");
	assert.deepEqual(snapshot(old), oldBefore);
});

test("the success path leaves exactly the files of the one-time copy and no staging folder", posixOnly, (t) => {
	const sb = sandbox(t);
	buildLegacyHome(sb);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	const next = join(sb.home, ".tomidev");
	assert.deepEqual(treeListing(next), [
		"agent/",
		"agent/.tomidev-home",
		"agent/auth.json",
		"agent/models-store.json",
		"agent/sessions/",
		"agent/sessions/--project--/",
		"agent/sessions/--project--/one.jsonl",
		"agent/settings.json",
		"agent/subagents.json",
		"agent/trust.json",
		"config.json",
		"gentle-ai/",
		"gentle-ai/keymaps.json",
		"gentle-ai/profiles.json",
		"gentle-ai/scratch/",
		"gentle-ai/scratch/note.txt",
	]);
	assert.deepEqual(readdirSync(sb.home).filter((name) => name.includes(".migrating-")), [], "no staging folder is left behind");
	for (const rel of treeListing(next).filter((entry) => !entry.endsWith("/"))) {
		assert.doesNotMatch(read(join(next, rel)), /\.migrating-/, `${rel} does not name the staging folder`);
	}
	assert.equal(statSync(next).mode & 0o777, 0o700, "the home is private");
});

test("--link, --home and TOMIDEV_HOME never migrate", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const before = snapshot(old);
	const link = launch(sb, ["--link"]);
	assert.equal(link.status, 0, link.stderr);
	const custom = launch(sb, ["--home", join(sb.root, "custom-home")]);
	assert.equal(custom.status, 0, custom.stderr);
	const overridden = spawnSync(process.execPath, [binPath], { encoding: "utf8", env: assertNotRealHome({ ...sb.env, TOMIDEV_HOME: join(sb.root, "custom-agent") }) });
	assert.equal(overridden.status, 0, overridden.stderr);
	assert.equal(existsSync(join(sb.home, ".tomidev")), false, "no ~/.tomidev is created by a skipped run");
	for (const result of [link, custom, overridden]) assert.doesNotMatch(result.stderr, /copied your Tomidev Shell data/);
	assert.deepEqual(snapshot(old), before);
});

// T7b gate through the launcher: --version and self-uninstall never touch the old home or create ~/.tomidev.
test("--version and self-uninstall never copy the old home or create ~/.tomidev", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const before = snapshot(old);
	const version = launch(sb, ["--version"]);
	assert.equal(version.status, 0, version.stderr);
	// --dry-run and an unknown flag: the argument check fails before any work, so nothing can be removed.
	const uninstall = launch(sb, ["self-uninstall", "--dry-run", "--unknown-flag"]);
	assert.equal(uninstall.status, 2, uninstall.stdout + uninstall.stderr);
	assert.match(uninstall.stderr, /unknown argument --unknown-flag/);
	assert.equal(existsSync(join(sb.home, ".tomidev")), false, "neither run creates ~/.tomidev");
	for (const result of [version, uninstall]) assert.doesNotMatch(result.stderr, /copied your Tomidev Shell data/);
	assert.deepEqual(snapshot(old), before);
});

// T7b gate through the launcher: an update forwarded to Pi writes the home, so the copy runs first.
// Only extension-only updates are used here: a self update would reach the real package manager.
test("an update forwarded to Pi copies the old home before Pi runs", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const forwarded = launch(sb, ["update", "--extensions-only"]);
	assert.equal(forwarded.status, 0, forwarded.stderr);
	assert.equal(forwarded.stderr.split("\n").filter((line) => line === COPIED_LINE).length, 1, forwarded.stderr);
	assert.equal(read(join(newAgent(sb), "auth.json")), read(join(old, "agent", "auth.json")));
});

test("an old folder without the gentle-shell ownership marker or config.json is not copied", (t) => {
	const sb = sandbox(t);
	buildLegacyHome(sb, { marker: false, config: false });
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(join(newAgent(sb), "auth.json")), false);
	assert.doesNotMatch(result.stderr, /copied your Tomidev Shell data/);
});

test("an old folder reached through a symbolic link is never copied", posixOnly, (t) => {
	const sb = sandbox(t);
	const real = buildLegacyHome({ ...sb, home: join(sb.root, "elsewhere") });
	symlinkSync(real, join(sb.home, ".gentle-shell"), "dir");
	const before = snapshot(real);
	const result = launch(sb, []);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(join(newAgent(sb), "auth.json")), false);
	assert.doesNotMatch(result.stderr, /copied your Tomidev Shell data/);
	assert.deepEqual(snapshot(real), before);
});

test("the copy runs before the first write to ~/.tomidev, and home print stays read-only", (t) => {
	const sb = sandbox(t);
	const old = buildLegacyHome(sb);
	const before = snapshot(old);
	const printed = launch(sb, ["home"]);
	assert.equal(printed.status, 0, printed.stderr);
	assert.equal(existsSync(join(sb.home, ".tomidev")), false, "printing the home writes nothing");
	const persisted = launch(sb, ["home", "link"]);
	assert.equal(persisted.status, 0, persisted.stderr);
	assert.equal(JSON.parse(read(join(sb.home, ".tomidev", "config.json"))).home, "link");
	assert.equal(read(join(newAgent(sb), "auth.json")), read(join(old, "agent", "auth.json")), "the data was copied before the choice was saved");
	assert.equal(persisted.stderr.split("\n").filter((line) => line === COPIED_LINE).length, 1, persisted.stderr);
	assert.deepEqual(snapshot(old), before);
});

// --- the pure rules, through the exported launcher functions -----------------

async function launcher() {
	return import("../lib/gentle-shell-launcher.ts");
}

test("legacyHomeMigrationApplies: only the default home, never a bundled, version, print or dry-run launch", async () => {
	const lib = await launcher();
	const applies = (argv: string[], env: Record<string, string | undefined> = {}, bundled = false) =>
		lib.legacyHomeMigrationApplies({ args: lib.parseLauncherArgs(argv), env, bundled });
	assert.equal(applies([]), true);
	assert.equal(applies(["--isolated"]), true);
	assert.equal(applies(["install", "npm:x"]), true, "a pi subcommand launch writes the home");
	assert.equal(applies(["setup"]), true);
	assert.equal(applies(["home", "link"]), true, "persisting a home choice writes the home");
	assert.equal(applies(["home", "import-pi"]), true);
	assert.equal(applies(["--link"]), false);
	assert.equal(applies(["--home", "/x"]), false);
	assert.equal(applies([], { TOMIDEV_HOME: "/x" }), false);
	assert.equal(applies([], { TOMIDEV_HOME: "" }), true, "an empty TOMIDEV_HOME is unset, as the resolver treats it");
	assert.equal(applies([], {}, true), false, "a bundled prefix run never migrates");
	assert.equal(applies(["--version"]), false);
	assert.equal(applies(["home"]), false);
	assert.equal(applies(["home", "import-pi", "--dry-run"]), false);
	assert.equal(applies(["setup", "--dry-run"]), false);
	assert.equal(applies(["upgrade"]), false);
	assert.equal(applies(["self-uninstall"]), false, "self-uninstall never writes the home");
	assert.equal(applies(["self-uninstall", "--dry-run"]), false);
	assert.equal(applies(["list", "--version"]), false, "--version wins over a pi subcommand");
	// pi update: copies only when the update is forwarded to Pi (Pi then writes the home); a self update only replaces Pi.
	assert.equal(applies(["update"]), false, "a plain self update never copies");
	assert.equal(applies(["update", "--latest"]), false);
	assert.equal(applies(["update", "self"]), false);
	assert.equal(applies(["update", "--self", "--latest"]), false);
	assert.equal(applies(["update", "--extensions-only"]), true, "an extension-only update is forwarded to Pi");
	assert.equal(applies(["update", "--extensions"]), true);
	assert.equal(applies(["update", "--all"]), true, "--all also updates the packages");
	assert.equal(applies(["update", "--self", "--extensions"]), true);
	assert.equal(applies(["update", "npm:pi-btw"]), true, "a named package is forwarded to Pi");
	assert.equal(applies(["update", "--bogus"]), true, "an unknown update flag is forwarded to Pi, which decides");
	assert.equal(applies(["remove", "npm:pi-btw"]), true);
});

// A plain in-memory filesystem: enough to observe what the migration creates, writes and removes.
type MemoryEntry = { dir: true } | { text: string };

// `beforeRename` runs first, with the tree, and may change it or throw: it stands in for another launch or a failing rename.
function memoryFs(files: Record<string, string>, failCopyTo?: (to: string) => boolean, hooks: { beforeRename?: (tree: Map<string, MemoryEntry>, from: string, to: string) => void } = {}) {
	type Entry = MemoryEntry;
	const tree = new Map<string, Entry>();
	const writes: string[] = [];
	const removed: string[] = [];
	const staged: string[] = [];
	const renamed: [string, string][] = [];
	let stagingCount = 0;
	const addDirs = (path: string) => {
		for (let current = path; current !== dirname(current); current = dirname(current)) {
			if (!tree.has(current)) tree.set(current, { dir: true });
		}
	};
	for (const [path, text] of Object.entries(files)) {
		addDirs(dirname(path));
		tree.set(path, { text });
	}
	const kind = (path: string) => {
		const entry = tree.get(path);
		return entry === undefined ? "missing" : "dir" in entry ? "dir" : "file";
	};
	const fs = {
		kind,
		list: (path: string) => {
			if (kind(path) !== "dir") throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" });
			return [...tree.keys()].filter((key) => key !== path && dirname(key) === path).map((key) => basename(key));
		},
		mkdirPrivate: (path: string) => {
			if (kind(path) === "file") throw new Error(`EEXIST ${path}`);
			addDirs(path);
			tree.set(path, { dir: true });
		},
		copyNew: (from: string, to: string) => {
			const entry = tree.get(from);
			if (entry === undefined || !("text" in entry)) throw new Error(`ENOENT ${from}`);
			if (tree.has(to)) throw new Error(`EEXIST ${to}`);
			if (failCopyTo?.(to)) throw Object.assign(new Error(`EACCES ${from}`), { code: "EACCES" });
			tree.set(to, { text: entry.text });
			writes.push(to);
		},
		writeNew: (path: string, text: string) => {
			if (tree.has(path)) throw new Error(`EEXIST ${path}`);
			tree.set(path, { text });
			writes.push(path);
		},
		readText: (path: string) => {
			const entry = tree.get(path);
			return entry !== undefined && "text" in entry ? entry.text : undefined;
		},
		realpath: (path: string) => path,
		readPackageName: (_dir: string) => undefined,
		remove: (path: string) => {
			removed.push(path);
			for (const key of [...tree.keys()]) if (key === path || key.startsWith(`${path}/`)) tree.delete(key);
		},
		// Like mkdtemp: a new name under `prefix`, never an existing path.
		makeStagingDir: (prefix: string) => {
			const path = `${prefix}stage${++stagingCount}`;
			if (tree.has(path)) throw Object.assign(new Error(`EEXIST ${path}`), { code: "EEXIST" });
			addDirs(path);
			tree.set(path, { dir: true });
			staged.push(path);
			return path;
		},
		// Like rename(2) for a folder: refuses to replace an existing target.
		rename: (from: string, to: string) => {
			renamed.push([from, to]);
			hooks.beforeRename?.(tree, from, to);
			if (tree.has(to)) throw Object.assign(new Error(`ENOTEMPTY ${to}`), { code: "ENOTEMPTY" });
			for (const key of [...tree.keys()]) {
				if (key !== from && !key.startsWith(`${from}/`)) continue;
				const entry = tree.get(key) as Entry;
				tree.delete(key);
				tree.set(to + key.slice(from.length), entry);
			}
		},
	};
	return { fs, tree, writes, removed, staged, renamed };
}

// Every entry under `root` (inclusive) in path order, for "nothing changed" checks.
function entriesUnder(tree: Map<string, MemoryEntry>, root: string): [string, MemoryEntry][] {
	return [...tree.entries()].filter(([path]) => path === root || path.startsWith(`${root}/`)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

const MEMORY_LEGACY: Record<string, string> = {
	"/home/u/.gentle-shell/agent/.gentle-shell-home": '{"createdBy":"gentle-shell"}\n',
	"/home/u/.gentle-shell/agent/auth.json": "auth",
	"/home/u/.gentle-shell/agent/settings.json": '{"theme":"tomidev"}\n',
	"/home/u/.gentle-shell/agent/sessions/a.jsonl": "session",
	"/home/u/.gentle-shell/agent/npm/node_modules/x/package.json": "{}",
	"/home/u/.gentle-shell/agent/gentle-agents/catalog.json": "{}",
	"/home/u/.gentle-shell/gentle-ai/profiles.json": "profiles",
	"/home/u/.gentle-shell/gentle-ai/.gentle-shell-old": "marker",
	"/home/u/.gentle-shell/config.json": '{"home":"isolated"}\n',
	"/home/u/.gentle-shell/versions/1.0.0/bin/tomidev": "bin",
};

test("migrateLegacyHome copies the listed data, writes the marker last and changes nothing under the old folder", async () => {
	const lib = await launcher();
	const { fs, tree, writes, staged } = memoryFs({ ...MEMORY_LEGACY });
	const legacyBefore = entriesUnder(tree, "/home/u/.gentle-shell");
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => "9.9.9", pid: 4242, fs });
	assert.deepEqual(result, { status: "copied", line: COPIED_LINE });
	const copiedFiles = [...tree.keys()].filter((path) => path.startsWith("/home/u/.tomidev/") && "text" in (tree.get(path) as object)).sort();
	assert.deepEqual(copiedFiles, [
		"/home/u/.tomidev/agent/.tomidev-home",
		"/home/u/.tomidev/agent/auth.json",
		"/home/u/.tomidev/agent/sessions/a.jsonl",
		"/home/u/.tomidev/agent/settings.json",
		"/home/u/.tomidev/config.json",
		"/home/u/.tomidev/gentle-ai/profiles.json",
	]);
	assert.equal((tree.get("/home/u/.tomidev/agent/.tomidev-home") as { text: string }).text, '{"createdBy":"tomidev","version":"9.9.9"}\n');
	assert.equal(writes.at(-1), `${staged[0]}/agent/.tomidev-home`, "the ownership marker is written last, inside the staged copy");
	assert.deepEqual(entriesUnder(tree, "/home/u/.gentle-shell"), legacyBefore);
});

test("migrateLegacyHome removes only its own staging folder when a copy fails midway", async () => {
	const lib = await launcher();
	const { fs, tree, writes, removed, staged, renamed } = memoryFs({ ...MEMORY_LEGACY }, (to) => to.endsWith("/sessions/a.jsonl"));
	const legacyBefore = entriesUnder(tree, "/home/u/.gentle-shell");
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => "9.9.9", pid: 4242, fs });
	assert.equal(result.status, "failed");
	assert.match((result as { message: string }).message, /could not copy your Tomidev Shell data/);
	assert.match((result as { message: string }).message, /remove ~\/\.tomidev to retry/);
	assert.deepEqual(removed, [staged[0]]);
	assert.deepEqual(renamed, [], "the home is never renamed into place");
	assert.ok(writes.every((path) => path.startsWith(`${staged[0]}/`)), "nothing is written under ~/.tomidev");
	assert.equal([...tree.keys()].some((path) => path.startsWith("/home/u/.tomidev")), false, "no ~/.tomidev or staging folder is left behind");
	assert.deepEqual(entriesUnder(tree, "/home/u/.gentle-shell"), legacyBefore);
});

test("withoutLegacyGentlePiPackage drops only gentle-pi declarations and keeps the rest of the text", async () => {
	const lib = await launcher();
	const text = `{\n  "packages": [\n    "npm:gentle-pi",\n    { "source": "npm:gentle-pi@1.0.0" },\n    "./vendor/gentle-pi",\n    "npm:pi-btw"\n  ],\n  "theme": "tomidev"\n}\n`;
	const packageName = (dir: string) => (dir.endsWith("/agent/vendor/gentle-pi") ? "gentle-pi" : undefined);
	const cleaned = lib.withoutLegacyGentlePiPackage(text, { agentDir: "/home/u/.gentle-shell/agent", readPackageName: packageName });
	assert.equal(cleaned, `${JSON.stringify({ packages: ["npm:pi-btw"], theme: "tomidev" }, null, 2)}\n`);
	assert.equal(lib.withoutLegacyGentlePiPackage('{\n  "packages": ["npm:pi-btw"]\n}\n', { agentDir: "/a", readPackageName: () => undefined }), undefined, "nothing to drop: bytes are copied as they are");
});

test("adaptLegacyLauncherConfig rewrites the old isolated home and forgets its setup record only", async () => {
	const lib = await launcher();
	const record = { setupVersion: 1, gentlePi: "0.0.1", at: "2026-01-01T00:00:00.000Z" };
	const text = JSON.stringify({ home: "/home/u/.gentle-shell/agent", provisioned: { "/home/u/.gentle-shell/agent": record, "/custom/home": record } });
	const adapted = lib.adaptLegacyLauncherConfig(text, { oldAgents: ["/home/u/.gentle-shell/agent"], newAgent: "/home/u/.tomidev/agent" });
	assert.ok(adapted !== undefined);
	const parsed = JSON.parse(adapted);
	assert.equal(parsed.home, "/home/u/.tomidev/agent");
	assert.deepEqual(Object.keys(parsed.provisioned), ["/custom/home"]);
	assert.equal(lib.adaptLegacyLauncherConfig('{"home":"link"}', { oldAgents: ["/home/u/.gentle-shell/agent"], newAgent: "/home/u/.tomidev/agent" }), undefined);
});

// --- T6b: the staged copy and its single rename (pure rules, memory filesystem) ---

test("migrateLegacyHome stages in a fresh sibling folder: nothing is written under ~/.tomidev before one final rename", async () => {
	const lib = await launcher();
	const { fs, tree, writes, staged, renamed } = memoryFs({ ...MEMORY_LEGACY });
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => "9.9.9", pid: 4242, fs });
	assert.equal(result.status, "copied");
	assert.equal(staged.length, 1, "exactly one staging folder is created");
	const [staging] = staged;
	assert.match(staging, /^\/home\/u\/\.tomidev\.migrating-4242-/, "the staging folder is a sibling of ~/.tomidev named for this process");
	assert.deepEqual(renamed, [[staging, "/home/u/.tomidev"]], "one rename moves the whole staged copy into place");
	assert.equal(writes[0], `${staging}/.tomidev-migrating`, "the staging marker is written first");
	assert.equal(writes.at(-1), `${staging}/agent/.tomidev-home`, "the ownership marker is written last");
	assert.ok(writes.every((path) => path.startsWith(`${staging}/`)), "every write lands in the staging folder");
	assert.equal([...tree.keys()].some((path) => path.endsWith("/.tomidev-migrating") || path === staging), false, "the staging marker and folder do not reach the new home");
});

test("migrateLegacyHome: a version that cannot be read never stops the copy; the marker records unknown", async () => {
	const lib = await launcher();
	const { fs, tree } = memoryFs({ ...MEMORY_LEGACY });
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => { throw new Error("ENOENT package.json"); }, pid: 4242, fs });
	assert.deepEqual(result, { status: "copied", line: COPIED_LINE });
	assert.equal((tree.get("/home/u/.tomidev/agent/.tomidev-home") as { text: string }).text, '{"createdBy":"tomidev","version":"unknown"}\n');
});

test("migrateLegacyHome reads the version only once a copy is certain", async () => {
	const lib = await launcher();
	let reads = 0;
	const readVersion = () => {
		reads += 1;
		return "9.9.9";
	};
	const noLegacy = memoryFs({});
	assert.deepEqual(lib.migrateLegacyHome({ homedir: "/home/u", readVersion, pid: 4242, fs: noLegacy.fs }), { status: "skipped" });
	const homeExists = memoryFs({ ...MEMORY_LEGACY, "/home/u/.tomidev/config.json": "{}" });
	assert.deepEqual(lib.migrateLegacyHome({ homedir: "/home/u", readVersion, pid: 4242, fs: homeExists.fs }), { status: "skipped" });
	assert.equal(reads, 0, "neither skipped launch reads the package version");
});

test("migrateLegacyHome: a rename that fails while ~/.tomidev is still missing removes the staging folder and warns", async () => {
	const lib = await launcher();
	const { fs, tree, removed, staged } = memoryFs({ ...MEMORY_LEGACY }, undefined, {
		beforeRename: () => {
			throw Object.assign(new Error("EPERM /home/u/.tomidev"), { code: "EPERM" });
		},
	});
	const legacyBefore = entriesUnder(tree, "/home/u/.gentle-shell");
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => "9.9.9", pid: 4242, fs });
	assert.equal(result.status, "failed");
	assert.match((result as { message: string }).message, /could not copy your Tomidev Shell data/);
	assert.ok(removed.includes(staged[0]), "the staging folder this run created is removed");
	assert.ok(removed.every((path) => path.startsWith(staged[0])), "nothing else is removed");
	assert.equal([...tree.keys()].some((path) => path.startsWith("/home/u/.tomidev")), false, "no ~/.tomidev or staging folder is left behind");
	assert.deepEqual(entriesUnder(tree, "/home/u/.gentle-shell"), legacyBefore);
});

test("a leftover staging folder with our marker is never renamed into place and is left exactly as it was", async () => {
	const lib = await launcher();
	const leftover = "/home/u/.tomidev.migrating-999-old";
	const { fs, tree, staged, renamed } = memoryFs({
		...MEMORY_LEGACY,
		[`${leftover}/.tomidev-migrating`]: '{"createdBy":"tomidev","pid":999}\n',
		[`${leftover}/stale.txt`]: "stale\n",
		[`${leftover}/agent/auth.json`]: "stale-auth",
	});
	const before = entriesUnder(tree, leftover);
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => "9.9.9", pid: 4242, fs });
	assert.deepEqual(result, { status: "copied", line: COPIED_LINE });
	assert.equal(renamed.length, 1);
	assert.equal(renamed[0][0], staged[0], "the rename moves the folder this run created");
	assert.equal((tree.get("/home/u/.tomidev/agent/auth.json") as { text: string }).text, "auth", "the copy comes from the old folder, not the leftover");
	assert.equal(tree.has("/home/u/.tomidev/stale.txt"), false);
	assert.deepEqual(entriesUnder(tree, leftover), before);
});

test("a leftover staging folder without our marker is left untouched and never renamed", async () => {
	const lib = await launcher();
	const leftover = "/home/u/.tomidev.migrating-888-foreign";
	const { fs, tree, staged, renamed } = memoryFs({ ...MEMORY_LEGACY, [`${leftover}/keep.txt`]: "keep\n" });
	const before = entriesUnder(tree, leftover);
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => "9.9.9", pid: 4242, fs });
	assert.equal(result.status, "copied");
	assert.equal(staged.length, 1, "this run stages in a folder of its own");
	assert.deepEqual(renamed.map(([from]) => from), staged, "only the folder this run created is renamed");
	assert.deepEqual(entriesUnder(tree, leftover), before);
});

test("if ~/.tomidev appears before the rename, the staging folder is removed, the other home is untouched and nothing is reported", async () => {
	const lib = await launcher();
	const { fs, tree, removed, staged, renamed } = memoryFs({ ...MEMORY_LEGACY }, undefined, {
		beforeRename: (current) => {
			current.set("/home/u/.tomidev", { dir: true });
			current.set("/home/u/.tomidev/agent", { dir: true });
			current.set("/home/u/.tomidev/agent/auth.json", { text: "other-auth" });
		},
	});
	const legacyBefore = entriesUnder(tree, "/home/u/.gentle-shell");
	const result = lib.migrateLegacyHome({ homedir: "/home/u", readVersion: () => "9.9.9", pid: 4242, fs });
	assert.deepEqual(result, { status: "skipped" }, "another launch won: no copy and no warning");
	assert.equal(renamed.length, 1);
	assert.ok(removed.includes(staged[0]), "the staging folder this run created is removed");
	assert.equal([...tree.keys()].some((path) => path.startsWith(staged[0])), false, "no staging folder is left behind");
	assert.deepEqual(entriesUnder(tree, "/home/u/.tomidev").map(([path]) => path), ["/home/u/.tomidev", "/home/u/.tomidev/agent", "/home/u/.tomidev/agent/auth.json"], "the other home keeps only what the other launch wrote");
	assert.equal((tree.get("/home/u/.tomidev/agent/auth.json") as { text: string }).text, "other-auth");
	assert.deepEqual(entriesUnder(tree, "/home/u/.gentle-shell"), legacyBefore);
});
