import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BIN_NAME, PACKAGE_NAME } from "../lib/brand.ts";
import { describeVersion, findGentlePiDeclaration, helpText, settingsDeclareGentlePi } from "../lib/gentle-shell-launcher.ts";
import { resolveMainCommit } from "../scripts/main-channel.mjs";

// The npm package and its bin are renamed as one clean cut (S2, S3): no alias
// keeps the old gentle-shell bin or the gentle-pi package name alive.
const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("the npm package and its only bin are named tomidev, with no gentle-shell alias", () => {
	assert.equal(manifest.name, "tomidev");
	assert.equal(PACKAGE_NAME, "tomidev");
	assert.equal(BIN_NAME, "tomidev");
	assert.deepEqual(manifest.bin, { tomidev: "bin/tomidev.mjs" });
	assert.equal(existsSync(join(root, "bin", "tomidev.mjs")), true);
	assert.equal(existsSync(join(root, "bin", "gentle-shell.mjs")), false);
	assert.equal(manifest.pi.image, "./assets/tomidev-logo.png");
	assert.ok(manifest.keywords.includes("pi-package"));
	assert.equal(manifest.keywords.includes("gentle-pi"), false);
});

test("take-over recognises an npm:tomidev declaration and a path package named tomidev", () => {
	const none = { agentDir: "/agent", readPackageName: () => undefined };
	assert.deepEqual(findGentlePiDeclaration('{"packages":["npm:tomidev@4.7.0"]}', none), { kind: "npm" });
	assert.equal(settingsDeclareGentlePi('{"packages":[{"source":"npm:tomidev"}]}'), true);
	const dir = resolve("/checkout/tomidev");
	assert.deepEqual(
		findGentlePiDeclaration('{"packages":["/checkout/tomidev"]}', { agentDir: "/agent", readPackageName: (candidate) => (candidate === dir ? "tomidev" : undefined) }),
		{ kind: "path", dir },
	);
});

test("the retired gentle-pi package name is no longer recognised as this package", () => {
	const named = (name: string) => ({ agentDir: "/agent", readPackageName: () => name });
	assert.equal(findGentlePiDeclaration('{"packages":["npm:gentle-pi"]}', { agentDir: "/agent", readPackageName: () => undefined }), undefined);
	assert.equal(findGentlePiDeclaration('{"packages":["/checkout/gentle-pi"]}', named("gentle-pi")), undefined);
	assert.equal(settingsDeclareGentlePi('{"packages":["npm:gentle-pi@4.6.0"]}'), false);
});

test("help and version name the tomidev command", () => {
	assert.match(helpText(), /^Usage: tomidev \[options\]/m);
	assert.doesNotMatch(helpText(), /(?<![.\w-])gentle-shell(?=[ \x27\]\[:])/);
	assert.match(describeVersion({ gentlePiVersion: "4.7.0", piVersion: "1.2.0", home: { mode: "isolated", source: "default", dir: "/h" } } as never), /^tomidev 4\.7\.0$/m);
});

test("launch has no startup release lookup, prompt, cache or relaunch flow", () => {
	const launcher = readFileSync(join(root, "bin", "tomidev.mjs"), "utf8");
	assert.doesNotMatch(launcher, /startupUpdate|findStartupUpdate|promptStartupUpdate|resolveStartupRelaunch|startupReleaseCheck|skippedStartupRelease|TOMIDEV_SKIP_STARTUP_UPDATE/);
	assert.doesNotMatch(helpText(), /Bundled interactive startup|Skip this version|Update now/);
	assert.match(helpText(), /tomidev upgrade/);
});

test("the main-channel GitHub requests identify as tomidev", async () => {
	const agents: string[] = [];
	const sha = "a".repeat(40);
	const fetch = async (_url: string, init: { headers: Record<string, string> }) => {
		agents.push(init.headers["User-Agent"]);
		return { ok: true, status: 200, text: async () => `${sha}\n` };
	};
	await resolveMainCommit("Gentleman-Programming/gentle-shell", { fetch });
	assert.deepEqual(agents, ["tomidev"]);
});
