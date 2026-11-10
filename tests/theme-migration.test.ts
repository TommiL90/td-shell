import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { LEGACY_DEFAULT_THEME, TOMIDEV_THEME, THEME_MIGRATION_MARKER, migrateDefaultTheme } from "../lib/theme-migration.ts";
import { readVisualProfiles, saveVisualProfile } from "../lib/visual-profiles.ts";
import { DEFAULT_VISUAL_SETTINGS } from "../lib/visual-customization-policy.ts";

const profileValues = (themeName: string) => ({
	themeName,
	animationPolicy: "quality" as const,
	banner: { showRose: true, showTextLogo: true, color: "pink" as const },
	visual: structuredClone(DEFAULT_VISUAL_SETTINGS),
});

function fixture(t: { after(fn: () => void): void }, activeTheme: string, installed = [LEGACY_DEFAULT_THEME, TOMIDEV_THEME, "Gentle"]) {
	const configHome = mkdtempSync(join(tmpdir(), "tomidev-theme-migration-"));
	t.after(() => rmSync(configHome, { recursive: true, force: true }));
	const calls: string[] = [];
	const ui = {
		activeTheme: () => activeTheme,
		hasTheme: (name: string) => installed.includes(name),
		setTheme: (name: string) => { calls.push(name); activeTheme = name; return { success: true }; },
	};
	return { configHome, calls, ui, active: () => activeTheme };
}

test("names the legacy default and the tomidev theme", () => {
	assert.equal(LEGACY_DEFAULT_THEME, "Gentleman-Cute");
	assert.equal(TOMIDEV_THEME, "tomidev");
});

test("switches an active Gentleman-Cute theme to tomidev once and writes the marker", (t) => {
	const f = fixture(t, "Gentleman-Cute");
	const result = migrateDefaultTheme({ configHome: f.configHome, ui: f.ui });
	assert.deepEqual(result, { status: "migrated", switchedActive: true, profilesMigrated: 0 });
	assert.deepEqual(f.calls, ["tomidev"]);
	assert.equal(f.active(), "tomidev");
	assert.ok(existsSync(join(f.configHome, THEME_MIGRATION_MARKER)));
});

test("leaves a user-chosen non-legacy theme untouched but still records the one-time marker", (t) => {
	const f = fixture(t, "Gentle");
	const result = migrateDefaultTheme({ configHome: f.configHome, ui: f.ui });
	assert.deepEqual(result, { status: "migrated", switchedActive: false, profilesMigrated: 0 });
	assert.deepEqual(f.calls, []);
	assert.ok(existsSync(join(f.configHome, THEME_MIGRATION_MARKER)));
});

test("never runs again once the marker exists, so Gentleman-Cute can be re-selected on purpose", (t) => {
	const f = fixture(t, "Gentleman-Cute");
	writeFileSync(join(f.configHome, THEME_MIGRATION_MARKER), "{}\n");
	const result = migrateDefaultTheme({ configHome: f.configHome, ui: f.ui });
	assert.deepEqual(result, { status: "already-migrated" });
	assert.deepEqual(f.calls, []);
	assert.equal(f.active(), "Gentleman-Cute");
});

test("does nothing and writes no marker when the tomidev theme is not installed", (t) => {
	const f = fixture(t, "Gentleman-Cute", ["Gentleman-Cute"]);
	const result = migrateDefaultTheme({ configHome: f.configHome, ui: f.ui });
	assert.deepEqual(result, { status: "tomidev-unavailable" });
	assert.deepEqual(f.calls, []);
	assert.equal(existsSync(join(f.configHome, THEME_MIGRATION_MARKER)), false);
});

test("writes no marker when activating tomidev fails, so the next session retries", (t) => {
	const f = fixture(t, "Gentleman-Cute");
	f.ui.setTheme = () => ({ success: false, error: "boom" }) as never;
	const result = migrateDefaultTheme({ configHome: f.configHome, ui: f.ui });
	assert.deepEqual(result, { status: "failed", error: "boom" });
	assert.equal(existsSync(join(f.configHome, THEME_MIGRATION_MARKER)), false);
});

test("rewrites saved visual profiles that use Gentleman-Cute and keeps the others", (t) => {
	const f = fixture(t, "Gentle");
	const options = { gentlePiConfigHome: f.configHome };
	saveVisualProfile("work", profileValues("Gentleman-Cute"), options);
	saveVisualProfile("night", profileValues("Gentleman-Sexy"), options);
	const result = migrateDefaultTheme({ configHome: f.configHome, ui: f.ui });
	assert.deepEqual(result, { status: "migrated", switchedActive: false, profilesMigrated: 1 });
	const themes = Object.fromEntries(readVisualProfiles(options).profiles.map((p) => [p.name, p.themeName]));
	assert.deepEqual(themes, { work: "tomidev", night: "Gentleman-Sexy" });
});

test("leaves a malformed visual-profiles file byte-for-byte unchanged", (t) => {
	const f = fixture(t, "Gentleman-Cute");
	const path = join(f.configHome, "visual-profiles.json");
	writeFileSync(path, "not json");
	const result = migrateDefaultTheme({ configHome: f.configHome, ui: f.ui });
	assert.deepEqual(result, { status: "migrated", switchedActive: true, profilesMigrated: 0 });
	assert.equal(readFileSync(path, "utf8"), "not json");
});
