import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertNotRealHome, isolatedHome, realUserHome } from "./support/isolated-home.ts";

// L22 guard: the isolation helper refuses the real home, and every test that starts the
// launcher uses it, so a regression cannot quietly reach ~/.tomidev or ~/.gentle-shell again.

test("assertNotRealHome refuses an environment whose home is the real user home", () => {
	const real = realUserHome();
	assert.throws(() => assertNotRealHome({ HOME: real }), /real user home/);
	assert.throws(() => assertNotRealHome({ HOME: `${real}/` }), /real user home/, "a trailing separator names the same folder");
	assert.throws(() => assertNotRealHome({}), /real user home/, "without HOME a child falls back to the account home");
});

test("assertNotRealHome accepts a temporary home and returns the same environment object", (t) => {
	const sandbox = isolatedHome();
	t.after(sandbox.remove);
	assert.equal(assertNotRealHome(sandbox.env), sandbox.env);
	assert.equal(assertNotRealHome({ HOME: sandbox.home }).HOME, sandbox.home);
});

test("isolatedHome gives a child private HOME, USERPROFILE, TMPDIR and XDG folders, drops launcher home selectors and removes everything", () => {
	const sandbox = isolatedHome({ TOMIDEV_HOME: "/elsewhere", TOMIDEV_CONFIG_HOME: "/elsewhere", PATH: "/usr/bin" });
	assert.equal(sandbox.env.HOME, sandbox.home);
	assert.equal(sandbox.env.USERPROFILE, sandbox.home);
	assert.equal(sandbox.env.PATH, "/usr/bin", "unrelated variables are kept");
	for (const key of ["TMPDIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"]) {
		assert.ok(String(sandbox.env[key]).startsWith(sandbox.root), `${key} is inside the private folder`);
	}
	assert.equal(sandbox.env.TOMIDEV_HOME, undefined);
	assert.equal(sandbox.env.TOMIDEV_CONFIG_HOME, undefined);
	sandbox.remove();
	assert.equal(existsSync(sandbox.root), false);
});

test("every test file that starts the launcher imports the isolation helper", () => {
	const testsDir = fileURLToPath(new URL(".", import.meta.url));
	const missing = readdirSync(testsDir)
		.filter((name) => name.endsWith(".test.ts"))
		.filter((name) => {
			const source = readFileSync(join(testsDir, name), "utf8");
			const startsLauncher = /bin\/tomidev\.mjs|binPath|binUrl/.test(source) && /\b(spawnSync|spawn|execFileSync|runInPty)\(/.test(source);
			return startsLauncher && !source.includes("./support/isolated-home.ts");
		});
	assert.deepEqual(missing, [], "these files start the launcher without tests/support/isolated-home.ts");
});
