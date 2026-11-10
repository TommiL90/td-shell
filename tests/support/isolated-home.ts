import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";

// L22 incident: a test that started bin/tomidev.mjs with the developer's real HOME
// ran the one-time copy from ~/.gentle-shell and created a real ~/.tomidev. Every
// test that starts the launcher (or any child that can read or write a home) must
// give that child its own HOME/USERPROFILE/TMPDIR and XDG folders. These helpers
// make that explicit and make a missing or real home fail loudly before spawning.

// Variables that choose the launcher's home or the Pi agent folder: a test sets its own.
const HOME_SELECTORS = ["TOMIDEV_HOME", "TOMIDEV_AGENT_HOME", "TOMIDEV_CONFIG_HOME", "TOMIDEV_USER_PI_HOME", "PI_CODING_AGENT_DIR"];

function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/** The real user home from the OS account record. $HOME is not used: a test may override it. */
export function realUserHome(): string {
	return canonical(userInfo().homedir);
}

/** The home a child started with `env` resolves to. A missing variable falls back to the account home, as Node does. */
function effectiveHome(env: NodeJS.ProcessEnv): string {
	return process.platform === "win32" ? env.USERPROFILE ?? env.HOME ?? realUserHome() : env.HOME ?? realUserHome();
}

/**
 * Refuses (throws) when a child started with `env` would use the real user home.
 * Returns `env` so a spawn can wrap its environment: `spawnSync(..., { env: assertNotRealHome(env) })`.
 */
export function assertNotRealHome(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	const real = realUserHome();
	if (canonical(effectiveHome(env)) === real) {
		throw new Error(`refusing to start a child process with the real user home (${real}); give it a temporary HOME and USERPROFILE (tests/support/isolated-home.ts)`);
	}
	return env;
}

export interface IsolatedHome {
	/** The private folder that holds home, temporary and XDG folders; removed by remove(). */
	root: string;
	home: string;
	env: NodeJS.ProcessEnv;
	remove: () => void;
}

/** A fresh private HOME, USERPROFILE, TMPDIR and XDG set for one child process, plus its removal. */
export function isolatedHome(base: NodeJS.ProcessEnv = process.env, prefix = "tomidev-test-home-"): IsolatedHome {
	const root = mkdtempSync(join(tmpdir(), prefix));
	const home = join(root, "home");
	const tmp = join(root, "tmp");
	mkdirSync(home, { recursive: true });
	mkdirSync(tmp, { recursive: true });
	const env: NodeJS.ProcessEnv = {
		...base,
		HOME: home,
		USERPROFILE: home,
		TMPDIR: tmp,
		TEMP: tmp,
		TMP: tmp,
		XDG_CONFIG_HOME: join(root, "xdg-config"),
		XDG_DATA_HOME: join(root, "xdg-data"),
		XDG_STATE_HOME: join(root, "xdg-state"),
		XDG_CACHE_HOME: join(root, "xdg-cache"),
	};
	for (const key of HOME_SELECTORS) delete env[key];
	assertNotRealHome(env);
	return { root, home, env, remove: () => rmSync(root, { recursive: true, force: true }) };
}
