import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

// The historical postinstall entry is now settings-only. Native provisioning
// must not even be imported.
function postinstall({ managed = true, fail = false } = {}) {
	const root = mkdtempSync(join(tmpdir(), "tomidev-postinstall-"));
	try {
		const scripts = join(root, "scripts");
		mkdirSync(scripts);
		copyFileSync(new URL("../scripts/install-gentle-ai.mjs", import.meta.url), join(scripts, "install-gentle-ai.mjs"));
		writeFileSync(join(scripts, "gentle-ai-installer.mjs"), 'throw new Error("native installer imported");');
		writeFileSync(join(scripts, "install-tui-mode-setting.mjs"), `
			globalThis.fetch = () => { throw new Error("unexpected network"); };
			export const isPiManagedInstall = () => ${managed};
			export async function installTuiModeSetting() {
				${fail ? 'throw new Error("settings locked");' : 'return { changed: true };'}
			}
		`);
		return spawnSync(process.execPath, [join(scripts, "install-gentle-ai.mjs")], { encoding: "utf8",
			env: { HOME: root, USERPROFILE: root, PATH: "" } });
	} finally { rmSync(root, { recursive: true, force: true }); }
}

test("postinstall never loads native provisioning or downloads", () => {
	const result = postinstall();
	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	assert.equal(result.stdout, "tomidev enabled fullscreen in global Pi settings; /settings can switch back to regular.\n");
});

test("postinstall retains nonzero settings failures without native recovery attempts", () => {
	const result = postinstall({ fail: true });
	assert.equal(result.status, 1);
	assert.equal(result.stdout, "");
	assert.equal(result.stderr, "tomidev could not enable fullscreen: settings locked\n");
});

test("postinstall outside a Pi-managed install skips settings and native provisioning", () => {
	const result = postinstall({ managed: false, fail: true });
	assert.equal(result.status, 0);
	assert.equal(result.stderr, "");
	assert.match(result.stdout, /^tomidev skipped enabling fullscreen in global Pi settings: .* is not a pi-managed install\.\n$/);
});
