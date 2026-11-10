import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readVisualProfiles, saveVisualProfile } from "./visual-profiles.ts";

// tomidev replaced Gentleman-Cute as the default theme. Homes and saved visual
// profiles created before that still name Gentleman-Cute; this one-time step
// moves them to tomidev. The marker makes it run once per config home, so a
// user can still pick Gentleman-Cute on purpose afterwards.
export const LEGACY_DEFAULT_THEME = "Gentleman-Cute";
export const TOMIDEV_THEME = "tomidev";
export const THEME_MIGRATION_MARKER = "theme-migration-tomidev.json";

export interface ThemeMigrationUi {
	activeTheme(): string | undefined;
	hasTheme(name: string): boolean;
	setTheme(name: string): { success: boolean; error?: string };
}

export type ThemeMigrationResult =
	| { status: "already-migrated" }
	| { status: "tomidev-unavailable" }
	| { status: "failed"; error: string }
	| { status: "migrated"; switchedActive: boolean; profilesMigrated: number };

function migrateProfiles(configHome: string): number {
	const options = { gentlePiConfigHome: configHome };
	const resolution = readVisualProfiles(options);
	// A malformed or unreadable file is left exactly as it is.
	if (resolution.malformed || resolution.readError) return 0;
	let migrated = 0;
	for (const { name, ...values } of resolution.profiles) {
		if (values.themeName !== LEGACY_DEFAULT_THEME) continue;
		saveVisualProfile(name, { ...values, themeName: TOMIDEV_THEME }, { ...options, replace: true });
		migrated++;
	}
	return migrated;
}

export function migrateDefaultTheme(input: { configHome: string; ui: ThemeMigrationUi }): ThemeMigrationResult {
	const { configHome, ui } = input;
	const marker = join(configHome, THEME_MIGRATION_MARKER);
	if (existsSync(marker)) return { status: "already-migrated" };
	if (!ui.hasTheme(TOMIDEV_THEME)) return { status: "tomidev-unavailable" };
	let switchedActive = false;
	if (ui.activeTheme() === LEGACY_DEFAULT_THEME) {
		const result = ui.setTheme(TOMIDEV_THEME);
		if (!result.success) return { status: "failed", error: result.error ?? `Could not activate ${TOMIDEV_THEME}.` };
		switchedActive = true;
	}
	const profilesMigrated = migrateProfiles(configHome);
	mkdirSync(configHome, { recursive: true });
	writeFileSync(marker, `${JSON.stringify({ from: LEGACY_DEFAULT_THEME, to: TOMIDEV_THEME, migratedAt: new Date().toISOString() })}\n`);
	return { status: "migrated", switchedActive, profilesMigrated };
}
