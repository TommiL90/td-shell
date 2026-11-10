import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ANIMATION_POLICY, resolveAnimationPolicy, writeAnimationPolicy } from "../lib/animation-policy.ts";
import { resolveVimPolicy, writeVimPolicy } from "../lib/vim-policy.ts";
import { parseDoubleEscCancelPolicyFile, writeDoubleEscCancelPolicy } from "../lib/double-esc-cancel-policy.ts";
import { resolveHistoryCapturePolicy, writeHistoryCapturePolicy } from "../lib/history-capture-policy.ts";
import { parsePermissionModePolicyFile, resolvePermissionModePolicy, writePermissionModePolicy } from "../lib/permission-mode-policy.ts";
import { parseCardStyleFile, resolveCardStyle, writeCardStyle } from "../lib/card-style-policy.ts";
import { parseCardContentFile, resolveCardContent, writeCardContent } from "../lib/card-content-policy.ts";
import { DEFAULT_VISUAL_SETTINGS, parseVisualSettingsFile, resolveVisualSettings, writeVisualSettings } from "../lib/visual-customization-policy.ts";
import { getVisualProfile, saveVisualProfile } from "../lib/visual-profiles.ts";
import { resolveHerdrTaskSummarySettings, writeHerdrTaskSummarySettings } from "../lib/herdr-task-summary-policy.ts";
import { DEFAULT_NOTIFICATION_SETTINGS, resolveNotificationSettings, writeNotificationSettings } from "../lib/notification-policy.ts";
import { BACKGROUND_SUBAGENTS_FILE, BACKGROUND_SUBAGENTS_SCHEMA, loadBackgroundSubagentsPolicy } from "../lib/background-subagents-policy.ts";
import { builtinCodemodeOptOutStatePath, offerBuiltinCodemodeOptOut } from "../lib/builtin-codemode-optout.ts";
import { PROFILES_KIND, PROFILES_VERSION, parseProfileExportText, readProfilesFileResult, serializeProfileExport, writeProfilesFileSync } from "../lib/agent-profiles.ts";
import { normalizeProfilePin, serializeProfilePin } from "../lib/agent-profile-pin.ts";
import { FALLBACKS_KIND, FALLBACKS_VERSION, readFallbacksFile, writeFallbacksFile } from "../lib/model-fallback-store.ts";
import { readVoicePushToTalk, writeVoicePushToTalk } from "../lib/voice-settings.ts";
import { createSessionProfileBind, readSessionProfileEntry, SESSION_PROFILE_CUSTOM_TYPE } from "../lib/session-profile-persistence.ts";
import { readSessionProfileDisk } from "../lib/session-profile-disk-reader.ts";
import { isSessionChangeEvidence, sessionChangeRoots, SESSION_CHANGE_ENTRY, textSnapshot } from "../lib/session-changes.ts";
import { SESSION_WORKTREE_ENTRY, SessionWorktreeRegistry } from "../lib/session-worktree-registry.ts";
import { humanLanguageExcerpt, REPLY_LANGUAGE_ANCHOR_TYPE, replyLanguageAnchor, replyLanguageAnchorText } from "../lib/reply-language-anchor.ts";
import { agentStatus, createAgentStatusStore } from "../lib/agent-status.ts";
import { MODEL_FALLBACK_ENTRY } from "../lib/model-fallback-notice.ts";

// Persisted schema ids (S7 "Leer ambos, escribir nuevo"): every family writes the
// tomidev id and still reads the pre-rename gentle-pi / gentle-shell id. Each test
// writes through the public writer, then reads a legacy-id file through the public reader.

function scratch(t: test.TestContext): string {
	const dir = realpathSync(mkdtempSync(join(tmpdir(), "tomidev-schema-ids-")));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
}

/** Rewrites one top-level field of a JSON file to a legacy id; every other field is kept. */
function withLegacy(path: string, legacy: string, field = "schema"): void {
	const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	writeFileSync(path, `${JSON.stringify({ ...value, [field]: legacy }, null, 2)}\n`);
}

function fieldOf(path: string, field = "schema"): unknown {
	return (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)[field];
}

function picked(resolution: object, keys: readonly string[]): Record<string, unknown> {
	const values = resolution as Record<string, unknown>;
	return Object.fromEntries(keys.map((key) => [key, values[key]]));
}

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function repository(t: test.TestContext): string {
	const root = join(scratch(t), "repo");
	mkdirSync(root);
	git(root, "init", "-b", "main");
	git(root, "config", "user.email", "tests@example.com");
	git(root, "config", "user.name", "Tests");
	writeFileSync(join(root, "README.md"), "test\n");
	git(root, "add", "README.md");
	git(root, "commit", "-m", "initial");
	return root;
}

test("voice-settings writes tomidev.voice-settings/v1 and still reads gentle-pi.voice-settings/v1", (t) => {
	const home = scratch(t);
	const path = writeVoicePushToTalk(true, { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.voice-settings/v1");
	withLegacy(path, "gentle-pi.voice-settings/v1");
	assert.equal(readVoicePushToTalk({ gentlePiConfigHome: home }), true);
});

test("animations write tomidev.animations/v1 and still read gentle-pi.animations/v1", (t) => {
	const home = scratch(t);
	const path = writeAnimationPolicy(ANIMATION_POLICY.POTATO, { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.animations/v1");
	withLegacy(path, "gentle-pi.animations/v1");
	assert.deepEqual(picked(resolveAnimationPolicy({ gentlePiConfigHome: home }), ["policy", "source"]), { policy: "potato", source: "global_file" });
});

test("vim writes tomidev.vim/v1 and still reads gentle-pi.vim/v1", (t) => {
	const home = scratch(t);
	const path = writeVimPolicy("on", { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.vim/v1");
	withLegacy(path, "gentle-pi.vim/v1");
	assert.deepEqual(picked(resolveVimPolicy({ gentlePiConfigHome: home }), ["policy", "source"]), { policy: "on", source: "global_file" });
});

test("double-esc-cancel writes tomidev.double-esc-cancel/v1 and still reads gentle-pi.double-esc-cancel/v1", (t) => {
	const home = scratch(t);
	const path = writeDoubleEscCancelPolicy("on", { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.double-esc-cancel/v1");
	withLegacy(path, "gentle-pi.double-esc-cancel/v1");
	assert.equal(parseDoubleEscCancelPolicyFile(readFileSync(path, "utf8")), "on");
});

test("history-capture writes tomidev.history-capture/v1 and still reads gentle-pi.history-capture/v1", (t) => {
	const home = scratch(t);
	const path = writeHistoryCapturePolicy("on", { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.history-capture/v1");
	withLegacy(path, "gentle-pi.history-capture/v1");
	assert.deepEqual(picked(resolveHistoryCapturePolicy({ gentlePiConfigHome: home }), ["policy", "source"]), { policy: "on", source: "global_file" });
});

test("permission-mode writes tomidev.permission-mode/v1 and still reads gentle-pi.permission-mode/v1", (t) => {
	const home = scratch(t);
	const path = writePermissionModePolicy("yolo", { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.permission-mode/v1");
	withLegacy(path, "gentle-pi.permission-mode/v1");
	assert.equal(parsePermissionModePolicyFile(readFileSync(path, "utf8")), "yolo");
	assert.deepEqual(picked(resolvePermissionModePolicy({ gentlePiConfigHome: home }), ["mode", "source"]), { mode: "yolo", source: "global_file" });
});

test("card-style writes tomidev.card-style/v1 and still reads gentle-pi.card-style/v1", (t) => {
	const home = scratch(t);
	const path = writeCardStyle("neon", { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.card-style/v1");
	withLegacy(path, "gentle-pi.card-style/v1");
	assert.equal(parseCardStyleFile(readFileSync(path, "utf8")), "neon");
	assert.equal(resolveCardStyle({ gentlePiConfigHome: home }).style, "neon");
});

test("card-content writes tomidev.card-content/v1 and still reads gentle-pi.card-content/v1", (t) => {
	const home = scratch(t);
	const path = writeCardContent("minimal", { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.card-content/v1");
	withLegacy(path, "gentle-pi.card-content/v1");
	assert.equal(parseCardContentFile(readFileSync(path, "utf8")), "minimal");
	assert.equal(resolveCardContent({ gentlePiConfigHome: home }).content, "minimal");
});

test("visual-customization writes tomidev.visual-customization/v1 and still reads gentle-pi.visual-customization/v1", (t) => {
	const home = scratch(t);
	const path = writeVisualSettings({ ...DEFAULT_VISUAL_SETTINGS, surface: "tinted" }, { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.visual-customization/v1");
	withLegacy(path, "gentle-pi.visual-customization/v1");
	assert.equal(parseVisualSettingsFile(readFileSync(path, "utf8"))?.surface, "tinted");
	assert.equal(resolveVisualSettings({ gentlePiConfigHome: home }).settings.surface, "tinted");
});

test("visual-profiles write tomidev.visual-profiles/v1 and still read gentle-pi.visual-profiles/v1", (t) => {
	const home = scratch(t);
	const values = { themeName: "dark", animationPolicy: "quality" as const, banner: { showRose: true, showTextLogo: false, color: "pink" as const }, visual: structuredClone(DEFAULT_VISUAL_SETTINGS) };
	const path = saveVisualProfile("work", values, { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.visual-profiles/v1");
	withLegacy(path, "gentle-pi.visual-profiles/v1");
	assert.equal(getVisualProfile("work", { gentlePiConfigHome: home })?.themeName, "dark");
});

test("herdr-task-summary writes tomidev.herdr-task-summary/v1 and still reads gentle-pi.herdr-task-summary/v1", (t) => {
	const home = scratch(t);
	const settings = { enabled: false, summaryColor: "muted" as const, continuationColor: "dim" as const };
	const path = writeHerdrTaskSummarySettings(settings, { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.herdr-task-summary/v1");
	withLegacy(path, "gentle-pi.herdr-task-summary/v1");
	assert.deepEqual(resolveHerdrTaskSummarySettings({ gentlePiConfigHome: home }).settings, settings);
});

test("notifications write tomidev.notifications/v1 and still read gentle-shell.notifications/v1", (t) => {
	const home = scratch(t);
	const path = writeNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true }, { gentlePiConfigHome: home });
	assert.equal(fieldOf(path), "tomidev.notifications/v1");
	withLegacy(path, "gentle-shell.notifications/v1");
	assert.equal(resolveNotificationSettings({ gentlePiConfigHome: home }).settings.enabled, true);
});

test("background-subagents uses the tomidev id and still reads gentle-pi.background-subagents/v1", (t) => {
	const home = scratch(t);
	assert.equal(BACKGROUND_SUBAGENTS_SCHEMA, "tomidev.background-subagents/v1");
	writeFileSync(join(home, BACKGROUND_SUBAGENTS_FILE), `${JSON.stringify({ schema: "gentle-pi.background-subagents/v1", policy: "on" })}\n`);
	assert.equal(loadBackgroundSubagentsPolicy(scratch(t), { gentlePiConfigHome: home, env: {} }), "on");
});

test("builtin codemode opt-out writes tomidev.builtin-codemode-optout/v1 and still honours a gentle-pi state file", async (t) => {
	const home = scratch(t);
	const agentDir = scratch(t);
	const settingsPath = join(agentDir, "settings.json");
	writeFileSync(settingsPath, "{}\n");
	const ctx = (confirm: () => Promise<boolean>) => ({ hasUI: true, mode: "tui", ui: { confirm: async () => confirm(), notify() {} } });
	assert.equal(await offerBuiltinCodemodeOptOut(ctx(async () => false), { agentDir, configHome: home }), "declined");
	assert.equal(fieldOf(builtinCodemodeOptOutStatePath(home)), "tomidev.builtin-codemode-optout/v1");
	writeFileSync(builtinCodemodeOptOutStatePath(home), `${JSON.stringify({ schema: "gentle-pi.builtin-codemode-optout/v1", declined: [settingsPath] })}\n`);
	assert.equal(await offerBuiltinCodemodeOptOut(ctx(async () => { throw new Error("must not ask again"); }), { agentDir, configHome: home }), "declined-before");
});

test("agent profiles write tomidev.agent_model_profiles and still read gentle-pi.agent_model_profiles", (t) => {
	const path = join(scratch(t), "profiles.json");
	writeProfilesFileSync(path, { kind: PROFILES_KIND, version: PROFILES_VERSION, profiles: {} } as never);
	assert.equal(fieldOf(path, "kind"), "tomidev.agent_model_profiles");
	withLegacy(path, "gentle-pi.agent_model_profiles", "kind");
	assert.equal(readProfilesFileResult(path).status, "valid");
});

test("profile export writes tomidev.agent_model_profile and still parses gentle-pi.agent_model_profile", () => {
	const text = serializeProfileExport("work", { worker: { model: "anthropic/claude-opus" } } as never);
	assert.equal(JSON.parse(text).kind, "tomidev.agent_model_profile");
	assert.notEqual(parseProfileExportText(text.replace("tomidev.agent_model_profile", "gentle-pi.agent_model_profile")), undefined);
});

test("profile pins write tomidev.agent_model_profile_pin and still normalize a gentle-pi pin", () => {
	const pin = JSON.parse(serializeProfilePin("work"));
	assert.equal(pin.kind, "tomidev.agent_model_profile_pin");
	assert.equal(normalizeProfilePin({ ...pin, kind: "gentle-pi.agent_model_profile_pin" }), "work");
});

test("model fallbacks write tomidev.profile_model_fallbacks and still read gentle-pi.profile_model_fallbacks", (t) => {
	const path = join(scratch(t), "model-fallbacks.json");
	writeFallbacksFile(path, { kind: FALLBACKS_KIND, version: FALLBACKS_VERSION, profiles: {} } as never);
	assert.equal(fieldOf(path, "kind"), "tomidev.profile_model_fallbacks");
	withLegacy(path, "gentle-pi.profile_model_fallbacks", "kind");
	assert.equal(readFallbacksFile(path).status, "valid");
});

test("the session-profile customType is tomidev.session-profile/v1 and a legacy-customType JSONL still restores the profile", (t) => {
	assert.equal(SESSION_PROFILE_CUSTOM_TYPE, "tomidev.session-profile/v1");
	const binding = createSessionProfileBind("work", { worker: { model: "anthropic/claude-opus" } } as never);
	assert.equal(readSessionProfileEntry({ type: "custom", customType: SESSION_PROFILE_CUSTOM_TYPE, data: binding }).status, "bound");
	// A session file written before the rename: the legacy customType must still restore the bound profile.
	const dir = scratch(t);
	const sessionId = "legacy-session";
	const entry = { type: "custom", id: "profile-1", parentId: null, timestamp: "2026-11-08T10:00:00.000Z", customType: "gentle-pi.session-profile/v1", data: binding };
	const file = join(dir, "legacy.jsonl");
	writeFileSync(file, `${JSON.stringify({ type: "session", id: sessionId, version: 3, timestamp: "2026-11-08T09:59:00.000Z", cwd: dir })}\n${JSON.stringify(entry)}\n`);
	const restored = readSessionProfileDisk({ getSessionId: () => sessionId, getSessionFile: () => file, getBranch: () => [entry] });
	assert.equal(restored.status, "bound");
	assert.equal(restored.status === "bound" ? restored.binding.name : undefined, "work");
});

test("session-change writes tomidev.session-change/v1 and still reads gentle-pi.session-change/v1 evidence", () => {
	assert.equal(SESSION_CHANGE_ENTRY, "tomidev.session-change/v1");
	const evidence = { id: "a", root: "/repo", path: "file.ts", before: textSnapshot("old\n"), after: textSnapshot("new\n") };
	assert.equal(isSessionChangeEvidence(evidence), true);
	assert.deepEqual(sessionChangeRoots("s1", [{ type: "custom", customType: "gentle-pi.session-change/v1", data: { sessionId: "s1", evidence } }]), ["/repo"]);
});

test("session worktrees write tomidev.session-worktree/v1 and a gentle-pi.session-worktree/v1 entry still dedupes registration", (t) => {
	assert.equal(SESSION_WORKTREE_ENTRY, "tomidev.session-worktree/v1");
	const cwd = scratch(t);
	const appended: Array<[string, unknown]> = [];
	const host = { appendEntry: (type: string, data: unknown) => { appended.push([type, data]); }, events: { emit() {} } };
	const identity = { root: "/repo", commonDir: "/repo/.git" };
	const session = (entries: unknown[]) => ({ getSessionId: () => "s1", getEntries: () => entries as never });
	new SessionWorktreeRegistry(host as never, session([]), cwd, () => identity).register("/repo", "evidence");
	assert.equal(appended[0]?.[0], "tomidev.session-worktree/v1");
	const legacyEntry = { type: "custom", customType: "gentle-pi.session-worktree/v1", data: { sessionId: "s1", root: "/repo", evidence: "evidence" } };
	const before = appended.length;
	new SessionWorktreeRegistry(host as never, session([legacyEntry]), cwd, () => identity).register("/repo", "evidence");
	assert.equal(appended.length, before, "a legacy registration already recorded for this session is not appended again");
});

test("reply-language anchors write tomidev.reply-language and a gentle-pi.reply-language anchor still answers its wake", () => {
	assert.equal(REPLY_LANGUAGE_ANCHOR_TYPE, "tomidev.reply-language");
	const recorded = "hola, revisá el código por favor";
	const human = { role: "user", content: recorded };
	const automated = { role: "user", content: "[System-generated wake] continue" };
	const anchor = replyLanguageAnchorText(humanLanguageExcerpt(recorded) ?? "");
	const legacyAnchor = { role: "custom", customType: "gentle-pi.reply-language", content: anchor };
	assert.equal(replyLanguageAnchor([human, automated] as never, recorded), anchor, "without a recorded anchor the wake needs one");
	assert.equal(replyLanguageAnchor([human, automated, legacyAnchor] as never, recorded), undefined, "the legacy anchor already answers this wake");
});

test("agent status files write tomidev.agent-status/v1 with the tomidev label", (t) => {
	const home = scratch(t);
	const store = createAgentStatusStore(home, "session-1");
	assert.equal(store.write(agentStatus({ agent: "tomidev", session: "session-1", pid: process.pid, cwd: home, state: "idle", task: null } as never, 0)), true);
	assert.equal(fieldOf(store.path), "tomidev.agent-status/v1");
	assert.equal(fieldOf(store.path, "agent"), "tomidev");
});

test("model fallback entries are recorded as tomidev.model-fallback/v1", () => {
	assert.equal(MODEL_FALLBACK_ENTRY, "tomidev.model-fallback/v1");
});
