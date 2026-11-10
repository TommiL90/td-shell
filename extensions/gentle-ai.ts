import { brandCommand, brandId, isBrandId, ENV_AGENTS_CHILD, BRAND_DISPLAY_NAME } from "../lib/brand.ts";
import { emptyFallbacksFile, fallbacksFilePath, followProfileRename, readFallbacksFile, setChain, writeFallbacksFile, type FallbackStep } from "../lib/model-fallback-store.ts";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { PROFILE_TIER_EVENT, supportsOpenAIFast } from "../lib/openai-fast-tier.ts";
import { isDeepStrictEqual } from "node:util";
import { appendSystemPromptOnce } from "../lib/append-system-prompt.ts";
import { dataArgumentRanges, recognizeDestructiveCommands } from "../lib/destructive-command-guard.ts";
import { defaultTempScratchFs, isTempScratchRemoval, type TempScratchFs } from "../lib/yolo-temp-scratch.ts";
import { SHELL_COMMAND_TOOLS } from "../lib/background-jobs.ts";
import { evaluateDeliveredTestTool } from "../lib/delivered-test-lint.ts";
import { commitSliceToolResult } from "../lib/commit-slice-signal.ts";
import { appendContextBackstopNotice, createContextBackstopSignal, createThrottledContextMeasure } from "../lib/context-backstop.ts";
import { createExplorationBudget } from "../lib/exploration-budget.ts";
import { REPLY_LANGUAGE_ANCHOR_TYPE, isHumanInput, replyLanguageAnchorFor } from "../lib/reply-language-anchor.ts";
import { blockChildDestructiveCommand } from "./child-safety.ts";
import { DESTRUCTIVE_COMMAND_DENYLIST, GIT_GLOBAL_FLAGS_SRC, evaluateTomidevCommandEnforcement } from "../lib/command-enforcement.ts";
import { evaluateExecutionSurfaceTool } from "../lib/execution-surface-guard.ts";
import { isHomeOrBroadUserDirectory, rejectUnscopedBoundedWriterDispatch } from "../lib/bounded-writer-admission.ts";
import { VERIFIER_SETTLE_REMINDER_TYPE, createVerifierSettleReminders, finalAssistantText } from "../lib/verifier-settle-reminder.ts";
import { isOddPhase, oddPhaseRegistry, ODD_PHASES } from "../lib/odd-phase.ts";
import { shellEnabled } from "../lib/shell-bar.ts";
import { resolveSessionWorktree } from "../lib/session-worktree-registry.ts";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { isProxy } from "node:util/types";
import {
	accessSync,
	constants as fsConstants,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import {
	access,
	mkdir,
	readFile,
	readdir,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { PROVIDER_REVIEW_ROLES, discoverAgents, loadAgentsConfig, unmatchedProfileKeys } from "../lib/agents-config.ts";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionShutdownEvent,
	Theme,
	ThemeColor,
	ToolCallEventResult,
	ToolResultEvent,
	ToolResultEventResult,
} from "@earendil-works/pi-coding-agent";
import { Text, isKeyRelease, matchesKey, truncateToWidth, visibleWidth, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { resolveGentlePiAgentHome, gentlePiConfigHome } from "../lib/agent-home.ts";
import {
	BACKGROUND_SUBAGENTS_FILE,
	BACKGROUND_SUBAGENTS_SCHEMA,
	loadBackgroundSubagentsPolicy,
	parseBackgroundSubagentsPolicyFile,
	resolveBackgroundSubagentsPolicy,
	type BackgroundSubagentsPolicy,
	type BackgroundSubagentsResolution,
} from "../lib/background-subagents-policy.ts";
import { installPackageAssets, getPackageAssetOwner, hasPackageAssetOwnerInstallation, type PackageAssetOwner, isPackageManagedSddAsset, updatePackageManagedSddAgentOwnership } from "../lib/agent-assets.ts";
import {
	THINKING_LEVELS,
	normalizeModelConfig,
	isThinkingLevel,
	normalizeModelId,
	normalizeRoutingEntry,
	readSavedModelConfig as readModelRoutingAuthority,
	readSavedModelConfigAsync as readModelRoutingAuthorityAsync,
	readModelConfigFile,
	readModelConfigFileAsync,
	type AgentModelConfig,
	type AgentRoutingEntry,
	type ModelConfigFileResult,
	type ThinkingLevel,
} from "../lib/model-routing-authority.ts";
import {
	bootstrapProfilesFile,
	buildProfileListItems,
	createProfile,
	deleteProfile,
	duplicateProfile,
	formatOrchestratorSelection,
	formatRoutingRow,
	isProfileOrchestratorKey,
	parseProfileExportTextWithDrops,
	PROFILE_ORCHESTRATOR_KEY,
	profileExportPath,
	profileRoutingRows,
	unmatchedRoutingNotes,
	profilesFilePath,
	readProfileOrchestrator,
	readProfileWorkflow,
	readProfilesFileResult,
	renameProfile,
	routingColumnWidths,
	serializeProfileExport,
	setActiveProfile,
	setProfileOrchestratorMode,
	updateProfile,
	writeProfilesFileSync,
	DEFAULT_ORCHESTRATOR_MODE,
	type AgentProfilesFile,
	type OrchestratorMode,
	type ProfileListItem,
	type ProfileRoutingRow,
	type ProfilesFileReadResult,
	type ProfilesParseDrops,
} from "../lib/agent-profiles.ts";
import { resolveOrchestratorMode } from "../lib/orchestrator-mode-policy.ts";
import {
	clearProfilePinSync,
	evaluateProfilePin,
	readProfilePinStatus,
	REPO_PROFILE_DECLARATION_GITIGNORE_RULES,
	resolveProfilePin,
	writeProfilePinSync,
	type ProfilePinEvaluation,
	type ProfilePinSource,
	type ProfilePinStatus,
} from "../lib/agent-profile-pin.ts";
import { clearSessionProfileBinding, readSessionProfileBinding } from "../lib/session-profile-binding.ts";
import { createSessionProfileIntegration, hasPendingSessionProfileSelection, readCurrentSessionProfileOutcome, runCurrentSessionProfileSelection, waitCurrentSessionProfileSelection, type SessionProfileLifecycleManager } from "../lib/session-profile-integration.ts";
import { publishSessionProfileOutcome, readSessionProfileAuthority, requireSessionProfileAuthority } from "../lib/session-profile-authority.ts";
import { isSessionProfileFamilyEntry, type SessionProfileStartupState } from "../lib/session-profile-persistence.ts";
import type { SessionProfileAppendOutcome } from "../lib/session-profile-append-controller.ts";
import { freezeSessionProfileAtOwnStart, profileFollowEnabled, readSessionProfileOwnStartup, resolveSessionProfile, sessionProfileLabel, sessionProfileModelProfiles, sessionProfileRoutingAt, setFrozenDefaultOrchestrator } from "../lib/session-profile-freeze.ts";
import {
	applyOrchestratorSettings,
	readOrchestratorSettings,
	restoreOrchestratorSettings,
	type OrchestratorSettingsReadResult,
	parseOrchestratorModelRef,
} from "../lib/profiles-orchestrator.ts";
import { createNativeFullscreenInteraction } from "../lib/native-fullscreen-interaction.ts";
import { sanitizeTerminalText, stripAnsi } from "../lib/terminal-theme.ts";
import {
	spawnTelemetryTrigger,
	type TelemetryTriggerSpawn,
} from "../lib/telemetry-trigger.ts";
import {
	createNodeExecFileAdapter,
	type ExecFileAdapter,
	type ExecFileResult,
} from "../lib/process-tree.ts";
import { registerYoloSessionPolicy, updateYoloPrompt } from "../lib/yolo-session-policy.ts";
import type { resolveCanonicalGitRepositoryIdentity } from "../lib/session-identity.ts";
import { AutoPermissionRuntime, updateAutoPrompt, type AutoRuntimeClassifier } from "../lib/auto-permission-runtime.ts";
import { AutoPermissionClassifier } from "../lib/auto-permission-classifier.ts";
import { herdrSetupHint } from "../lib/herdr-activity.ts";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = join(PACKAGE_ROOT, "assets");

function gentlePiAgentHome(): string {
	return resolveGentlePiAgentHome();
}

function packageAssetAudit(owner: PackageAssetOwner): { stale: number; overrides: number } {
	let stale = 0;
	let overrides = 0;
	for (const [assetSubdir, installedSubdir, ownershipPrefix] of [
		["agents", "agents", "agents"],
		["chains", "chains", "chains"],
		["support", join("gentle-ai", "support"), "gentle-ai/support"],
	] as const) {
		const assetDir = join(ASSETS_DIR, assetSubdir);
		if (!existsSync(assetDir)) continue;
		for (const entry of readdirSync(assetDir, { withFileTypes: true })) {
			if (!entry.isFile() || getPackageAssetOwner(`${ownershipPrefix}/${entry.name}`) !== owner) continue;
			const installedPath = join(gentlePiAgentHome(), installedSubdir, entry.name);
			try {
				if (!existsSync(installedPath)) {
					stale += 1;
					continue;
				}
				if (
					!isPackageManagedSddAsset(
						installedPath,
						`${ownershipPrefix}/${entry.name}`,
					)
				) {
					overrides += 1;
					continue;
				}
				const packaged = readFileSync(join(assetDir, entry.name), "utf8");
				const installed = readFileSync(installedPath, "utf8");
				const comparablePackaged =
					assetSubdir === "agents"
						? updateFrontmatterRouting(packaged, undefined)
						: packaged;
				const comparableInstalled =
					assetSubdir === "agents"
						? updateFrontmatterRouting(installed, undefined)
						: installed;
				if (comparablePackaged !== comparableInstalled) {
					stale += 1;
				}
			} catch {
				stale += 1;
			}
		}
	}
	return { stale, overrides };
}

function packageAssetDiagnosticLines(cwd: string): string[] {
	return (["delegation", "review"] as const).flatMap((owner) => {
		const label = owner;
		const { stale, overrides } = packageAssetAudit(owner);
		const local = localAgentOverrideCount(cwd, owner);
		const lines = [`${stale > 0 ? "warn" : "pass"}: Global ${label} assets stale: ${stale} file(s)`];
		if (stale > 0) {
			lines[0] += ` — run /td:install-${owner} --force to refresh managed assets`;
		}
		if (overrides > 0) {
			lines.push(`info: Global ${label} user overrides: ${overrides} file(s); preserved, not package drift`);
		}
		if (local > 0) {
			lines.push(`warn: Active ${label} agent overrides: ${local} file(s) — active non-builtin ${label} agents shadow package assets; keep only intentional overrides`);
		}
		return lines;
	});
}

function localAgentOverrideCount(cwd: string, owner: PackageAssetOwner): number {
	const packageSddAgentsDir = join(ASSETS_DIR, "agents");
	const packageSddAgentNames = new Set(
		listAgentsFromDir(packageSddAgentsDir, "builtin")
			.filter((agent) =>
				getPackageAssetOwner(
					`agents/${relative(packageSddAgentsDir, agent.filePath).split(sep).join("/")}`,
				) === owner,
			)
			.map((agent) => agent.name),
	);
	let count = 0;
	for (const { dir, source, packageManaged } of discoverableNonBuiltinAgentRoots(cwd)) {
		if (packageManaged || !existsSync(dir)) continue;
		for (const agent of listAgentsFromDir(dir, source)) {
			if (packageSddAgentNames.has(agent.name)) count += 1;
		}
	}
	return count;
}

// ---------------------------------------------------------------------------
// Background subagents policy — project > global > env > default off
//
// The pure resolver (parseBackgroundSubagentsPolicyFile,
// resolveBackgroundSubagentsPolicy, loadBackgroundSubagentsPolicy, and their
// types/constants) lives in lib/background-subagents-policy.ts so the
// runtime side (extensions/gentle-agents.ts) can read the effective policy
// without importing the pi extension surface. Everything below this point
// (capability probing, report rendering, the global-file writer) stays here
// because it is specific to this extension's UI-facing surface.
// ---------------------------------------------------------------------------

type BackgroundSubagentsCapability = "ready" | "absent";

interface BackgroundSubagentsRendering {
	policy: BackgroundSubagentsPolicy;
	capability: BackgroundSubagentsCapability;
	singleShot?: boolean;
}

const DEFAULT_BACKGROUND_SUBAGENTS_RENDERING: BackgroundSubagentsRendering = {
	policy: "off",
	capability: "absent",
};

/** Write the global policy file, creating the config home when needed. */
function writeGlobalBackgroundSubagentsPolicy(
	policy: BackgroundSubagentsPolicy,
	configHome: string = gentleAiConfigHome(),
): string {
	const path = join(configHome, BACKGROUND_SUBAGENTS_FILE);
	mkdirSync(configHome, { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify({ schema: BACKGROUND_SUBAGENTS_SCHEMA, policy }, null, 2)}\n`,
	);
	return path;
}

function describeBackgroundSubagentsSource(
	resolution: BackgroundSubagentsResolution,
): string {
	switch (resolution.source) {
		case "project_file":
			return `project file ${resolution.projectFile}`;
		case "global_file":
			return `global file ${resolution.globalFile}`;
		case "environment":
			return "TOMIDEV_BACKGROUND_SUBAGENTS";
		default:
			return "built-in default";
	}
}

/**
 * Report the effective policy, the source that decided it, and the resolved
 * capability, plus whatever the user needs to know about the sources that did
 * NOT decide. `wrote` names a policy this invocation just wrote to the global
 * file; a write that a higher-priority file outranks must never be reported as
 * if it had taken effect.
 */
function renderBackgroundSubagentsReport(
	resolution: BackgroundSubagentsResolution,
	capability: BackgroundSubagentsCapability,
	wrote?: BackgroundSubagentsPolicy,
): { message: string; type: "info" | "warning" } {
	const lines = [
		`background subagents: ${resolution.policy} (decided by ${describeBackgroundSubagentsSource(resolution)}; capability: ${capability})`,
	];
	if (wrote !== undefined) {
		lines.push(`Wrote ${wrote} to the global file ${resolution.globalFile}.`);
	}
	if (resolution.malformed) {
		const path =
			resolution.source === "project_file" ? resolution.projectFile : resolution.globalFile;
		lines.push(
			`${path} is present but malformed, so the policy fails closed to off and no lower-priority source is consulted.`,
		);
	}
	const outranksTheWrite = wrote !== undefined && resolution.source === "project_file";
	if (outranksTheWrite) {
		lines.push(
			`That global write does not take effect here: the project file ${resolution.projectFile} outranks it. Edit or remove that project file to let the global setting decide.`,
		);
	} else if (
		wrote === undefined &&
		resolution.source === "project_file" &&
		resolution.globalFileExists
	) {
		lines.push(
			`The global file ${resolution.globalFile} exists but is outranked by that project file.`,
		);
	}
	if (resolution.envValue !== undefined && resolution.source !== "environment") {
		lines.push(
			resolution.envValue === "on" || resolution.envValue === "off"
				? `TOMIDEV_BACKGROUND_SUBAGENTS=${resolution.envValue} is set, but both files outrank it and it outranks the built-in default; it decides only when neither file exists.`
				: `TOMIDEV_BACKGROUND_SUBAGENTS="${resolution.envValue}" is not a recognized value ("on" or "off"), so it is ignored.`,
		);
	}
	lines.push(
		"Resolution order (first hit wins): project file, global file, TOMIDEV_BACKGROUND_SUBAGENTS, built-in default off.",
	);
	return {
		message: lines.join("\n"),
		type: resolution.malformed || outranksTheWrite ? "warning" : "info",
	};
}

const SUBAGENTS_PACKAGE_NAMES = ["pi-subagents-j0k3r", "pi-subagents"] as const;
const SUBAGENT_RUN_TOOL = "subagent_run";

/**
 * Roots where an installed subagents package may live. These are the same
 * roots builtinAgentDirs() walks, minus its `/agents` suffix.
 *
 * builtinAgentDirs() looks for markdown agent definitions, which the package
 * legitimately may not ship. Capability is a different question, so it must
 * not reuse that path: pi-subagents-j0k3r v1.5.2 ships index.ts, src/, skills/
 * and scripts/ and no agents/ directory at all, so an agents-dir probe reports
 * "absent" on every real install and leaves the background policy inert.
 */
function subagentsPackageRoots(cwd: string): string[] {
	return SUBAGENTS_PACKAGE_NAMES.flatMap((packageName) => [
		join(PACKAGE_ROOT, "..", packageName),
		join(cwd, ".pi", "npm", "node_modules", packageName),
		join(homedir(), ".local", "lib", "node_modules", packageName),
	]);
}

/** A package root counts as installed only when it carries its own manifest. */
function hasInstalledSubagentsPackage(cwd: string): boolean {
	return subagentsPackageRoots(cwd).some((root) =>
		existsSync(join(root, "package.json")),
	);
}

function hasSubagentRunTool(activeTools: readonly string[]): boolean {
	return activeTools.some(
		(name) => name === SUBAGENT_RUN_TOOL || name.endsWith(`.${SUBAGENT_RUN_TOOL}`),
	);
}

/**
 * Read the live pi tool registry, or undefined when it carries no signal.
 *
 * An absent handle, a non-array result, a throwing registry, and an empty list
 * are all "no signal" rather than "no subagents": reporting absent from an
 * uninformative registry would reproduce the very defect this probe fixes.
 */
function readActiveToolNames(pi: unknown): readonly string[] | undefined {
	try {
		const getActiveTools = (pi as { getActiveTools?: () => unknown })
			?.getActiveTools;
		if (typeof getActiveTools !== "function") return undefined;
		const tools = getActiveTools.call(pi);
		if (!Array.isArray(tools)) return undefined;
		const names = tools
			.map((tool) =>
				typeof tool === "string"
					? tool
					: isRecord(tool) && typeof tool.name === "string"
						? tool.name
						: "",
			)
			.filter((name) => name.length > 0);
		return names.length > 0 ? names : undefined;
	} catch {
		return undefined;
	}
}

/**
 * `subagent_run` availability probe.
 *
 * The live tool registry answers the question directly and wins whenever it
 * carries any signal. Without it -- prompt rendering outside a session, or a
 * runtime with no getActiveTools -- capability falls back to the presence of
 * an installed subagents package.
 */
function resolveBackgroundSubagentsCapability(
	cwd: string,
	activeTools?: readonly string[],
): BackgroundSubagentsCapability {
	try {
		if (activeTools !== undefined && activeTools.length > 0) {
			return hasSubagentRunTool(activeTools) ? "ready" : "absent";
		}
		return hasInstalledSubagentsPackage(cwd) ? "ready" : "absent";
	} catch {
		return "absent";
	}
}

function renderBackgroundSubagentsStatusLine(
	background: BackgroundSubagentsRendering,
): string {
	if (background.singleShot) return `Background subagent policy: off (single-shot mode)`;
	return `Background subagent policy: ${background.policy} (capability: ${background.capability})`;
}

// gentle-shell#1731 T27: `pi -p` and `pi --mode json` run one prompt and then
// dispose the runtime, so background results can never arrive. Mirrors
// isSingleShotMode in extensions/gentle-agents.ts, which rejects the launch.
function isSingleShotHostMode(mode: string | undefined): boolean {
	return mode === "print" || mode === "json";
}

// S2 (startup-home-repo-and-changes): a repository rooted at HOME, an ancestor
// of it or a broad user folder makes every Git call scan the user's whole
// tree. Warn once per process and repository, never per session restart.
const HOME_REPOSITORY_WARNING = `${BRAND_DISPLAY_NAME} is running inside a Git repository rooted at your home folder (or a broad user folder). Every Git operation scans that whole tree, which makes startup and reviews very slow. Open ${BRAND_DISPLAY_NAME} inside a project folder, or remove the stray .git if you did not create it on purpose.`;
const homeRepositoryWarnings = new Set<string>();

function homeRootedRepository(cwd: string): string | undefined {
	try {
		const home = realpathSync.native(homedir());
		const root = resolveSessionWorktree(cwd, cwd)?.root;
		return root !== undefined && isHomeOrBroadUserDirectory(root, { home }) ? root : undefined;
	} catch { return undefined; }
}

// full-delegation-mode S1/S3/S4: the always-on core carries exactly ONE workflow
// block, selected per active profile. The organic rules stay where they are in
// `assets/orchestrator.md` and a profile that did not opt in renders that asset
// byte for byte, so the mode cannot leak into a session nobody switched. In full
// delegation mode the single span below is REPLACED by the variant asset, never
// appended beside the organic text: two contradictory rule sets in one prompt are
// worse than either one alone, and the orchestrator would have to guess.
const DELEGATION_MODE_REGION_START = "You are a COORDINATOR, not the default executor for substantial work.";
// The region ends at the background-policy placeholder, so the status line and
// the lazy pointers that follow it stay in both modes.
const DELEGATION_MODE_REGION_END = "{{TOMIDEV_BACKGROUND_POLICY}}";
const FULL_DELEGATION_VARIANT_FILE = "orchestrator-full-delegation.md";

/**
 * Swap the organic workflow span for the supervisor-only variant.
 *
 * Fails safe in every degraded case — missing variant asset, empty variant, or an
 * anchor the asset no longer contains — by returning the organic text unchanged.
 * A half-spliced prompt mixes "implement inline" with "never implement", which is
 * exactly the ambiguity this mode exists to remove.
 */
function applyDelegationMode(assetsDir: string, text: string, mode: OrchestratorMode): string {
	if (mode === DEFAULT_ORCHESTRATOR_MODE) return text;
	const start = text.indexOf(DELEGATION_MODE_REGION_START);
	const end = text.indexOf(DELEGATION_MODE_REGION_END);
	if (start < 0 || end <= start) return text;
	let variant: string;
	try {
		variant = readFileSync(join(assetsDir, FULL_DELEGATION_VARIANT_FILE), "utf8").trim();
	} catch {
		return text;
	}
	if (variant.length === 0) return text;
	// The high-risk items keep one definition: the variant takes the organic paragraph
	// itself instead of a copy that could drift. Without it the variant would decide
	// risk with no list, so a missing paragraph falls back to the organic rules whole.
	const highRisk = text.split("\n").find((line) => line.startsWith(HIGH_RISK_PARAGRAPH_PREFIX));
	if (highRisk === undefined || !variant.includes(HIGH_RISK_PLACEHOLDER)) return text;
	const spliced = `${text.slice(0, start)}${variant.replace(HIGH_RISK_PLACEHOLDER, highRisk)}\n\n${text.slice(end)}`;
	// The shared tail points at the organic routing reference; in this mode those
	// pointers name the card instead, so the reference never reaches the session.
	return FULL_DELEGATION_TAIL_PROJECTION.reduce((projected, [from, to]) => projected.replace(from, to), spliced);
}

const HIGH_RISK_PARAGRAPH_PREFIX = "**High risk**:";
const HIGH_RISK_PLACEHOLDER = "{{TOMIDEV_HIGH_RISK_ITEMS}}";
const FULL_DELEGATION_CARD_FILE = "orchestrator-full-delegation-card.md";
const FULL_DELEGATION_TAIL_PROJECTION: ReadonlyArray<readonly [string, string]> = [
	["; rules: delegation background-subagents block.", `; rules: the background block in \`${FULL_DELEGATION_CARD_FILE}\`.`],
	[
		"Per-action table, Work Routing Ladder, Canonical Workflows: `orchestrator-delegation-reference.md`; blocking-prompt relays and provider defects: `orchestrator-prompts.md`.",
		"Blocking-prompt relays and provider defects: `orchestrator-prompts.md`.",
	],
];

// full-delegation-mode-conflicts S2: the mirrored ODD steps are a provider contract
// whose bytes are digest-verified on disk and stay untouched. What the session reads
// is already a projection of them (extractOddProtocolLines), and in full delegation
// mode that projection also replaces the parts that route work inline. Steps are
// addressed by their number, the shape extractOddProtocolLines already enforces;
// sentences inside a step by their exact text. A sentence the mirror no longer
// contains is left alone here and caught by tests/full-delegation-closure.test.ts.
const FULL_DELEGATION_STEP_REPLACEMENTS: ReadonlyArray<{ step: number; line: string }> = [
	{
		step: 4,
		line: "4. **Classify.** Size the task by the orchestrator's Task Size section: it decides tracking and risk, never who writes, and every authorized change goes to a writer.",
	},
];
const FULL_DELEGATION_SENTENCE_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
	["Do not delegate exploration of files you will read anyway to work inline; explore only", "Explore only"],
	[
		"Route each task through the orchestrator's Mechanisms, honoring its delegation triggers when their conditions truly hold, with applicable test-first development and checks. No trigger holds by default and, when in doubt, work inline; executing past a fired trigger inline is a routing defect even if the work succeeds.",
		"Route every task to a bounded writer through the orchestrator's Mechanisms, with applicable test-first development and checks.",
	],
	["Detail for steps 3–7: `orchestrator-delegation.md` and", `Detail for steps 3–7: \`${FULL_DELEGATION_CARD_FILE}\` and`],
];

function projectOddStepsForMode(steps: string, mode: OrchestratorMode): string {
	if (mode === DEFAULT_ORCHESTRATOR_MODE) return steps;
	const lines = steps.split("\n").map((line) => {
		const replacement = FULL_DELEGATION_STEP_REPLACEMENTS.find(({ step }) => line.startsWith(`${step}. **`));
		return replacement === undefined ? line : replacement.line;
	});
	return FULL_DELEGATION_SENTENCE_REPLACEMENTS.reduce((projected, [from, to]) => projected.replace(from, to), lines.join("\n"));
}

// Rendered prompts are memoized per background policy/capability/mode key for
// the process lifetime; the assets bytes themselves are read once per key.
const orchestratorPromptCache = new Map<string, string>();
function getOrchestratorPrompt(
	cwd: string = process.cwd(),
	activeTools?: readonly string[],
	hostMode?: string,
	delegationMode: OrchestratorMode = DEFAULT_ORCHESTRATOR_MODE,
): string {
	const background: BackgroundSubagentsRendering = {
		policy: loadBackgroundSubagentsPolicy(cwd),
		capability: resolveBackgroundSubagentsCapability(cwd, activeTools),
		singleShot: isSingleShotHostMode(hostMode),
	};
	const cacheKey = `${background.policy}:${background.capability}:${background.singleShot}:${delegationMode}`;
	let prompt = orchestratorPromptCache.get(cacheKey);
	if (prompt === undefined) {
		prompt = renderOrchestratorPrompt(ASSETS_DIR, background, delegationMode);
		orchestratorPromptCache.set(cacheKey, prompt);
	}
	return prompt;
}

function renderOrchestratorPrompt(
	assetsDir: string,
	background: BackgroundSubagentsRendering = DEFAULT_BACKGROUND_SUBAGENTS_RENDERING,
	delegationMode: OrchestratorMode = DEFAULT_ORCHESTRATOR_MODE,
): string {
	const backgroundPolicyBlock = `${renderBackgroundSubagentsStatusLine(background)}`;
	return applyDelegationMode(assetsDir, readFileSync(join(assetsDir, "orchestrator.md"), "utf8"), delegationMode)
		.replaceAll("{{TOMIDEV_ASSETS_ROOT}}", assetsDir)
		.replaceAll(
			"{{TOMIDEV_BACKGROUND_POLICY}}",
			backgroundPolicyBlock,
		)
		.trim();
}

const ODD_PROTOCOL_STEPS = `1. **Authorize.** Investigation, explanation, review, comparison, and proposal-only requests stay read-only: no writer, apply, or implementation artifacts. Ambiguous or conditional change intent (unclear whether a change is authorized at all) gets one clarification; stop and wait. A user saying they may stop you or resume later asks for notes, not automatic commits or a stop.
2. **Explore.** Explore existing code and requirements first, proportionately to the request, before proposing or writing anything. Do not delegate exploration of files you will read anyway to work inline; explore only for a map you need to decide or route.
3. **Resolve uncertainty.** Recommend optional research only for a named uncertainty; ask one focused user question only for a real unresolved product decision, then stop and wait; use at most one scoped read-only assumption challenge for a high-consequence unproven premise.
4. **Classify.** Size the task by the orchestrator's Task Size section; its criteria and resume test alone decide small or large, and small work follows its small path. Route by risk into three lanes: Direct (low risk, inline), Checks-only (medium risk, \`checks.md\` with C# items), and Full Lean (high/sensitive risk, Plan → Checks → Build → Verify in \`.agents/designs/features/<feature>/\`).
5. **Track before the first write.** Reuse the project's tracking authority and formats. Only where undefined, for Checks-only and Full Lean lanes, track work in \`.agents/designs/features/<feature-name>/\` (plan.md, checks.md with C# items, state.json, proofs.md, mutations.md, verification.md, handoff.md), create or rebuild the visible \`todo\` list from the reconciled feature tasks, and mirror state to Engram key \`features/<feature-name>/state\`, without asking permission for tasks or storage. Tell the user in one line which feature directory was created and how many tasks it holds. Artifacts preserve verbatim user requirements: \`## Specs\` with numbered \`S#\` that quote the user's exact strings, error messages, and examples verbatim, never summarized; \`## Tasks\` with one line per task; \`## Log\` where \`L1\` is the user's original request verbatim; a requirement change appends its Log entry, rewrites only the affected \`S#\`, and reopens only its task. In Full Lean, blind judges (judge-a/b) evaluate plan.md and checks.md before execution. Consensus loop: discuss with judges/reviewers up to 3 rounds; if no consensus is reached after 3 rounds, ask the user; the orchestrator makes adjustments to plan/checks before delegating execution to the worker. Never use the consensus loop in Direct lane.
6. **Implement task by task.** Hand off by reference, never by paraphrase: name the existing project artifact, assigned scope, and acceptance criteria using its own identifiers and format. The fallback feature contract uses the feature directory, task, checks, and \`S#\`; for that fallback, tell workers to read until \`## Log\` before edits. Without a feature document, include the user's request verbatim. Verify reads the whole document, runs the spec's examples the parent authorized, against isolated state when they mutate data, and returns a verdict per \`S#\`. When the user reports a failure, reproduce it before deciding it already works. Each test asserts every observable effect of the rule it covers (exit code, exact stdout and stderr, and that rejected input leaves stored data and counters unchanged), covers the cases the rule itself names (its examples, boundaries, and errors), and checks through the public interface, never internal storage. When you add or change a command, option, or message, update the help text and docs that describe it. Route each task through the orchestrator's Mechanisms, honoring its delegation triggers when their conditions truly hold, with applicable test-first development and checks. No trigger holds by default and, when in doubt, work inline; executing past a fired trigger inline is a routing defect even if the work succeeds. Check an item off only after its outcome and checks were observed; update the project's existing tracking after every task transition (state.json and Engram only when that tracking is selected). Never stage, commit, or push unless explicitly requested by the user in the current turn. When commit is explicitly requested, run \`.agents/scripts/private_harness_guard.py --root .\` before committing if the script is present.
7. **Close.** Report the verified outcome, every failed, skipped, or pending check, and the next step. Close with \`Risk: item N (reason)\` or \`Risk: none\` plus failed/skipped/pending checks. Before writing \`Risk: none\`, check whether your diff changes code that existing behavior the request did not mention also uses (shared options, parsers, helpers); if it does, that is item 3. Never end with a tracked task pending unless you quote the user's explicit stop. An applicable quick check runs once; an unavailable verifier or subagent is reported as unavailable, never retried or escalated into extra ceremony. Partial, blocked, unavailable, or exhausted proof becomes one **Needs your decision** result naming the open blockers or missing proof, never more verification; that result is a valid stop, hedged wording is not. Full Lean closure requires independent verification (verifier reporting PASS on all checks.md C# items), else mark INCOMPLETE. Code review is performed via requesting-code-review only on explicit request or final checkpoint.
Phase reporting: the Tomidev Shell prompt label is inferred automatically from the primary session's tool activity (reads show \`exploring\`, edits \`implementing\`, test runs \`checking\`, user questions \`deciding\`). When the \`gentle_odd_phase\` tool is available, use it to refine that label with phases tools cannot show (\`authorizing\`, \`researching\`, \`deciding\`, \`closing\`): call \`gentle_odd_phase\` only when the primary session's ODD phase actually changes, never per tool call or on a fixed cadence, and never from a subagent. It drives the Tomidev Shell prompt label only.
Resume an interrupted feature from the project's authoritative tracking; reconcile before continuing the next unfinished task. Where the builtin memory fallback is used and tools are available, use \`mem_context\`, project- and feature-scoped \`mem_search\` (\`features/<feature>/state\`), and \`.agents/designs/features/<feature>/state.json\`. Detail for steps 3–7: \`orchestrator-delegation.md\` and \`orchestrator-memory.md\`.`;

function oddProtocolSteps(): string {
	return ODD_PROTOCOL_STEPS;
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}


const PERSONA_OPTIONS = ["senior-architect"] as const;

const SENIOR_ARCHITECT_PERSONA_PROMPT = `Persona:
- Act as a senior architect: direct, concise, technical, and professional.
- Concepts before code, no shortcuts. Push back when the user asks for code without enough context or understanding.
- Treat AI as a tool directed by the human; never present yourself as a default chatbot.
- Always respond in the same language the user writes in (match the user's latest message).
- When the user writes in Spanish, answer in professional, technical Spanish.
- Correct errors directly, explain why, and show the better path.`;

const GENTLEMAN_PERSONA_PROMPT = SENIOR_ARCHITECT_PERSONA_PROMPT;
const NEUTRAL_PERSONA_PROMPT = SENIOR_ARCHITECT_PERSONA_PROMPT;

/**
 * The workflow mode this primary session runs under (full-delegation-mode S2).
 * Read through the live session profile on every prompt build, never from the
 * startup freeze, so a profile switch is visible on the very next turn. Any
 * failure here degrades to the organic rules instead of breaking the prompt.
 */
function resolveSessionDelegationMode(
	ctx: Pick<ExtensionContext, "cwd"> & { sessionManager?: { getSessionId?: () => string | undefined } },
	env?: NodeJS.ProcessEnv,
): OrchestratorMode {
	try {
		return resolveOrchestratorMode({
			cwd: ctx.cwd,
			configHome: gentleAiConfigHome(),
			sessionId: ctx.sessionManager?.getSessionId?.(),
			...(env === undefined ? {} : { env }),
		}).mode;
	} catch {
		return DEFAULT_ORCHESTRATOR_MODE;
	}
}

// The senior-architect persona is fixed; legacy persona files are ignored.
function buildGentlePrompt(
	cwd: string = process.cwd(),
	activeTools?: readonly string[],
	hostMode?: string,
	delegationMode: OrchestratorMode = DEFAULT_ORCHESTRATOR_MODE,
): string {
	return `## Tomidev Shell Identity and Harness

You are Tomidev Shell: a Pi-specific coding-agent harness for controlled development work.

Identity contract:
- When the user asks who or what you are, answer as Tomidev Shell, not as a generic assistant, and never introduce yourself as only "your assistant" or "the default assistant". Convey this meaning, translated into the user's language: "I am Tomidev Shell: a Pi-specific coding-agent harness for controlled development, with a senior architect persona. I compose my builtin development mechanisms with the project's harness as orchestrator: I coordinate subagents, track substantial work using project conventions, run commands, and edit files. Where undefined, I use Organic Driven Development with Direct, Checks-only, or Full Lean defaults. I am not a generic chatbot."
- Follow the senior architect persona: direct, concise, technical, and professional.
- Describe Organic Driven Development and its three lanes (Direct, Checks-only, Full Lean) as builtin defaults; the project's workflow takes precedence. Subagents remain a core capability.
- Mention memory only when memory packages or callable memory tools are actually active; never invent persistent memory.
- Do not claim portability outside the Pi runtime.

${SENIOR_ARCHITECT_PERSONA_PROMPT}

Language: professional, technical Spanish when the user writes Spanish.

## Authorized work continuity

Continue authorized in-scope implementation, documentation, and verification steps without asking the human to approve each transition. Never end a turn by announcing a next step you can execute; execute it. A progress update is not a request for permission. Resume background work on its completion event; do not ask the human to say "continue". Treat short replies such as "yes" or "go ahead" as acceptance of the immediately preceding concrete proposal and execute it within its agreed scope.

Stop only for an unresolved consequential scope or product decision, required consent, a denied action, missing required proof (it blocks completion and delivery), or the human's explicit stop. Honor explicit one-run or no-retry limits. Report the concrete blocker and the exact decision needed, not a generic "continue".

Do not infer permission for publishing (push, pull request, release), commits, destructive actions, or unrelated scope from a continuation or a short reply; each needs an explicit request in the current turn.

## Project harness composition

Read the project's existing instructions first. Project owns workflow and lane names, plan/check formats and paths, tracking, acceptance criteria, and delivery. Builtin mechanisms complement that harness; they are not disabled wholesale and do not run as a parallel process. Do not create duplicate artifacts, parallel tracking, or a competing lane or delivery policy. Respect explicit incompatible project rules; clarify only unresolved conflicts. Runtime safety, confinement, Allowed edit surfaces, and human confirmation for git actions remain binding. No new adapter or configuration file.

For substantial planned work, builtin judges review the same project plan before execution, even when the project does not define plan judges. The orchestrator incorporates accepted findings into that artifact before delegating implementation, rejects findings with evidence, and seeks both judges' confirmation of no open severe findings. After at most 3 rounds without consensus, stop and ask the user. Apply proportionately: trivial/direct work needs no new plan or judge loop. Follow compatible project review procedures; do not bypass explicit prohibitions.

Default workflow: Organic Driven Development (fallback)
Use these useful defaults only for aspects the project leaves undefined; preserve project terminology, artifacts, tracking and gates when defined. These steps describe the fallback, not a mandatory second workflow:
${projectOddStepsForMode(oddProtocolSteps(), delegationMode)}

Harness principles:
- Tomidev Shell is not prompt engineering. It is runtime discipline around powerful agents.
- Clarify scope, constraints, acceptance criteria, and non-goals when needed for the human to understand the action or to resolve consequential uncertainty. Reuse what is already established; after informed approval, proceed without repeating the clarification unless new consequential uncertainty appears.
- Use subagents when available for exploration, planning, implementation, and review, while keeping one parent session responsible for orchestration.
- For behavior changes with applicable runnable deterministic tests and a clear expected outcome, use test-first by default: observe RED, GREEN, then refactor with focused checks. Write one RED test per requested rule. For every existing command or option the change touches, add one test proving its previous behavior still holds; add no other cases. An existing behavior counts as touched when it shares the code you changed (options, parsers, helpers, validation). Only when your diff changes shared code (options, parsers, helpers) that an existing command the request did not name also uses, run one differential check before finishing, as a single script: for each such command, run it with the new or changed input (for example a new option passed to a sibling subcommand) against the previous code (a copy of the base commit in a \`mktemp -d\` scratch directory, never committed as a test; committed tests never read git history or a fixed commit) and against your change, and compare stdout, stderr, and exit code; any difference nobody asked for is a regression to fix and pin with a test. Test presence alone does not establish applicability; no chat or TUI toggle activates it. For passive documentation, non-testable changes, an unavailable runner, or no meaningful RED, explain why and run proportionate ordinary functional or structural verification. Never invent lifecycle evidence or skip checks. Follow ${delegationMode === DEFAULT_ORCHESTRATOR_MODE ? "orchestrator-delegation.md" : FULL_DELEGATION_CARD_FILE} for ODD forwarding and evidence.
- Protect the human reviewer: avoid oversized changes, surface review workload risk, and ask before turning one task into a large multi-area change.
- Never claim persistent memory is available because of this package. Memory is provided by separate packages or MCP tools when installed and callable.

${getOrchestratorPrompt(cwd, activeTools, hostMode, delegationMode)}`;
}

// Matches `git [global-flags] push` — tolerates flags like -C /repo or --work-tree=/tmp
// between `git` and the subcommand. Short flags may be followed by a separate value token.
// gentle-shell#2172: `\s+` rather than a literal space, so a tab-separated
// `git\tpush` is guarded like any other spelling.
const GIT_PUSH_RE = new RegExp(String.raw`\bgit${GIT_GLOBAL_FLAGS_SRC}(push)\b`);

// ---------------------------------------------------------------------------
// Autonomous guard — runtime guardrails config
// ---------------------------------------------------------------------------

const GUARD_ACTION = {
	ALLOW: "allow",
	CONFIRM: "confirm",
	BLOCK: "block",
} as const;

type GuardAction = (typeof GUARD_ACTION)[keyof typeof GUARD_ACTION];
type GuardClassification = GuardAction | "not-guarded";

interface GuardMatch {
	key: GuardedCommandKey;
	action: GuardAction;
	triggerIndex: number;
}

interface GuardEvaluation {
	action: GuardClassification;
	dataLoss?: boolean;
	key?: GuardedCommandKey;
	triggerIndex: number;
	matches: GuardMatch[];
}

const GUARDED_COMMAND_KEY = {
	GIT_PUSH: "gitPush",
	GIT_REBASE: "gitRebase",
	GIT_BRANCH_DELETE_FORCE: "gitBranchDeleteForce",
	NPM_PUBLISH: "npmPublish",
	PI_REMOVE: "piRemove",
} as const;

type GuardedCommandKey = (typeof GUARDED_COMMAND_KEY)[keyof typeof GUARDED_COMMAND_KEY];

type GuardedCommandsConfig = Partial<Record<GuardedCommandKey, GuardAction>>;

interface RuntimeGuardrailsConfig {
	autonomousMode: boolean;
	guardedCommands: GuardedCommandsConfig;
}

interface LoadGuardrailsOptions {
	/** Override the config home directory (used in tests to avoid touching ~/.pi). */
	gentlePiConfigHome?: string;
}

const GUARDED_KEY_PATTERNS: Record<GuardedCommandKey, RegExp> = {
	gitPush: GIT_PUSH_RE,
	gitRebase: new RegExp(String.raw`\bgit${GIT_GLOBAL_FLAGS_SRC}(rebase)\b`),
	gitBranchDeleteForce: /\bgit\s+(branch)\s+(?:-[a-zA-Z]*D[a-zA-Z]*|-[a-zA-Z]*d[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*d[a-zA-Z]*|--delete\b[^\r\n;&|]*--force\b|--force\b[^\r\n;&|]*--delete\b)/,
	npmPublish: /\bnpm\s+(publish)\b/,
	piRemove: /\bpi\s+(remove)\b/,
};

const AUTONOMOUS_DEFAULT_ACTIONS: Record<GuardedCommandKey, GuardAction> = {
	gitPush: "allow",
	gitRebase: "confirm",
	gitBranchDeleteForce: "confirm",
	npmPublish: "block",
	piRemove: "confirm",
};

const GUARDED_COMMAND_LABELS: Record<GuardedCommandKey, string> = {
	gitPush: "git push",
	gitRebase: "git rebase",
	gitBranchDeleteForce: "forced git branch deletion",
	npmPublish: "npm publish",
	piRemove: "pi remove",
};

const SAFE_GUARDRAILS_CONFIG: RuntimeGuardrailsConfig = {
	autonomousMode: false,
	guardedCommands: {},
};

/**
 * Classify a shell command under the runtime guard policy.
 *
 * Ordering (non-negotiable):
 *   1. Hard-deny patterns → "block" (always, cannot be overridden by config)
 *   2. If autonomousMode is false → mirror the legacy CONFIRM_BASH_PATTERNS
 *      result, except an explicit "allow" in guardedCommands (written by the
 *      permission-allowlist "Always allow" choice) grants the command
 *   3. If autonomousMode is true → use configured GuardAction for the matched key
 *      (applying AUTONOMOUS_DEFAULT_ACTIONS for any key not set in guardedCommands)
 *   4. No match → "not-guarded"
 */
function collectGuardedMatches(
	command: string,
	config: RuntimeGuardrailsConfig,
): GuardMatch[] {
	const matches: GuardMatch[] = [];
	const dataRanges = dataArgumentRanges(command);
	for (const [key, pattern] of Object.entries(GUARDED_KEY_PATTERNS) as [
		GuardedCommandKey,
		RegExp,
	][]) {
		const globalPattern = new RegExp(pattern.source, `${pattern.flags}g`);
		for (const match of command.matchAll(globalPattern)) {
			// gentle-shell#2174: text inside a data command's argument is not an operation.
			if (inDataArgument(dataRanges, match.index)) continue;
			const action = config.autonomousMode
				? (config.guardedCommands[key] ?? AUTONOMOUS_DEFAULT_ACTIONS[key])
				: config.guardedCommands[key] === GUARD_ACTION.ALLOW
					? GUARD_ACTION.ALLOW
					: GUARD_ACTION.CONFIRM;
			matches.push({
				key,
				action,
				triggerIndex: match.index + match[0].lastIndexOf(match[1]),
			});
		}
	}
	return matches.sort((left, right) => left.triggerIndex - right.triggerIndex);
}

function inDataArgument(ranges: ReadonlyArray<readonly [number, number]>, index: number): boolean {
	return ranges.some(([start, end]) => index >= start && index < end);
}

function evaluateGuardedCommand(
	command: string,
	config: RuntimeGuardrailsConfig,
): GuardEvaluation {
	const matches = collectGuardedMatches(command, config);
	const destructive = recognizeDestructiveCommands(command);
	const hardDeny = destructive.find((match) => match.hardDeny);
	if (hardDeny) return { action: "block", triggerIndex: hardDeny.triggerIndex, matches };

	// Hard denies override every configured action across the complete command.
	const dataRanges = dataArgumentRanges(command);
	for (const pattern of DESTRUCTIVE_COMMAND_DENYLIST) {
		const denied = [...command.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))]
			.find((candidate) => !inDataArgument(dataRanges, candidate.index));
		if (!denied) continue;
		const matchedAction = matches.find((match) =>
			match.triggerIndex >= denied.index && match.triggerIndex < denied.index + denied[0].length,
		);
		return {
			action: "block",
			key: matchedAction?.key,
			triggerIndex: matchedAction?.triggerIndex ?? denied.index,
			matches,
		};
	}

	// Explicit configured blocks outrank recognized data-loss confirmation.
	const configuredBlock = matches.find((match) => match.action === "block");
	if (configuredBlock) return { ...configuredBlock, matches };
	const dataLoss = destructive.find((match) => match.kind !== "git");
	if (dataLoss) return { action: "confirm", dataLoss: true, triggerIndex: dataLoss.triggerIndex, matches };

	// Confirmation, then allow win across remaining matches.
	const selected = matches.find((match) => match.action === "block")
		?? matches.find((match) => match.action === "confirm")
		?? matches.find((match) => match.action === "allow");
	if (selected) return { ...selected, matches };
	return { action: "not-guarded", triggerIndex: 0, matches };
}

function classifyGuardedCommand(
	command: string,
	config: RuntimeGuardrailsConfig,
): GuardClassification {
	return evaluateGuardedCommand(command, config).action;
}

function guardedCommandPreview(command: string, triggerIndex: number): string {
	const start = Math.max(0, triggerIndex - 60);
	const prefix = start > 0 ? "…" : "";
	return `${prefix}${truncateToWidth(command.slice(start).replace(/\s+/g, " ").trim(), 180 - prefix.length, "…")}`;
}

/** Confirmation headline for all guarded actions; generic when no key matched. */
function guardedCommandTitle(
	key?: GuardedCommandKey,
	matches: readonly GuardMatch[] = [],
): string {
	if (matches.length > 1) {
		return `Allow guarded actions: ${matches.map((match) => GUARDED_COMMAND_LABELS[match.key]).join("; ")}?`;
	}
	return key === undefined
		? "Allow guarded command?"
		: `Allow guarded ${GUARDED_COMMAND_LABELS[key]}?`;
}

function parseGuardrailsConfigFile(
	raw: string,
): RuntimeGuardrailsConfig | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) return undefined;

	const autonomousMode = parsed.autonomousMode === true;

	const rawCommands = isRecord(parsed.guardedCommands) ? parsed.guardedCommands : {};
	const guardedCommands: GuardedCommandsConfig = {};
	const validActions = new Set<string>(["allow", "confirm", "block"]);
	for (const [key, value] of Object.entries(rawCommands)) {
		if (
			typeof value === "string" &&
			validActions.has(value) &&
			Object.values(GUARDED_COMMAND_KEY).includes(key as GuardedCommandKey)
		) {
			guardedCommands[key as GuardedCommandKey] = value as GuardAction;
		}
	}

	return { autonomousMode, guardedCommands };
}

/**
 * Load the runtime guardrails config.
 *
 * Resolution order (project overrides global):
 *   1. Check TOMIDEV_AUTONOMOUS_MODE env var — if "1", forces autonomousMode=true
 *      and uses default guarded command actions.
 *   2. Read global config from ${gentlePiConfigHome}/runtime-guardrails.json
 *   3. Read project config from ${cwd}/.pi/gentle-ai/runtime-guardrails.json
 *      (project values are merged on top of global)
 *   4. Any parse/read error anywhere → fail safe (return SAFE_GUARDRAILS_CONFIG)
 */
function loadRuntimeGuardrailsConfig(
	cwd: string,
	options: LoadGuardrailsOptions = {},
): RuntimeGuardrailsConfig {
	try {
		// Env var override: forces autonomous mode with default actions
		if (process.env.TOMIDEV_AUTONOMOUS_MODE === "1") {
			return { autonomousMode: true, guardedCommands: {} };
		}

		const configHome = options.gentlePiConfigHome ?? gentleAiConfigHome();
		const globalConfigPath = join(configHome, "runtime-guardrails.json");
		const projectConfigPath = join(cwd, ".pi", "gentle-ai", "runtime-guardrails.json");

		let merged: RuntimeGuardrailsConfig = { autonomousMode: false, guardedCommands: {} };

		if (existsSync(globalConfigPath)) {
			const globalParsed = parseGuardrailsConfigFile(
				readFileSync(globalConfigPath, "utf8"),
			);
			if (!globalParsed) return SAFE_GUARDRAILS_CONFIG;
			merged = globalParsed;
		}

		if (existsSync(projectConfigPath)) {
			const projectParsed = parseGuardrailsConfigFile(
				readFileSync(projectConfigPath, "utf8"),
			);
			if (!projectParsed) return SAFE_GUARDRAILS_CONFIG;
			// Project values fully override global values
			merged = {
				autonomousMode: projectParsed.autonomousMode,
				guardedCommands: {
					...merged.guardedCommands,
					...projectParsed.guardedCommands,
				},
			};
		}

		return merged;
	} catch {
		return SAFE_GUARDRAILS_CONFIG;
	}
}

/**
 * Ordered policy seam for the model-initiated `bash` tool_call path
 * (gentle-pi#405 work unit S1).
 *
 * `evaluateBashPolicies` runs these policies in list order and the first
 * verdict (a non-undefined ToolCallEventResult) wins: a policy returning
 * `undefined` allows the command to pass to the next policy, and an overall
 * `undefined` means no policy objected. Future policies (package-manager,
 * SQL) append entries here so evaluation order stays explicit and greppable
 * through the stable `name` strings.
 */
interface BashCommandPolicy {
	/** Stable, greppable identifier; tests pin the ordered list by name. */
	name: string;
	evaluate: (
		command: string,
		ctx: ExtensionContext,
		events: ExtensionAPI["events"],
		herdrLifecycle: HerdrConfirmationLifecycle,
		yoloActive: boolean,
		autoGate?: () => Promise<ToolCallEventResult | undefined>,
		superYoloActive?: boolean,
		gitConfirmed?: boolean,
	) => Promise<ToolCallEventResult | undefined>;
}

const BASH_COMMAND_POLICIES: readonly BashCommandPolicy[] = [
	{
		name: "runtime-guardrails",
		// Thin adapter preserving confirmCommand's async signature; the guard
		// logic itself stays byte-identical inside confirmCommand.
		evaluate: async (command, ctx, events, herdrLifecycle, yoloActive, autoGate, superYoloActive, gitConfirmed) =>
			confirmCommand(command, ctx, events, herdrLifecycle, yoloActive, autoGate, superYoloActive, gitConfirmed),
	},
];

// Tools whose `path` input names the file or directory they reach. The guard
// sees only that input: a search scoped to a directory (grep over ".", with or
// without a glob) still reads whatever the directory contains. Shell tools take
// no `path` at all, so they are guarded from their command instead (see
// findSensitiveCommandPath below, gentle-shell#2349). Keeping the secret bytes
// out of a decoded or variable-built read is a separate design.
const PATH_GUARDED_TOOL_NAMES = new Set(["read", "write", "edit", "grep", "find", "ls"]);
const PATH_INPUT_KEYS = new Set([
	"path",
	"paths",
	"file",
	"files",
	"filePath",
	"filePaths",
]);
const SENSITIVE_PATH_PATTERNS: RegExp[] = [
	/(^|\/)\.ssh(?:\/|$)/,
	/(^|\/)\.credentials(?:\/|$)/,
	/(^|\/)library\/keychains(?:\/|$)/,
	/(^|\/)\.aws\/credentials$/,
	/(^|\/)\.config\/gh\/hosts\.ya?ml$/,
	/(^|\/)secrets(?:\/|$)/,
	/(^|\/)\.env(?:$|[./_-])/,
	/(^|\/)\.(?:envrc|netrc)(?:$|\/)/,
	/\.(?:pem|key|p12|pfx)$/,
];

const JUDGMENT_DAY_AGENT_NAMES = [
	"jd-judge-a",
	"jd-judge-b",
] as const;

const CORE_MODEL_AGENT_NAMES = JUDGMENT_DAY_AGENT_NAMES;
const CORE_MODEL_AGENT_NAME_SET = new Set<string>(CORE_MODEL_AGENT_NAMES);

type AgentSource = "project" | "user" | "builtin";

interface AgentEntry {
	name: string;
	source: AgentSource;
	filePath?: string;
}

const KEEP_CURRENT = "Keep current";
const INHERIT_MODEL = "Inherit active/default model";
const CUSTOM_MODEL = "Custom model id";
const INHERIT_THINKING = "Inherit effort";

const MODEL_CONTROL_OPTIONS = [
	KEEP_CURRENT,
	INHERIT_MODEL,
	CUSTOM_MODEL,
] as const;

function readStringPath(value: unknown, path: string[]): string | undefined {
	let current = value;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return typeof current === "string" ? current : undefined;
}

function readAgentStartNames(event: unknown): string[] {
	return [
		readStringPath(event, ["agentName"]),
		readStringPath(event, ["agent"]),
		readStringPath(event, ["name"]),
		readStringPath(event, ["agent", "name"]),
		readStringPath(event, ["subagent", "name"]),
	]
		.filter((value): value is string => value !== undefined)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

function isNamedAgentStartEvent(event: unknown): boolean {
	return readAgentStartNames(event).length > 0;
}

function normalizePolicyPath(value: string): string {
	return value.trim().replace(/^~(?=[/\\]|$)/, homedir()).replace(/\\/g, "/").toLowerCase();
}

function isSensitivePath(value: string): boolean {
	const normalized = normalizePolicyPath(value);
	return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isSensitiveRequestContextPath(path: string): boolean {
	if (isSensitivePath(path)) return true;
	try { return isSensitivePath(realpathSync(path)); }
	catch { return true; /* An unresolved alias cannot be checked safely. */ }
}

function collectPathInputs(value: unknown, key?: string): string[] {
	if (typeof value === "string") return key && PATH_INPUT_KEYS.has(key) ? [value] : [];
	if (Array.isArray(value)) return value.flatMap((item) => collectPathInputs(item, key));
	if (!isRecord(value)) return [];
	return Object.entries(value).flatMap(([entryKey, entryValue]) =>
		collectPathInputs(entryValue, entryKey),
	);
}

function hasWritableEngramTool(pi: ExtensionAPI): boolean {
	try {
		const getActiveTools = (pi as unknown as { getActiveTools?: () => unknown[] })
			.getActiveTools;
		if (typeof getActiveTools !== "function") return false;
		const tools = getActiveTools.call(pi);
		return tools.some((tool) => {
			const name =
				typeof tool === "string"
					? tool
					: isRecord(tool) && typeof tool.name === "string"
						? tool.name
						: "";
			return name === "mem_save" || name.endsWith(".mem_save");
		});
	} catch {
		return false;
	}
}

// gentle-shell#2349 (scope 1): bash, bash_background and monitor carry no
// `path` input, so the deny list never saw `cat .env` while `read .env` was
// blocked. A command is a shell string, not a path, so the patterns run over
// its words instead: quotes and backslash escapes are removed and shell control
// operators split words. The pattern's own path boundary then does the prose
// filtering for free: `git commit -m "fix .env"` yields the single word
// `fix .env`, where `.env` has no `/` or string start before it, so a message
// that mentions a sensitive name stays allowed.
//
// The #2174 data-argument exemption (dataArgumentRanges) is deliberately NOT
// reused here, although it keeps guarded git words out of messages: for a data
// command its ranges cover the arguments of `cat`, `head`, `tail` and `grep`,
// which are exactly the paths this guard exists to deny. `dataArgumentRanges("cat
// .env")` is `[[3, 8]]`, so skipping those spans would re-open `cat .env`,
// while the raw patterns never match `git commit -m "fix .env"` anyway (no `/`
// or start before `.env`). Word matching is the form that satisfies both.
//
// Deliberate limits, kept fail-open rather than hidden (option 3, a fail-closed
// typed extractor of read targets, is gentle-shell#2349 follow-up):
//   - globs: `cat .e*` and `rm -r ./proj/*` never spell the sensitive word.
//   - `$VAR` indirection: `cat "$DIR/x"` is a variable, and an unexpanded
//     `$HOME/.ssh/id_rsa` is only caught because the literal tail matches.
//   - `cd dir && cat .env`: a relative path resolves against a directory a
//     previous segment changed, which this lexical guard cannot follow.
//   - decoded or interpreted reads: `base64 -d .env | cat`, `python -c
//     read('.env')`, `$(...)` output, and paths assembled inside a script.
//   - nested interpreters: `bash -c 'cat .env'` and `bash -c "cat .env"` keep
//     the whole program in one quoted word, where `.env` has no path boundary
//     before it, so the inner read stays allowed.
// Over-denial is accepted where it protects the deny: a word that matches is
// denied even inside a heredoc body, and prose that spells a path after a `/`
// such as `git commit -m "add ./.env.example"` is denied too.
const SHELL_WORD_SEPARATOR_CHARACTERS = new Set([";", "|", "&", "(", ")", "<", ">", "\n", "\r"]);

function shellCommandWords(command: string): string[] {
	const words: string[] = [];
	let word = "";
	let started = false;
	const flush = (): void => {
		if (started) words.push(word);
		word = "";
		started = false;
	};
	for (let index = 0; index < command.length; index += 1) {
		const character = command[index] as string;
		if (character === "'") {
			started = true;
			const closing = command.indexOf("'", index + 1);
			// An unterminated quote keeps the rest of the line as one word: the
			// shell would reject the command, and the literal text stays denied.
			word += command.slice(index + 1, closing < 0 ? command.length : closing);
			index = closing < 0 ? command.length : closing;
			continue;
		}
		if (character === '\"') {
			started = true;
			let closing = command.indexOf('\"', index + 1);
			// A backslash-escaped quote inside a double-quoted word stays literal.
			while (closing > 0 && command[closing - 1] === "\\") closing = command.indexOf('\"', closing + 1);
			word += command.slice(index + 1, closing < 0 ? command.length : closing);
			index = closing < 0 ? command.length : closing;
			continue;
		}
		if (character === "\\" && index + 1 < command.length) {
			index += 1;
			word += command[index] as string;
			started = true;
			continue;
		}
		if (SHELL_WORD_SEPARATOR_CHARACTERS.has(character) || /\s/.test(character)) {
			flush();
			continue;
		}
		word += character;
		started = true;
	}
	flush();
	return words;
}

function findSensitiveCommandPath(command: string): string | undefined {
	return shellCommandWords(command).find(isSensitivePath);
}

function sensitivePathBlock(sensitivePath: string): ToolCallEventResult {
	return {
		block: true,
		reason: `Gentle AI safety policy blocked access to sensitive path: ${sanitizeTerminalText(sensitivePath)}. Ask the user for an explicit safer plan.`,
	};
}

function evaluateSensitivePathTool(
	toolName: string,
	input: unknown,
): ToolCallEventResult | undefined {
	const sensitivePath = PATH_GUARDED_TOOL_NAMES.has(toolName)
		? collectPathInputs(input).find(isSensitivePath)
		: undefined;
	if (sensitivePath !== undefined) return sensitivePathBlock(sensitivePath);
	if (!SHELL_COMMAND_TOOLS.has(toolName)) return undefined;
	const command = readStringPath(input, ["command"]);
	if (command === undefined) return undefined;
	const commandPath = findSensitiveCommandPath(command);
	return commandPath === undefined ? undefined : sensitivePathBlock(commandPath);
}

const ASK_USER_CHOICE_BLOCKED_EVENT = "td:ask-user-choice:blocked";
const ASK_USER_QUESTION_BLOCKED_EVENT = "td:ask-user-question:blocked";

const HERDR_BLOCKER_LABEL = {
	CHOICE: "Choice awaiting input",
	GUARDED_CONFIRMATION: "Guarded command confirmation",
	QUESTIONNAIRE: "Questionnaire awaiting input",
	REVIEW_AUTHORIZATION: "Review authorization awaiting input",
} as const;

type HerdrBlockerLabel = (typeof HERDR_BLOCKER_LABEL)[keyof typeof HERDR_BLOCKER_LABEL];

type HerdrBlockerSource = "guarded-confirmation" | "review-authorization";

type HerdrConfirmationLifecycle = {
	begin(source?: HerdrBlockerSource): void;
	settle(source?: HerdrBlockerSource): void;
};

function createHerdrConfirmationLifecycle(events: ExtensionAPI["events"]): HerdrConfirmationLifecycle {
	const pending: Record<HerdrBlockerSource, number> = { "guarded-confirmation": 0, "review-authorization": 0 };
	let choiceActive = false;
	let nativeQuestionnaireActive = false;
	let legacyQuestionnaireActive = false;
	let emittedLabel: HerdrBlockerLabel | undefined;
	const emitEffectiveBlocker = (): void => {
		const nextLabel = choiceActive
			? HERDR_BLOCKER_LABEL.CHOICE
			: nativeQuestionnaireActive || legacyQuestionnaireActive
				? HERDR_BLOCKER_LABEL.QUESTIONNAIRE
				: pending["review-authorization"] > 0
					? HERDR_BLOCKER_LABEL.REVIEW_AUTHORIZATION
					: pending["guarded-confirmation"] > 0
						? HERDR_BLOCKER_LABEL.GUARDED_CONFIRMATION
						: undefined;
		// Herdr bridges count active/inactive edges. Keep the first label until
		// every source releases; relabel activations would leak a blocked count.
		if ((nextLabel === undefined) === (emittedLabel === undefined)) return;
		emittedLabel = nextLabel;
		if (nextLabel === undefined) events?.emit?.("herdr:blocked", { active: false });
		else events?.emit?.("herdr:blocked", { active: true, label: nextLabel });
	};

	events?.on?.(ASK_USER_CHOICE_BLOCKED_EVENT, (event) => {
		if (!isRecord(event) || typeof event.active !== "boolean" || event.active === choiceActive) return;
		choiceActive = event.active;
		emitEffectiveBlocker();
	});

	events?.on?.(ASK_USER_QUESTION_BLOCKED_EVENT, (event) => {
		if (!isRecord(event) || typeof event.active !== "boolean" || event.active === nativeQuestionnaireActive) return;
		nativeQuestionnaireActive = event.active;
		emitEffectiveBlocker();
	});

	events?.on?.("rpiv:ask-user:blocked", (event) => {
		if (!isRecord(event) || typeof event.active !== "boolean" || event.active === legacyQuestionnaireActive) return;
		legacyQuestionnaireActive = event.active;
		emitEffectiveBlocker();
	});

	return {
		begin(source = "guarded-confirmation") {
			pending[source] += 1;
			emitEffectiveBlocker();
		},
		settle(source = "guarded-confirmation") {
			if (pending[source] === 0) return;
			pending[source] -= 1;
			emitEffectiveBlocker();
		},
	};
}

const HERDR_BLOCKING_UI_METHODS = new Set<PropertyKey>(["confirm", "select", "input", "editor", "custom"]);

/**
 * Projects every human-facing dialog opened through this context's UI as one
 * Herdr blocker interval. Only `ui` is replaced; every other property reads the
 * original context so its liveness getters keep their own receiver.
 */
function withHerdrBlockingUi<T extends ExtensionContext>(ctx: T, herdrLifecycle: HerdrConfirmationLifecycle, source: HerdrBlockerSource): T {
	let wrappedUi: ExtensionContext["ui"] | undefined;
	let wrappedTarget: ExtensionContext["ui"] | undefined;
	return new Proxy(ctx, {
		get(target, property) {
			const value: unknown = Reflect.get(target, property, target);
			if (property !== "ui" || value === null || typeof value !== "object") return value;
			const ui = value as ExtensionContext["ui"];
			if (wrappedUi !== undefined && wrappedTarget === ui) return wrappedUi;
			wrappedTarget = ui;
			wrappedUi = new Proxy(ui, {
				get(uiTarget, uiProperty) {
					const member = Reflect.get(uiTarget, uiProperty, uiTarget);
					if (!HERDR_BLOCKING_UI_METHODS.has(uiProperty) || typeof member !== "function") return member;
					return async (...args: unknown[]) => {
						herdrLifecycle.begin(source);
						try {
							return await Reflect.apply(member, uiTarget, args);
						} finally {
							herdrLifecycle.settle(source);
						}
					};
				},
			});
			return wrappedUi;
		},
	});
}

// gentle-shell#2172: YOLO waives reversible delivery, not only one bare push.
// A guarded segment is judged from its trigger word (`push`/`rebase`) to the
// next command separator; a plain token or allow-listed option list is the
// whole eligible grammar, so quotes, wrappers and unknown options fall back
// to the ordinary confirmation. Everything that deletes or rewrites a remote
// ref, publishes, or runs arbitrary commands is deliberately absent:
// `--delete`/`-d`, `:dst` and `+src` refspecs, `--mirror`, `--prune`,
// `--all`, every force spelling, `--receive-pack`/`--exec`, `--repo`, `-o`.
const YOLO_WAIVABLE_KEYS: ReadonlySet<GuardedCommandKey> = new Set(["gitPush", "gitRebase"]);
const YOLO_SEGMENT_END_RE = /&&|\|\||;|\||\n|\r/;
// Text between the segment start and the `push`/`rebase` word: optional
// variable assignments, `env`/`command` prefixes and the `git` word with at
// most a `-C <path>`. Other global options (`-c key=value`, `--exec-path`,
// `--git-dir`) can run or redirect code, so they keep the confirmation.
const YOLO_GIT_PREFIX_RE = /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=[^\s'"`$]*\s+|env\s+(?:-i\s+)?|command\s+)*git(?:\s+-C\s+[^\s'"`$;&|]+)?\s+$/;
// Output redirections that write nothing: to stdout/stderr or /dev/null.
const YOLO_REDIRECT_SRC = String.raw`[12]?>&[12]|(?:[12]?|&)>>?\s*/dev/null(?![^\s;&|])`;
const YOLO_PUSH_SEGMENT_RE = new RegExp(String.raw`^push(?:\s+(?:${YOLO_REDIRECT_SRC}|-u|--set-upstream|-q|--quiet|-v|--verbose|--tags|--follow-tags|--no-verify|--porcelain|[A-Za-z0-9_][A-Za-z0-9_./-]*(?::[A-Za-z0-9_][A-Za-z0-9_./-]*)?))*\s*$`);
const YOLO_REBASE_SEGMENT_RE = new RegExp(String.raw`^rebase(?:\s+(?:${YOLO_REDIRECT_SRC}|--onto\s+[A-Za-z0-9_][A-Za-z0-9_./~^-]*|--continue|--abort|--skip|--autostash|--no-autostash|[A-Za-z0-9_][A-Za-z0-9_./~^-]*))*\s*$`);
// A pipe out of a waived segment may only feed read-only filters with plain or
// literally quoted arguments and end at a sequential separator. Git output
// carries remote-controlled text, so `| sh`, `| tee`, `| xargs` and a trailing
// background `&` keep the confirmation.
const YOLO_FILTER_PIPELINE_RE = new RegExp(String.raw`^(?:\|(?!\|)\s*(?:tail|head|cat|grep|wc)(?:\s+(?:${YOLO_REDIRECT_SRC}|[A-Za-z0-9_.,:=+/%@-]+|'[^'\n]*'|"[^"$\x60\\\n]*"))*\s*)*(?=$|&&|\|\||;|\n|\r)`);

function yoloGuardedSegment(command: string, triggerIndex: number): string {
	const rest = command.slice(triggerIndex);
	const end = rest.search(YOLO_SEGMENT_END_RE);
	return end < 0 ? rest : rest.slice(0, end);
}

function yoloSegmentPrefix(command: string, triggerIndex: number): string {
	const head = command.slice(0, triggerIndex);
	const separators = [...head.matchAll(new RegExp(YOLO_SEGMENT_END_RE.source, "g"))];
	const last = separators.at(-1);
	return last === undefined ? head : head.slice(last.index + last[0].length);
}

/**
 * Every guarded match and every recognized Git side effect must be a reversible
 * push or non-interactive rebase; the only data loss allowed is recursive
 * removal of the session's own temp scratch (lib/yolo-temp-scratch.ts).
 */
function isReversibleYoloCommand(command: string, evaluation: GuardEvaluation, scratchFs?: TempScratchFs): boolean {
	if (evaluation.action !== "confirm") return false;
	const effects = recognizeDestructiveCommands(command);
	const scratch = effects.map((effect) => effect.removalTargets !== undefined && isTempScratchRemoval(effect, scratchFs ??= defaultTempScratchFs()));
	if (evaluation.matches.length === 0 && !scratch.includes(true)) return false;
	for (const match of evaluation.matches) {
		if (!YOLO_WAIVABLE_KEYS.has(match.key)) return false;
		if (!YOLO_GIT_PREFIX_RE.test(yoloSegmentPrefix(command, match.triggerIndex))) return false;
		const segment = yoloGuardedSegment(command, match.triggerIndex);
		if (!(match.key === "gitPush" ? YOLO_PUSH_SEGMENT_RE : YOLO_REBASE_SEGMENT_RE).test(segment)) return false;
		if (!YOLO_FILTER_PIPELINE_RE.test(command.slice(match.triggerIndex + segment.length))) return false;
	}
	// The data-loss recognizer leaves non-hard Git effects (reset, stash drop,
	// restore, checkout --) to the primary policy; under YOLO only a rebase that
	// a guarded match already vetted may remain.
	const rebaseTriggers = new Set(evaluation.matches.filter((match) => match.key === "gitRebase").map((match) => match.triggerIndex));
	for (const [index, effect] of effects.entries()) {
		if (scratch[index]) continue;
		if (effect.hardDeny || effect.kind !== "git") return false;
		const rebase = /^git(?:\s+(?:-C|-c|--git-dir|--work-tree|--namespace)\s+\S+|\s+-\S+)*\s+(rebase)\b/.exec(command.slice(effect.triggerIndex));
		if (rebase === null || !rebaseTriggers.has(effect.triggerIndex + rebase.index + rebase[0].lastIndexOf("rebase"))) return false;
	}
	return true;
}

/** Preserve explicitly configured confirmations for the waivable keys present, even when legacy env/autonomy resolution ignores them. */
function yoloConfiguredRestriction(cwd: string, keys: readonly GuardedCommandKey[], options: LoadGuardrailsOptions = {}): GuardAction | undefined {
	let restriction: GuardAction | undefined;
	for (const path of [join(options.gentlePiConfigHome ?? gentleAiConfigHome(), "runtime-guardrails.json"), join(cwd, ".pi", "gentle-ai", "runtime-guardrails.json")]) {
		try {
			if (!existsSync(path)) continue;
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (!isRecord(parsed) || (parsed.guardedCommands !== undefined && !isRecord(parsed.guardedCommands))) {
				restriction ??= "confirm";
				continue;
			}
			for (const key of keys) {
				const action = isRecord(parsed.guardedCommands) ? parsed.guardedCommands[key] : undefined;
				if (action === "block") return "block";
				if (action !== undefined && action !== "allow") restriction = "confirm";
			}
		} catch { restriction ??= "confirm"; }
	}
	return restriction;
}

/** Super Yolo ignores every configurable guardrail: only code-level denies survive. */
const SUPER_YOLO_GUARDRAILS: RuntimeGuardrailsConfig = {
	autonomousMode: true,
	guardedCommands: { gitPush: "allow", gitRebase: "allow", gitBranchDeleteForce: "allow", npmPublish: "allow", piRemove: "allow" },
};

/**
 * Super Yolo command decision: run everything without confirmation except the
 * code-level catastrophic denies (root/home recursive removal, --no-preserve-root,
 * hard-denied patterns). Configured guardrails are deliberately not consulted.
 */
function evaluateSuperYoloCommand(command: string): GuardAction {
	return evaluateGuardedCommand(command, SUPER_YOLO_GUARDRAILS).action === "block" ? "block" : "allow";
}

// ---------------------------------------------------------------------------
// Permission allowlist — session and always scopes for confirmations
// ---------------------------------------------------------------------------

/** Session-scoped exact-command allows, keyed by session manager identity. */
const sessionAllowedCommands = new WeakMap<object, Set<string>>();

function normalizeAllowedCommand(command: string): string {
	return command.trim().replace(/\s+/g, " ");
}

function sessionAllowedScope(ctx: ExtensionContext): object | undefined {
	try { return ctx.sessionManager ?? undefined; } catch { return undefined; }
}

function sessionAllowedCheck(ctx: ExtensionContext, command: string): boolean {
	const scope = sessionAllowedScope(ctx);
	if (scope === undefined) return false;
	return sessionAllowedCommands.get(scope)?.has(normalizeAllowedCommand(command)) ?? false;
}

function sessionAllowedRemember(ctx: ExtensionContext, command: string): void {
	const scope = sessionAllowedScope(ctx);
	if (scope === undefined) return;
	const granted = sessionAllowedCommands.get(scope) ?? new Set<string>();
	granted.add(normalizeAllowedCommand(command));
	sessionAllowedCommands.set(scope, granted);
}

/**
 * Persist one guarded-key allow into the user-level runtime-guardrails config.
 * Malformed or unreadable existing config refuses the write: human repair, never
 * a silent rewrite. Atomic same-directory replacement, private file mode.
 */
function saveGuardedCommandAllowAlways(
	key: GuardedCommandKey,
	options: LoadGuardrailsOptions = {},
): boolean {
	const configHome = options.gentlePiConfigHome ?? gentleAiConfigHome();
	const configPath = join(configHome, "runtime-guardrails.json");
	let autonomousMode = false;
	let guardedCommands: GuardedCommandsConfig = {};
	try {
		const parsed = parseGuardrailsConfigFile(readFileSync(configPath, "utf8"));
		if (!parsed) return false;
		autonomousMode = parsed.autonomousMode;
		guardedCommands = parsed.guardedCommands;
	} catch (error) {
		if (!(typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")) return false;
	}
	const updated: RuntimeGuardrailsConfig = {
		autonomousMode,
		guardedCommands: { ...guardedCommands, [key]: GUARD_ACTION.ALLOW },
	};
	const temporary = `${configPath}.${randomUUID()}.tmp`;
	try {
		mkdirSync(configHome, { recursive: true });
		writeFileSync(temporary, `${JSON.stringify(updated, null, "\t")}\n`, { flag: "wx", mode: 0o600 });
		renameSync(temporary, configPath);
	} catch {
		try { unlinkSync(temporary); } catch { /* best effort cleanup */ }
		return false;
	}
	return true;
}

/** True when the only confirmation the command needs is for a git push, and no data-loss confirmation applies. */
function onlyGitPushNeedsConfirmation(evaluation: GuardEvaluation): boolean {
	return !evaluation.dataLoss && evaluation.matches.every((match) => match.action !== GUARD_ACTION.CONFIRM || match.key === GUARDED_COMMAND_KEY.GIT_PUSH);
}

async function confirmCommand(
	command: string,
	ctx: ExtensionContext,
	events: ExtensionAPI["events"],
	herdrLifecycle: HerdrConfirmationLifecycle,
	yoloActive = false,
	autoGate?: () => Promise<ToolCallEventResult | undefined>,
	superActive = false,
	gitConfirmed = false,
): Promise<ToolCallEventResult | undefined> {
	if (superActive) {
		// Sensitive-path and delivered-test guards already ran before this call;
		// here only the code-level catastrophic denies remain.
		if (evaluateSuperYoloCommand(command) === "block") {
			return {
				block: true,
				reason: "Gentle AI safety policy blocked a catastrophic destructive shell command. Ask the user for an explicit safer plan.",
			};
		}
		return autoGate?.();
	}
	const guardrailsConfig = loadRuntimeGuardrailsConfig(ctx.cwd);
	const evaluation = evaluateGuardedCommand(command, guardrailsConfig);
	// Configuration provenance is distinct from legacy autonomy resolution, which
	// can ignore confirmations when an environment override is present. Activation
	// cannot waive a restriction from either user or project configuration layer.
	const waivableKeys = evaluation.matches.map((match) => match.key).filter((key) => YOLO_WAIVABLE_KEYS.has(key));
	const configuredRestriction = yoloActive && waivableKeys.length > 0
		? yoloConfiguredRestriction(ctx.cwd, waivableKeys) : undefined;
	const requested = evaluation.action === "block" || configuredRestriction === "block"
		? "block" : configuredRestriction ?? evaluation.action;
	// The commit/push dialog already asked the human about this command's git push, so
	// that push needs no second prompt. Any other confirmation still asks, and a block still blocks.
	const classification = gitConfirmed && requested === GUARD_ACTION.CONFIRM && onlyGitPushNeedsConfirmation(evaluation) ? GUARD_ACTION.ALLOW : requested;

	if (classification === "block") {
		return {
			block: true,
			reason:
				"Gentle AI safety policy blocked a destructive shell command. Ask the user for an explicit safer plan.",
		};
	}

	if (classification === "not-guarded") return autoGate?.();

	// classification === "allow" or "confirm" from this point on
	if (classification === "allow") return autoGate?.();

	// Session-scoped exact-command allow: this exact command was approved earlier
	// in the same session, so the confirmation dialog is not repeated.
	if (sessionAllowedCheck(ctx, command)) return autoGate?.();

	// Auto may replace only a default confirmation, never an explicit user/project
	// ask/block rule or the independent data-loss confirmation.
	if (autoGate && !evaluation.dataLoss) {
		let explicit = false;
		for (const path of [join(gentleAiConfigHome(), "runtime-guardrails.json"), join(ctx.cwd, ".pi", "gentle-ai", "runtime-guardrails.json")]) {
			try {
				if (!existsSync(path)) continue;
				const settings: unknown = JSON.parse(readFileSync(path, "utf8"));
				if (!isRecord(settings) || (settings.guardedCommands !== undefined && !isRecord(settings.guardedCommands))) { explicit = true; continue; }
				if (isRecord(settings.guardedCommands) && evaluation.matches.some(match => {
					const action = (settings.guardedCommands as Record<string, unknown>)[match.key];
					return action !== undefined && action !== "allow";
				})) explicit = true;
			} catch { explicit = true; }
		}
		if (!explicit) return autoGate();
	}

	// Full T1 evaluation has already run. YOLO never changes persistent autonomy.
	if (yoloActive && configuredRestriction === undefined && isReversibleYoloCommand(command, evaluation)) return undefined;

	// classification === "confirm"
	if (!ctx.hasUI) {
		return {
			block: true,
			reason:
				"Gentle AI safety policy requires interactive confirmation before this command.",
		};
	}
	const title = evaluation.dataLoss
		? "Allow recognized data-loss command?"
		: guardedCommandTitle(evaluation.key, evaluation.matches);
	const preview = guardedCommandPreview(command, evaluation.triggerIndex);
	const requestId = randomUUID();
	const emitPermissionRequest = (
		state: "waiting" | "approved" | "denied",
	): void => {
		events.emit("pi-permission-system:permission-request", {
			requestId,
			state,
			source: "tool_call",
			message: "Gentle AI safety policy requires confirmation for this tool call.",
			toolName: "bash",
		});
	};
	let approved = false;
	let confirmationFailed = false;
	let confirmationError: unknown;
	emitPermissionRequest("waiting");
	herdrLifecycle.begin();
	try {
		if (typeof (ctx.ui as { select?: unknown }).select === "function") {
			// Scoped confirmation: the ask dialog itself carries the allowlist choices.
			const canAlwaysAllow = !evaluation.dataLoss && typeof evaluation.key === "string";
			const alwaysLabel = canAlwaysAllow
				? `Always allow ${GUARDED_COMMAND_LABELS[evaluation.key as GuardedCommandKey]}`
				: undefined;
			const sessionScopeAvailable = sessionAllowedScope(ctx) !== undefined;
			const choices = [
				"Allow once",
				...(sessionScopeAvailable ? ["Allow for this session"] : []),
				...(alwaysLabel ? [alwaysLabel] : []),
				"Deny",
			];
			const selection = await (ctx.ui as unknown as {
				select: (title: string, options: string[]) => Promise<string | undefined>;
			}).select(`${title}\n${preview}`, choices);
			if (selection === "Allow for this session") sessionAllowedRemember(ctx, command);
			if (alwaysLabel !== undefined && selection === alwaysLabel && !saveGuardedCommandAllowAlways(evaluation.key as GuardedCommandKey)) {
				try { ctx.ui.notify?.("Could not save the always-allow preference; the command is approved once only.", "warning"); } catch { /* display only */ }
			}
			approved = selection === "Allow once" || selection === "Allow for this session" || (alwaysLabel !== undefined && selection === alwaysLabel);
		} else {
			approved = (await ctx.ui.confirm(title, preview)) === true;
		}
	} catch (error) {
		confirmationFailed = true;
		confirmationError = error;
	} finally {
		try {
			emitPermissionRequest(confirmationFailed || !approved ? "denied" : "approved");
		} finally {
			herdrLifecycle.settle();
		}
	}
	if (confirmationFailed) throw confirmationError;
	if (approved) return undefined;
	return {
		block: true,
		reason:
			"Gentle AI safety policy blocked the command because it was not confirmed.",
	};
}

/**
 * Evaluate the ordered bash command policies for a model-initiated `bash`
 * tool call. Policies run in `BASH_COMMAND_POLICIES` order; the first policy
 * to return a verdict terminates evaluation with that verdict, while an
 * `undefined` from a policy defers to the remaining policies. `yoloActive`
 * threads the session YOLO state through to every policy, and `autoGate`
 * threads the Auto permission-mode gate the same way. The optional
 * `policies` argument exists for tests and future composition; production
 * callers use the default ordered list.
 */
async function evaluateBashPolicies(
	command: string,
	ctx: ExtensionContext,
	events: ExtensionAPI["events"],
	herdrLifecycle: HerdrConfirmationLifecycle,
	yoloActive: boolean,
	policies: readonly BashCommandPolicy[] = BASH_COMMAND_POLICIES,
	autoGate?: () => Promise<ToolCallEventResult | undefined>,
	superYoloActive = false,
	gitConfirmed = false,
): Promise<ToolCallEventResult | undefined> {
	for (const policy of policies) {
		const verdict = await policy.evaluate(command, ctx, events, herdrLifecycle, yoloActive, autoGate, superYoloActive, gitConfirmed);
		if (verdict !== undefined) return verdict;
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function gentleAiConfigHome(): string {
	return gentlePiConfigHome();
}

function modelConfigPath(_cwd: string): string {
	return join(gentleAiConfigHome(), "models.json");
}

function modelExportPath(_cwd: string): string {
	return join(gentleAiConfigHome(), "models.export.json");
}

const MODEL_EXPORT_KIND = brandId("agent_model_routing");
const MODEL_EXPORT_VERSION = 1;

function legacyProjectModelConfigPath(cwd: string): string {
	return join(cwd, ".pi", "gentle-ai", "models.json");
}

// bootstrapProfilesFile can activate a profile from a read-only
// effective-config snapshot without ever writing the global file (e.g.
// opening /td:profiles for the first time). A pinned or active profile is
// a complete routing snapshot (see withOmittedAgentsClearedAsync): omitted
// agents must inherit. Before the global file exists there is nothing for the
// "use only the global file" guarantee to read, and falling back to the raw
// legacy project file would resurrect agents the profile deliberately omits
// (that file was never filtered by the profile's omissions). Read the
// profile's own stored snapshot instead: it is already complete, because
// bootstrapProfilesFile seeds it from the full effective routing that was
// visible a moment before the profile existed. Takes the already-resolved
// target so callers that also branch on it never resolve it twice.
function activeProfileRoutingSnapshot(cwd: string, target: CurrentProfileTarget): ModelConfigFileResult | undefined {
	const store = readProfilesFileResult(profilesFilePath(gentleAiConfigHome()));
	if (store.status !== "valid") return undefined;
	const config = store.file.profiles[target.name];
	return config === undefined ? undefined : { status: "valid", config };
}

// The second path fed into the global/project merge below. With no active
// profile it is the real legacy project file, so project-only entries merge
// in. With a pinned or active profile and an existing global file it is the
// *global* path again on purpose: merging the legacy project file here would
// resurrect agent entries the profile deliberately omitted (the profile's
// own snapshot, read by activeProfileRoutingSnapshot, is already complete).
// Takes the already-resolved target so callers that also branch on it never
// resolve it twice.
function secondaryMergeSourcePath(cwd: string, target: CurrentProfileTarget | undefined): string {
	return target !== undefined ? modelConfigPath(cwd) : legacyProjectModelConfigPath(cwd);
}

// A pinned or active profile is a complete routing snapshot, so while the
// global file is missing its own snapshot stands in for the legacy project
// file, which would resurrect agents the profile deliberately omits. Only a
// readable legacy file is replaced: with nothing there to suppress, the reader
// keeps the result it returned before that merge (`missing`, or empty for an
// unreadable file), so a pin or active profile never invents saved routing
// where no model config exists at all and a session that cleared its profile
// cannot read the pin back (gentle-shell#2477).
function profileSnapshotForLegacySource(
	cwd: string,
	target: CurrentProfileTarget,
	legacyResult: ModelConfigFileResult,
): ModelConfigFileResult {
	if (legacyResult.status === "missing") return legacyResult;
	if (legacyResult.status === "invalid") return { status: "valid", config: {} };
	return activeProfileRoutingSnapshot(cwd, target) ?? { status: "valid", config: {} };
}

// An invalid legacy project file must never block the global config it merges
// with: fall back to the global-only result (or empty) instead of erroring.
function readSavedModelConfig(cwd: string): ModelConfigFileResult {
	const globalPath = modelConfigPath(cwd);
	const target = resolveCurrentProfileTarget(cwd);
	if (target !== undefined && !existsSync(globalPath)) {
		return profileSnapshotForLegacySource(cwd, target, readModelConfigFile(legacyProjectModelConfigPath(cwd)));
	}
	const projectPath = secondaryMergeSourcePath(cwd, target);
	const result = readModelRoutingAuthority(globalPath, projectPath);
	if (result.status !== "invalid" || result.path !== projectPath || globalPath === projectPath) return result;
	const globalResult = readModelConfigFile(globalPath);
	return globalResult.status === "valid" ? globalResult : { status: "valid", config: {} };
}

async function readSavedModelConfigAsync(
	cwd: string,
): Promise<ModelConfigFileResult> {
	const globalPath = modelConfigPath(cwd);
	const target = resolveCurrentProfileTarget(cwd);
	if (target !== undefined && !existsSync(globalPath)) {
		return profileSnapshotForLegacySource(cwd, target, await readModelConfigFileAsync(legacyProjectModelConfigPath(cwd)));
	}
	const projectPath = secondaryMergeSourcePath(cwd, target);
	const result = await readModelRoutingAuthorityAsync(globalPath, projectPath);
	if (result.status !== "invalid" || result.path !== projectPath || globalPath === projectPath) return result;
	const globalResult = await readModelConfigFileAsync(globalPath);
	return globalResult.status === "valid" ? globalResult : { status: "valid", config: {} };
}

export function readModelConfig(cwd: string): AgentModelConfig {
	const result = readSavedModelConfig(cwd);
	return result.status === "valid" ? result.config : {};
}

export async function readModelConfigAsync(
	cwd: string,
): Promise<AgentModelConfig> {
	const result = await readSavedModelConfigAsync(cwd);
	return result.status === "valid" ? result.config : {};
}

function writeModelConfig(cwd: string, config: AgentModelConfig): void {
	const path = modelConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	const cleaned = normalizeModelConfig(config) ?? {};
	writeFileSync(path, `${JSON.stringify(cleaned, null, 2)}\n`);
}

async function writeModelConfigAsync(cwd: string, config: AgentModelConfig): Promise<void> {
	const path = modelConfigPath(cwd);
	await mkdir(dirname(path), { recursive: true });
	const cleaned = normalizeModelConfig(config) ?? {};
	await writeFile(path, `${JSON.stringify(cleaned, null, 2)}\n`);
}

function parseModelExport(value: unknown): AgentModelConfig | undefined {
	if (!isRecord(value)) return undefined;
	if (!isBrandId(value.kind, "agent_model_routing") || value.version !== MODEL_EXPORT_VERSION) return undefined;
	return normalizeModelConfig(value.agents);
}

async function exportSavedModelConfig(ctx: ExtensionContext): Promise<number> {
	const saved = await readModelRoutingAuthorityAsync(
		modelConfigPath(ctx.cwd),
		legacyProjectModelConfigPath(ctx.cwd),
	);
	if (saved.status === "invalid") throw new Error(`Invalid model config: ${saved.path}`);
	const agents = saved.status === "valid" ? saved.config : {};
	const path = modelExportPath(ctx.cwd);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		`${JSON.stringify({ kind: MODEL_EXPORT_KIND, version: MODEL_EXPORT_VERSION, agents }, null, 2)}\n`,
	);
	return Object.keys(agents).length;
}

async function readModelExport(ctx: ExtensionContext): Promise<AgentModelConfig | undefined> {
	try {
		return parseModelExport(JSON.parse(await readFile(modelExportPath(ctx.cwd), "utf8")));
	} catch {
		return undefined;
	}
}

function cloneModelConfig(config: AgentModelConfig): AgentModelConfig {
	return Object.fromEntries(
		Object.entries(config).map(([name, entry]) => [name, { ...entry }]),
	);
}

function updateFrontmatterRouting(
	content: string,
	entry: AgentRoutingEntry | undefined,
): string {
	if (!content.startsWith("---\n")) return content;
	const endIndex = content.indexOf("\n---", 4);
	if (endIndex === -1) return content;
	const frontmatter = content.slice(4, endIndex);
	const body = content.slice(endIndex);
	const lines = frontmatter
		.split("\n")
		.filter(
			(line) => !line.startsWith("model:") && !line.startsWith("thinking:"),
		);
	const toInsert: string[] = [];
	if (entry?.model) toInsert.push(`model: ${entry.model}`);
	if (entry?.thinking) toInsert.push(`thinking: ${entry.thinking}`);
	if (toInsert.length > 0) {
		const descriptionIndex = lines.findIndex((line) =>
			line.startsWith("description:"),
		);
		const insertIndex =
			descriptionIndex >= 0 ? descriptionIndex + 1 : Math.min(1, lines.length);
		lines.splice(insertIndex, 0, ...toInsert);
	}
	return `---\n${lines.join("\n")}${body}`;
}

/**
 * The routing an agent file currently carries, read the same way
 * `updateFrontmatterRouting` writes it: top-level `model:` and `thinking:`
 * frontmatter lines. Anything else is "no routing", not an error.
 */
function readFrontmatterRouting(content: string): AgentRoutingEntry | undefined {
	if (!content.startsWith("---\n")) return undefined;
	const endIndex = content.indexOf("\n---", 4);
	if (endIndex === -1) return undefined;
	const raw: Record<string, string> = {};
	for (const line of content.slice(4, endIndex).split("\n")) {
		if (line.startsWith("model:")) raw.model = line.slice("model:".length).trim();
		else if (line.startsWith("thinking:")) raw.thinking = line.slice("thinking:".length).trim();
	}
	if (raw.model === undefined && raw.thinking === undefined) return undefined;
	const entry = normalizeRoutingEntry(raw);
	return entry && !isClearRoutingEntry(entry) ? entry : undefined;
}

function routingEntryFromModelProfile(value: unknown): AgentRoutingEntry | undefined {
	if (!isRecord(value)) return undefined;
	const entry = normalizeRoutingEntry({ model: value.model, thinking: value.effort });
	return entry && !isClearRoutingEntry(entry) ? entry : undefined;
}

function mergeMaterializedRouting(
	profile: AgentRoutingEntry | undefined,
	frontmatter: AgentRoutingEntry | undefined,
): AgentRoutingEntry | undefined {
	if (!profile) return frontmatter;
	if (!frontmatter) return profile;
	return normalizeRoutingEntry({
		model: profile.model ?? frontmatter.model,
		thinking: profile.thinking ?? frontmatter.thinking,
	});
}

function readSubagentModelProfiles(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		return isRecord(parsed) && isRecord(parsed.model_profiles) ? parsed.model_profiles : {};
	} catch {
		return {};
	}
}

async function readSubagentModelProfilesAsync(path: string): Promise<Record<string, unknown>> {
	if (!(await pathExists(path))) return {};
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		return isRecord(parsed) && isRecord(parsed.model_profiles) ? parsed.model_profiles : {};
	} catch {
		return {};
	}
}

/**
 * The routing an agent is materialized with — what subagent launches actually
 * resolve — regardless of what `models.json` records: the runtime reads
 * `subagents.json` model profiles first and the agent frontmatter otherwise,
 * independently for each routing field.
 */
function readMaterializedRoutingEntry(
	cwd: string,
	agent: AgentEntry,
	profilesByPath: Map<string, Record<string, unknown>>,
): AgentRoutingEntry | undefined {
	const profilesPath = agentModelProfileConfigPath(cwd, agent.source);
	let profiles = profilesByPath.get(profilesPath);
	if (!profiles) {
		profiles = readSubagentModelProfiles(profilesPath);
		profilesByPath.set(profilesPath, profiles);
	}
	const fromProfile = routingEntryFromModelProfile(profiles[agent.name]);
	if (!agent.filePath || !existsSync(agent.filePath)) return fromProfile;
	try {
		return mergeMaterializedRouting(fromProfile, readFrontmatterRouting(readFileSync(agent.filePath, "utf8")));
	} catch {
		return fromProfile;
	}
}

async function readMaterializedRoutingEntryAsync(
	cwd: string,
	agent: AgentEntry,
	profilesByPath: Map<string, Record<string, unknown>>,
): Promise<AgentRoutingEntry | undefined> {
	const profilesPath = agentModelProfileConfigPath(cwd, agent.source);
	let profiles = profilesByPath.get(profilesPath);
	if (!profiles) {
		profiles = await readSubagentModelProfilesAsync(profilesPath);
		profilesByPath.set(profilesPath, profiles);
	}
	const fromProfile = routingEntryFromModelProfile(profiles[agent.name]);
	if (!agent.filePath || !(await pathExists(agent.filePath))) return fromProfile;
	try {
		return mergeMaterializedRouting(fromProfile, readFrontmatterRouting(await readFile(agent.filePath, "utf8")));
	} catch {
		return fromProfile;
	}
}

/**
 * The routing a launch would resolve: a winning per-repository pin replaces subagent
 * routing wholesale, so when one wins it is the effective routing. The launch
 * resolver decides, so the profile shown as effective is exactly the profile a launch
 * would use -- there is no second precedence rule here.
 */
function pinnedEffectiveModelConfig(cwd: string): AgentModelConfig | undefined {
	const resolution = resolveProfilePin({ cwd, configHome: gentleAiConfigHome() });
	return resolution === undefined ? undefined : cloneModelConfig(resolution.modelProfiles);
}

/**
 * The routing in effect: `models.json` where it speaks, and the materialized
 * stores the runtime resolves from for every discoverable agent it is silent
 * about. A sparse `models.json` therefore never hides routing that is still
 * live (#1012). A winning pin outranks both. Reading never writes.
 */
function readEffectiveModelConfig(cwd: string): AgentModelConfig {
	return pinnedEffectiveModelConfig(cwd) ?? readGlobalEffectiveModelConfig(cwd);
}

/**
 * Resolve one complete reviewer routing snapshot without per-role fallback,
 * through the same rule launches read (gentle-shell#1064): the Enter binding,
 * else the profile the session froze at startup (a session frozen without one
 * never adopts a later pin), else in follow mode the profile the target
 * resolves now. A reviewer never runs on routing the session no longer uses.
 */
function readReviewerModelConfig(cwd: string, sessionId: string | undefined, sessionCwd: string = cwd): AgentModelConfig {
	return readReviewerRouting(cwd, sessionId, sessionCwd).config;
}

/**
 * The reviewer routing snapshot and the fixed name of where it came from, so a
 * fail-closed refusal can say which routing omitted the lens (gentle-shell#2163).
 */
function readReviewerRouting(cwd: string, sessionId: string | undefined, sessionCwd: string = cwd): { config: AgentModelConfig; source: string } {
	const resolution = resolveSessionProfile({ sessionId, cwd: sessionCwd, configHome: gentleAiConfigHome() });
	// A target in another Git repository keeps its own pin layers, as launches do.
	const target = readProfilePinStatus(cwd)?.commonDir;
	const home = readProfilePinStatus(sessionCwd)?.commonDir;
	// A session outside Git has no repository of its own, so any Git target is foreign.
	const foreignRepository = target !== undefined && target !== home;
	// A caller without a session keeps the routing it read before session profiles.
	// An explicit binding carries its full modelProfiles (orchestrator included) to
	// the fallback below; sessionProfileRoutingAt role-routes it, and launches must
	// never see the orchestrator key (gentle-shell#2742, section 8).
	const routed = resolution.kind === "live" ? pinnedEffectiveModelConfig(cwd)
		: resolution.kind === "explicit" ? resolution.modelProfiles
		: sessionProfileRoutingAt(resolution, { cwd, configHome: gentleAiConfigHome(), foreignRepository });
	// Without a binding, pin or frozen profile the reviewer reads the global
	// effective routing the models panel shows and launches use (gentle-shell#2163,
	// #1731); an explicit snapshot stays whole and never borrows from it. It is
	// read from the session's directory, as the launcher does, never from the
	// target's: the reviewed candidate never selects its own reviewer.
	const config = routed === undefined ? readGlobalEffectiveModelConfig(sessionCwd) : cloneModelConfig(routed);
	const source = routed === undefined ? `global effective routing (saved store ${modelConfigPath(cwd)}, then subagents.json and agent frontmatter)`
		: resolution.kind === "explicit" ? "session profile binding"
		: resolution.kind === "inherited" && resolution.profile !== undefined ? "frozen session profile"
		: resolution.kind === "follow" ? "followed session profile"
		: "repository profile pin";
	// Only a profile chosen with Use in this session, or recorded as the session's
	// startup profile, carries its orchestrator to the provider review roles; an
	// in-memory freeze, pinned and global routing leave them on Pi's persisted
	// default (gentle-shell#2716 A1, gentle-shell#2742 section 8).
	if (resolution.kind !== "explicit") delete config.orchestrator;
	const recorded = resolution.kind === "inherited" ? readSessionProfileBinding(sessionId)?.modelProfiles.orchestrator : undefined;
	if (recorded !== undefined) config.orchestrator = { ...recorded };
	return { config, source };
}

/** The routing in effect once the pin is set aside: what a global save materializes. */
function readGlobalEffectiveModelConfig(cwd: string): AgentModelConfig {
	const effective = cloneModelConfig(readModelConfig(cwd));
	const profilesByPath = new Map<string, Record<string, unknown>>();
	for (const agent of listDiscoverableAgents(cwd)) {
		if (isProviderReviewRole(agent.name) || agent.name in effective) continue;
		const entry = readMaterializedRoutingEntry(cwd, agent, profilesByPath);
		if (entry) effective[agent.name] = entry;
	}
	return effective;
}

/**
 * The profile this session's launches resolve (gentle-shell#1064 slice 3c): the
 * Enter binding, then the profile frozen at startup, through the same rule the
 * launcher reads. It resolves from the session's directory, as the freeze and
 * the launcher do. `undefined` means the session resolves no profile, so
 * launches keep the global routing; a pin the session did not freeze never
 * reaches them and is not read here. Without session profile authority the
 * launches are blocked, so no profile is theirs.
 */
function sessionLaunchProfile(ctx: ExtensionContext, authorityAvailable: boolean): { name: string; modelProfiles: AgentModelConfig } | undefined {
	if (!authorityAvailable) return undefined;
	const resolution = resolveSessionProfile({
		sessionId: ctx.sessionManager?.getSessionId?.(),
		cwd: ctx.sessionManager?.getCwd?.() ?? ctx.cwd,
		configHome: gentleAiConfigHome(),
	});
	const name = resolution.kind === "explicit" ? resolution.name : resolution.profile?.name;
	const routing = sessionProfileModelProfiles(resolution);
	return name === undefined || routing === undefined ? undefined : { name, modelProfiles: cloneModelConfig(routing) };
}

/**
 * Whether this session's launches may run, read as the launcher reads it (and,
 * like it, clearing a binding it cannot corroborate). A manager without a
 * branch has no session profile record to distrust.
 */
function sessionProfileAuthorityAvailable(ctx: ExtensionContext): boolean {
	const manager = ctx.sessionManager;
	if (typeof manager?.getSessionId !== "function" || typeof manager.getBranch !== "function") return true;
	return readSessionProfileAuthority(manager).available;
}

/** The routing this session's launches use: its profile, or the global effective routing. */
async function readSessionLaunchModelConfigAsync(ctx: ExtensionContext, authorityAvailable: boolean): Promise<AgentModelConfig> {
	return sessionLaunchProfile(ctx, authorityAvailable)?.modelProfiles
		?? await readGlobalEffectiveModelConfigFromAsync(ctx.cwd, await readModelConfigAsync(ctx.cwd));
}

async function readEffectiveModelConfigAsync(cwd: string): Promise<AgentModelConfig> {
	const pinned = pinnedEffectiveModelConfig(cwd);
	if (pinned) return pinned;
	return readGlobalEffectiveModelConfigFromAsync(cwd, await readModelConfigAsync(cwd));
}

/**
 * The saved global routing merged with the materialized stores of every
 * discoverable agent it is silent about — the same effective view
 * `readEffectiveModelConfigAsync` builds, but starting from an already-read
 * saved routing so callers that must distinguish an unreadable authority can
 * keep that distinction while still seeing materialized routes.
 */
async function readGlobalEffectiveModelConfigFromAsync(
	cwd: string,
	base: AgentModelConfig,
): Promise<AgentModelConfig> {
	const effective = cloneModelConfig(base);
	const profilesByPath = new Map<string, Record<string, unknown>>();
	for (const agent of await listDiscoverableAgentsAsync(cwd)) {
		if (isProviderReviewRole(agent.name) || agent.name in effective) continue;
		const entry = await readMaterializedRoutingEntryAsync(cwd, agent, profilesByPath);
		if (entry) effective[agent.name] = entry;
	}
	return effective;
}

/**
 * A profile is a complete routing snapshot: applying it must leave every
 * discoverable agent it omits on inherit, not on whatever was materialized
 * before. Padding the omitted agents with clear entries makes
 * `applyModelConfig` remove their model profiles and frontmatter routing, the
 * same way applying a profile with inherit entries clears an agent set.
 */
async function withOmittedAgentsClearedAsync(
	cwd: string,
	config: AgentModelConfig,
): Promise<AgentModelConfig> {
	const completed = cloneModelConfig(config);
	for (const agent of await listDiscoverableAgentsAsync(cwd)) {
		if (isProviderReviewRole(agent.name) || agent.name in completed) continue;
		completed[agent.name] = {};
	}
	return completed;
}

function parseAgentName(filePath: string): string | undefined {
	let content: string;
	try {
		content = readFileSync(filePath, "utf8");
	} catch {
		return undefined;
	}
	const name = content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
	if (!name) return undefined;
	const packageName = content
		.match(/^package:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]
		?.trim();
	return packageName ? `${packageName}.${name}` : name;
}

async function parseAgentNameAsync(
	filePath: string,
): Promise<string | undefined> {
	let content: string;
	try {
		content = await readFile(filePath, "utf8");
	} catch {
		return undefined;
	}
	const name = content.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
	if (!name) return undefined;
	const packageName = content
		.match(/^package:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]
		?.trim();
	return packageName ? `${packageName}.${name}` : name;
}

function listAgentFilesRecursive(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "skills") continue;
			files.push(...listAgentFilesRecursive(path));
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".md") &&
			!entry.name.endsWith(".chain.md")
		)
			files.push(path);
	}
	return files;
}

async function listAgentFilesRecursiveAsync(dir: string): Promise<string[]> {
	if (!(await pathExists(dir))) return [];
	const files: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return files;
	}
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "skills") continue;
			files.push(...(await listAgentFilesRecursiveAsync(path)));
		} else if (
			entry.isFile() &&
			entry.name.endsWith(".md") &&
			!entry.name.endsWith(".chain.md")
		) {
			files.push(path);
		}
	}
	return files;
}

function listAgentsFromDir(dir: string, source: AgentSource): AgentEntry[] {
	return listAgentFilesRecursive(dir)
		.map((filePath): AgentEntry | undefined => {
			const name = parseAgentName(filePath);
			return name ? { name, source, filePath } : undefined;
		})
		.filter((entry): entry is AgentEntry => entry !== undefined);
}

async function listAgentsFromDirAsync(
	dir: string,
	source: AgentSource,
): Promise<AgentEntry[]> {
	const filePaths = await listAgentFilesRecursiveAsync(dir);
	const entries: AgentEntry[] = [];
	for (const filePath of filePaths) {
		const name = await parseAgentNameAsync(filePath);
		if (name) entries.push({ name, source, filePath });
	}
	return entries;
}

interface DiscoverableNonBuiltinAgentRoot {
	dir: string;
	source: AgentSource;
	/** The package installer owns this directory, so packageAssetAudit reports it. */
	packageManaged: boolean;
}

function discoverableNonBuiltinAgentRoots(cwd: string): DiscoverableNonBuiltinAgentRoot[] {
	const globalAgentHome = gentlePiAgentHome();
	const roots: DiscoverableNonBuiltinAgentRoot[] = [
		{ dir: join(globalAgentHome, "agents"), source: "user", packageManaged: true },
		{ dir: join(globalAgentHome, "subagents"), source: "user", packageManaged: false },
		{ dir: join(homedir(), ".agents"), source: "user", packageManaged: false },
		{ dir: join(cwd, ".agents"), source: "project", packageManaged: false },
		{ dir: join(cwd, ".pi", "agents"), source: "project", packageManaged: false },
		{ dir: join(cwd, ".pi", "subagents"), source: "project", packageManaged: false },
	];
	const unique = new Map<string, DiscoverableNonBuiltinAgentRoot>();
	for (const root of roots) {
		let canonical: string;
		try {
			canonical = realpathSync(root.dir);
		} catch {
			canonical = resolve(root.dir);
		}
		const existing = unique.get(canonical);
		if (existing) {
			// Reinsert so a later alias keeps true later-root precedence even when
			// another physical root appears between the duplicate entries. A merged
			// package-managed root must keep its installer-owned path: ownership
			// updates validate that lexical path against the managed manifest root.
			const managedRoot = existing.packageManaged ? existing : root.packageManaged ? root : undefined;
			unique.delete(canonical);
			unique.set(canonical, {
				dir: managedRoot?.dir ?? root.dir,
				source: root.source,
				packageManaged: managedRoot !== undefined,
			});
		} else unique.set(canonical, root);
	}
	return [...unique.values()];
}

function builtinAgentDirs(cwd: string): string[] {
	return [
		join(PACKAGE_ROOT, "..", "pi-subagents-j0k3r", "agents"),
		join(cwd, ".pi", "npm", "node_modules", "pi-subagents-j0k3r", "agents"),
		join(homedir(), ".local", "lib", "node_modules", "pi-subagents-j0k3r", "agents"),
		join(PACKAGE_ROOT, "..", "pi-subagents", "agents"),
		join(cwd, ".pi", "npm", "node_modules", "pi-subagents", "agents"),
		join(homedir(), ".local", "lib", "node_modules", "pi-subagents", "agents"),
	];
}

function listDiscoverableAgents(cwd: string): AgentEntry[] {
	const builtinDirs = builtinAgentDirs(cwd);
	const agents = [
		...builtinDirs.flatMap((dir) => listAgentsFromDir(dir, "builtin")),
		...discoverableNonBuiltinAgentRoots(cwd).flatMap(({ dir, source }) =>
			listAgentsFromDir(dir, source),
		),
	];
	const byName = new Map<string, AgentEntry>();
	for (const agent of agents) byName.set(agent.name, agent);
	return orderDiscoverableAgents(Array.from(byName.values()));
}

async function listDiscoverableAgentsAsync(cwd: string): Promise<AgentEntry[]> {
	const builtinDirs = builtinAgentDirs(cwd);
	const agents: AgentEntry[] = [];
	for (const dir of builtinDirs) {
		agents.push(...(await listAgentsFromDirAsync(dir, "builtin")));
	}
	for (const { dir, source } of discoverableNonBuiltinAgentRoots(cwd)) {
		agents.push(...(await listAgentsFromDirAsync(dir, source)));
	}
	const byName = new Map<string, AgentEntry>();
	for (const agent of agents) byName.set(agent.name, agent);
	return orderDiscoverableAgents(Array.from(byName.values()));
}

function orderDiscoverableAgents(agents: AgentEntry[]): AgentEntry[] {
	const coreFirst = CORE_MODEL_AGENT_NAMES.map((name) =>
		agents.find((agent) => agent.name === name),
	).filter((agent): agent is AgentEntry => agent !== undefined);
	const rest = agents
		.filter((agent) => !CORE_MODEL_AGENT_NAME_SET.has(agent.name))
		.sort((left, right) => left.name.localeCompare(right.name));
	return [...coreFirst, ...rest];
}

function isClearRoutingEntry(entry: AgentRoutingEntry): boolean {
	return entry.model === undefined && entry.thinking === undefined;
}

function agentModelProfileConfigPath(cwd: string, source: AgentSource): string {
	return source === "project"
		? join(cwd, ".pi", "subagents.json")
		: join(gentlePiAgentHome(), "subagents.json");
}

function modelProfileForRoutingEntry(
	entry: AgentRoutingEntry | undefined,
): Record<string, string> | undefined {
	if (!entry || isClearRoutingEntry(entry)) return undefined;
	const profile: Record<string, string> = {};
	if (entry.model) profile.model = entry.model;
	if (entry.thinking) profile.effort = entry.thinking;
	return Object.keys(profile).length > 0 ? profile : undefined;
}

function updateSubagentModelProfileAtPath(
	path: string,
	name: string,
	entry: AgentRoutingEntry | undefined,
	options: { preserveExisting?: boolean } = {},
): boolean {
	let config: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (isRecord(parsed)) config = { ...parsed };
		} catch {
			config = {};
		}
	}
	const modelProfiles = isRecord(config.model_profiles)
		? { ...config.model_profiles }
		: {};
	const profile = modelProfileForRoutingEntry(entry);
	// A write that would leave the profile as it is (including removing a
	// profile that was never there) is not an update and touches no file.
	if (JSON.stringify(modelProfiles[name]) === JSON.stringify(profile)) return false;
	if (profile) {
		if (options.preserveExisting && isRecord(modelProfiles[name])) return false;
		modelProfiles[name] = profile;
	} else delete modelProfiles[name];
	if (Object.keys(modelProfiles).length > 0) config.model_profiles = modelProfiles;
	else delete config.model_profiles;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
	return true;
}

async function updateSubagentModelProfileAtPathAsync(
	path: string,
	name: string,
	entry: AgentRoutingEntry | undefined,
	options: { preserveExisting?: boolean } = {},
): Promise<boolean> {
	let config: Record<string, unknown> = {};
	if (await pathExists(path)) {
		try {
			const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
			if (isRecord(parsed)) config = { ...parsed };
		} catch {
			config = {};
		}
	}
	const modelProfiles = isRecord(config.model_profiles)
		? { ...config.model_profiles }
		: {};
	const profile = modelProfileForRoutingEntry(entry);
	// A write that would leave the profile as it is (including removing a
	// profile that was never there) is not an update and touches no file.
	if (JSON.stringify(modelProfiles[name]) === JSON.stringify(profile)) return false;
	if (profile) {
		if (options.preserveExisting && isRecord(modelProfiles[name])) return false;
		modelProfiles[name] = profile;
	} else delete modelProfiles[name];
	if (Object.keys(modelProfiles).length > 0) config.model_profiles = modelProfiles;
	else delete config.model_profiles;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
	return true;
}

function updateSubagentModelProfile(
	cwd: string,
	source: AgentSource,
	name: string,
	entry: AgentRoutingEntry | undefined,
	options: { preserveExisting?: boolean } = {},
): boolean {
	return updateSubagentModelProfileAtPath(
		agentModelProfileConfigPath(cwd, source),
		name,
		entry,
		options,
	);
}

function projectSettingsPath(cwd: string): string {
	return join(cwd, ".pi", "settings.json");
}

/**
 * Pi's own global settings file, which is where the orchestrator model lives.
 * Profiles own the three `default*` keys there; nothing else in this extension
 * reads or writes that file.
 */
function orchestratorSettingsPath(): string {
	return join(gentlePiAgentHome(), "settings.json");
}

function removeLegacyAgentOverridesFromSettings(
	settingsPath: string,
	settings: Record<string, unknown>,
): void {
	const subagents = isRecord(settings.subagents)
		? { ...settings.subagents }
		: undefined;
	if (!subagents) return;
	delete subagents.agentOverrides;
	if (Object.keys(subagents).length > 0) settings.subagents = subagents;
	else delete settings.subagents;
	mkdirSync(dirname(settingsPath), { recursive: true });
	writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

function isValidJsonObjectFileOrMissing(path: string): boolean {
	if (!existsSync(path)) return true;
	try {
		return isRecord(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return false;
	}
}

function isProviderReviewRole(name: string): boolean {
	return PROVIDER_REVIEW_ROLES.some((role) => role === name);
}

function reviewHostRelaySelection(
	lens: string | undefined,
	config: AgentModelConfig,
	source?: string,
): {
	selection?: string;
	thinking?: string;
	tier?: AgentRoutingEntry["tier"];
	routingKey: string;
	routingSource?: string;
	routingEntryMissing?: boolean;
} {
	const routingKey = lens === undefined || lens.length === 0 ? "review capture" : lens.startsWith("review-") ? lens : `review-${lens}`;
	const entry = config[routingKey];
	let model = typeof entry === "object" && entry !== null && typeof (entry as AgentRoutingEntry).model === "string" && (entry as AgentRoutingEntry).model!.length > 0 ? (entry as AgentRoutingEntry).model : undefined;
	let thinking = typeof entry === "object" && entry !== null && typeof (entry as AgentRoutingEntry).thinking === "string" ? (entry as AgentRoutingEntry).thinking : undefined;
	if (model === undefined && isProviderReviewRole(routingKey)) {
		const orchestrator = readProfileOrchestrator(config);
		if (orchestrator?.model !== undefined) {
			model = orchestrator.model;
			thinking ??= orchestrator.thinking;
		}
	}
	if (model === undefined && isProviderReviewRole(routingKey)) {
		const persisted = readOrchestratorSettings(orchestratorSettingsPath());
		if (persisted.status === "valid" && persisted.entry?.model !== undefined) {
			model = persisted.entry.model;
			thinking ??= persisted.entry.thinking;
		}
	}
	return {
		...(model === undefined ? {} : { selection: model }),
		...(thinking === undefined ? {} : { thinking }),
		routingKey,
		...(source === undefined ? {} : { routingSource: source, routingEntryMissing: typeof entry !== "object" || entry === null }),
	};
}

function modelAssignmentNames(cwd: string): string[] {
	return [...new Set([
		...PROVIDER_REVIEW_ROLES,
		...listDiscoverableAgents(cwd).map((agent) => agent.name),
	])];
}

const PROVIDER_ROUTING_DEFAULT_LABELS = {
	model: "Pi persisted default model",
	effort: "Pi persisted default effort",
} as const;

const NATIVE_START_LENSES = ["review-risk", "review-resilience", "review-readability", "review-reliability"] as const;

type RoutingDefaultField = keyof typeof PROVIDER_ROUTING_DEFAULT_LABELS;

function routingDefaultLabel(name: string, field: RoutingDefaultField): string {
	if (NATIVE_START_LENSES.some((lens) => lens === name)) return field === "model" ? "not configured" : "off";
	return isProviderReviewRole(name) ? PROVIDER_ROUTING_DEFAULT_LABELS[field] : "inherit";
}

function migrateLegacyProjectModelOverrides(cwd: string): number {
	const settingsPath = projectSettingsPath(cwd);
	if (!existsSync(settingsPath)) return 0;
	let settings: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
		if (!isRecord(parsed)) return 0;
		settings = { ...parsed };
	} catch {
		return 0;
	}
	const subagents = isRecord(settings.subagents) ? settings.subagents : undefined;
	const agentOverrides = isRecord(subagents?.agentOverrides)
		? subagents.agentOverrides
		: undefined;
	if (!agentOverrides) return 0;
	const agentsByName = new Map(listDiscoverableAgents(cwd).map((agent) => [agent.name, agent]));
	const migratableEntries = Object.entries(agentOverrides)
		.filter(([name]) => !isProviderReviewRole(name))
		.map(([name, value]) => ({ name, entry: normalizeRoutingEntry(value) }))
		.filter((item): item is { name: string; entry: AgentRoutingEntry } =>
			item.entry !== undefined && !isClearRoutingEntry(item.entry),
		);
	const targetPaths = new Set(
		migratableEntries.map(({ name }) =>
			agentModelProfileConfigPath(cwd, agentsByName.get(name)?.source ?? "project"),
		),
	);
	if (![...targetPaths].every(isValidJsonObjectFileOrMissing)) return 0;
	let migrated = 0;
	for (const { name, entry } of migratableEntries) {
		const source = agentsByName.get(name)?.source ?? "project";
		if (updateSubagentModelProfile(cwd, source, name, entry, { preserveExisting: true })) migrated += 1;
	}
	removeLegacyAgentOverridesFromSettings(settingsPath, settings);
	return migrated;
}

async function updateSubagentModelProfileAsync(
	cwd: string,
	source: AgentSource,
	name: string,
	entry: AgentRoutingEntry | undefined,
	options: { preserveExisting?: boolean } = {},
): Promise<boolean> {
	return updateSubagentModelProfileAtPathAsync(
		agentModelProfileConfigPath(cwd, source),
		name,
		entry,
		options,
	);
}

function isRepoAgentFile(filePath: string, cwd: string): boolean {
	const rel = relative(resolve(cwd, ".agents"), resolve(filePath));
	return !rel.startsWith("..") && !isAbsolute(rel);
}

export function applyModelConfig(
	cwd: string,
	config: AgentModelConfig,
): { updated: number; skipped: number } {
	let updated = 0;
	let skipped = 0;
	const seenAgents = new Set<string>();
	for (const agent of listDiscoverableAgents(cwd)) {
		if (isProviderReviewRole(agent.name)) continue;
		seenAgents.add(agent.name);
		const entry = config[agent.name];
		if (entry === undefined) {
			skipped += 1;
			continue;
		}
		if (agent.source === "builtin") {
			if (updateSubagentModelProfile(cwd, agent.source, agent.name, entry)) updated += 1;
			else skipped += 1;
			continue;
		}
		if (!agent.filePath || !existsSync(agent.filePath)) {
			skipped += 1;
		} else if (isRepoAgentFile(agent.filePath, cwd)) {
			skipped += 1;
		} else {
			const original = readFileSync(agent.filePath, "utf8");
			const next = updateFrontmatterRouting(original, entry);
			if (next === original) {
				skipped += 1;
			} else {
				if (!updatePackageManagedSddAgentOwnership(agent.filePath, original, next)) {
					writeFileSync(agent.filePath, next);
				}
				updated += 1;
			}
		}
		if (updateSubagentModelProfile(cwd, agent.source, agent.name, entry)) updated += 1;
		else skipped += 1;
	}
	for (const [name, entry] of Object.entries(config)) {
		if (isProviderReviewRole(name)) continue;
		// The orchestrator is routing, not an agent: its model lives in Pi's global
		// settings.json and must never reach subagents.json.
		if (isProfileOrchestratorKey(name)) continue;
		if (!seenAgents.has(name) && isClearRoutingEntry(entry)) {
			if (updateSubagentModelProfile(cwd, "user", name, entry)) updated += 1;
			else skipped += 1;
		}
	}
	return { updated, skipped };
}

export async function applyModelConfigAsync(
	cwd: string,
	config: AgentModelConfig,
): Promise<{ updated: number; skipped: number }> {
	let updated = 0;
	let skipped = 0;
	const seenAgents = new Set<string>();
	for (const agent of await listDiscoverableAgentsAsync(cwd)) {
		if (isProviderReviewRole(agent.name)) continue;
		seenAgents.add(agent.name);
		const entry = config[agent.name];
		if (entry === undefined) {
			skipped += 1;
			continue;
		}
		if (agent.source === "builtin") {
			if (await updateSubagentModelProfileAsync(cwd, agent.source, agent.name, entry))
				updated += 1;
			else skipped += 1;
			continue;
		}
		if (!agent.filePath || !(await pathExists(agent.filePath))) {
			skipped += 1;
		} else if (isRepoAgentFile(agent.filePath, cwd)) {
			skipped += 1;
		} else {
			const original = await readFile(agent.filePath, "utf8");
			const next = updateFrontmatterRouting(original, entry);
			if (next === original) {
				skipped += 1;
			} else {
				if (!updatePackageManagedSddAgentOwnership(agent.filePath, original, next)) {
					await writeFile(agent.filePath, next);
				}
				updated += 1;
			}
		}
		if (await updateSubagentModelProfileAsync(cwd, agent.source, agent.name, entry))
			updated += 1;
		else skipped += 1;
	}
	for (const [name, entry] of Object.entries(config)) {
		if (isProviderReviewRole(name)) continue;
		if (isProfileOrchestratorKey(name)) continue;
		if (!seenAgents.has(name) && isClearRoutingEntry(entry)) {
			if (await updateSubagentModelProfileAsync(cwd, "user", name, entry))
				updated += 1;
			else skipped += 1;
		}
	}
	return { updated, skipped };
}

export async function applySavedModelConfig(
	ctx: ExtensionContext,
	applyConfig: typeof applyModelConfigAsync = applyModelConfigAsync,
): Promise<{ updated: number; skipped: number; invalidPath?: string }> {
	const applyGlobalPath = modelConfigPath(ctx.cwd);
	const applyTarget = resolveCurrentProfileTarget(ctx.cwd);
	const result = applyTarget !== undefined && !existsSync(applyGlobalPath)
		? activeProfileRoutingSnapshot(ctx.cwd, applyTarget) ?? { status: "valid" as const, config: {} }
		: await readModelRoutingAuthorityAsync(applyGlobalPath, secondaryMergeSourcePath(ctx.cwd, applyTarget));
	if (result.status === "invalid") {
		return { updated: 0, skipped: 0, invalidPath: result.path };
	}
	// Startup/reload has no deletion approval. Persisted inherit entries are
	// not instructions to erase routing, even if an agent is no longer present.
	// Explicit panel saves and confirmed profile replacement still apply clears.
	const config = result.status === "valid" ? result.config : {};
	const activationConfig = Object.fromEntries(
		Object.entries(config).filter(([, entry]) => !isClearRoutingEntry(entry)),
	);
	return applyConfig(ctx.cwd, activationConfig);
}

function describeModelConfig(cwd: string, config: AgentModelConfig): string[] {
	return modelAssignmentNames(cwd).map((name) => {
		const entry = config[name];
		const model = entry?.model ?? routingDefaultLabel(name, "model");
		const thinking = entry?.thinking ?? routingDefaultLabel(name, "effort");
		return `${sanitizeTerminalText(name)}: model=${sanitizeTerminalText(model)}, effort=${sanitizeTerminalText(thinking)}`;
	});
}

async function getPiModelOptions(ctx: ExtensionContext): Promise<string[]> {
	const registry = ctx.modelRegistry;
	if (!registry) {
		return [...MODEL_CONTROL_OPTIONS];
	}
	let raw: unknown;
	try {
		raw = await registry.getAvailable();
	} catch {
		return [...MODEL_CONTROL_OPTIONS];
	}
	if (!Array.isArray(raw)) {
		return [...MODEL_CONTROL_OPTIONS];
	}
	const models = raw as { provider: string; id: string }[];
	const modelIds = models
		.map((model) => normalizeModelId(`${model.provider}/${model.id}`))
		.filter((model): model is string => model !== undefined)
		.sort((left, right) => left.localeCompare(right));
	return [...MODEL_CONTROL_OPTIONS, ...modelIds];
}

/**
 * The effort levels each catalog model supports, keyed by its provider/model id.
 * Pi clamps an unsupported level at launch, so the models screen offers only
 * these and shows where a saved level would land. Models outside the catalog
 * are absent: their levels are unknown.
 */
async function getPiThinkingSupport(ctx: ExtensionContext): Promise<Record<string, ThinkingLevel[]>> {
	const support: Record<string, ThinkingLevel[]> = {};
	let raw: unknown;
	try {
		raw = await ctx.modelRegistry?.getAvailable();
	} catch {
		return support;
	}
	if (!Array.isArray(raw)) return support;
	for (const model of raw as Parameters<typeof getSupportedThinkingLevels>[0][]) {
		const id = normalizeModelId(`${model?.provider}/${model?.id}`);
		// Without the reasoning flag the catalog says nothing about effort: the
		// model stays unknown (every level offered) rather than "off only".
		if (!id || typeof model?.reasoning !== "boolean") continue;
		try {
			support[id] = getSupportedThinkingLevels(model).filter((level): level is ThinkingLevel =>
				(THINKING_LEVELS as readonly string[]).includes(level),
			);
		} catch {
			// A model whose metadata cannot be read stays unknown.
		}
	}
	return support;
}

/**
 * Where Pi lands a requested level on a model, mirroring pi-ai's
 * clampThinkingLevel: the level itself when supported, else the nearest
 * supported level above it, else below it.
 */
function clampToSupportedLevel(level: ThinkingLevel, supported: readonly ThinkingLevel[]): ThinkingLevel {
	if (supported.includes(level)) return level;
	const start = THINKING_LEVELS.indexOf(level);
	for (let index = start + 1; index < THINKING_LEVELS.length; index += 1) {
		if (supported.includes(THINKING_LEVELS[index])) return THINKING_LEVELS[index];
	}
	for (let index = start - 1; index >= 0; index -= 1) {
		if (supported.includes(THINKING_LEVELS[index])) return THINKING_LEVELS[index];
	}
	return supported[0] ?? "off";
}

interface OverlayComponent {
	render(width: number): string[];
	handleInput(data: string): void;
	invalidate(): void;
}

interface RoutingHitRegion {
	x0: number;
	x1: number;
	y: number;
	action: RoutingTableMouseAction;
}

const LEAVE_ORCHESTRATOR_UNTOUCHED = "leave untouched";

const PANEL_TONE = {
	BORDER: "border",
	MUTED: "muted",
	DIM: "dim",
	TEXT: "text",
	TITLE: "title",
	ACCENT: "accent",
	STATUS: "status",
	EDITED: "edited",
	GOOD: "good",
	DANGER: "danger",
} as const;

type PanelTone = (typeof PANEL_TONE)[keyof typeof PANEL_TONE];

const PANEL_TONE_COLOR: Record<PanelTone, ThemeColor> = {
	border: "border",
	muted: "muted",
	dim: "dim",
	text: "text",
	title: "accent",
	accent: "accent",
	status: "thinkingHigh",
	edited: "warning",
	good: "success",
	danger: "error",
};

/** The pseudo row behind the Model ▾ / Effort ▾ header: it sets every agent at once. */
const ROUTING_ALL_ROW = "__all";
const ROUTING_CUSTOM_MODEL = "Custom model id…";
/** The table's short form of a provider review role's inherited model and effort. */
const ROUTING_PI_DEFAULT = "Pi default";
/** Body lines around the agent rows: tabs, rail, description, blank, orchestrator, rule, header, blank, footer, hints, two feedback lines. */
const ROUTING_TABLE_FIXED_ROWS = 12;
/** Compact button labels for terminals too narrow for the full ones. */
const ROUTING_TABLE_SHORT_BUTTONS: Partial<Record<RoutingTableButton, string>> = {
	use: "Use here",
	default: "Default",
};
/**
 * The key hints in display order, each with a keep priority (lower stays
 * longer): narrow terminals drop whole hints instead of cutting one in half.
 */
const ROUTING_TABLE_HINTS: Array<{ text: string; keep: number }> = [
	{ text: "←→ profile", keep: 5 },
	{ text: "↑↓ agent", keep: 6 },
	{ text: "enter model", keep: 1 },
	{ text: "e effort", keep: 2 },
	{ text: "f fallbacks", keep: 6.5 },
	{ text: "t tier", keep: 6.25 },
	// The orchestrator mode hint stands beside the tier toggle in display order;
	// its keep sits just past `u use` so it is the first hint to yield on narrow
	// terminals instead of displacing a hint the screen relies on.
	{ text: "w mode", keep: 7.25 },
	{ text: "s save", keep: 3 },
	{ text: "u use", keep: 7 },
	{ text: "d default", keep: 8 },
	{ text: "n new", keep: 10 },
	{ text: "m menu", keep: 9 },
	{ text: "esc close", keep: 4 },
	{ text: "a all fast", keep: 11 },
];
/** Model card chrome (title, search, rule, blank, hint), its borders, and a margin so the card never touches the frame. */
const ROUTING_MODEL_CARD_CHROME_ROWS = 11;

type RoutingTableAction =
	| { type: "load"; name: string }
	| { type: "custom"; target: string; config: AgentModelConfig }
	| { type: "use-session"; name: string; config?: AgentModelConfig; orchestratorMode?: OrchestratorMode }
	| { type: "apply-global"; name: string; config: AgentModelConfig }
	| { type: "save"; name: string; config: AgentModelConfig; orchestratorMode?: OrchestratorMode }
	| { type: "create" }
	| { type: "create-live" }
	| { type: "duplicate"; name: string }
	| { type: "rename"; name: string }
	| { type: "delete"; name: string }
	| { type: "export-profile"; name: string }
	| { type: "import-profile" }
	| { type: "pin"; source: ProfilePinSource; name: string }
	| { type: "close" };

/**
 * `saveFirst` asks the loop to write the draft into the shown profile before
 * running the action (the "Save and switch" answer). `draft` carries unsaved
 * edits across actions that keep the same profile on screen (rename, pin, a
 * declined delete), so managing a profile never throws away what you typed.
 */
type RoutingTableResult = RoutingTableAction & {
	saveFirst?: AgentModelConfig;
	draft?: AgentModelConfig;
	/** The mode draft riding with a switch-save so a tab change commits it too. */
	saveFirstMode?: OrchestratorMode;
	/** The unsaved mode draft carried across a reopen that keeps the routing draft (custom prompt). */
	modeDraft?: OrchestratorMode;
};

type RoutingTableButton = "use" | "default" | "save" | "switch-save" | "switch-discard" | "switch-stay";

/**
 * What the screen needs to show another profile without closing: the store
 * after an optional save, fresh scope state, and the footer line. `error`
 * means the save failed and the shown profile stays, edits intact.
 */
type RoutingProfileSwitch =
	| { file: AgentProfilesFile; sessionBoundName?: string; pinWinner?: string; notices: string[]; feedback: string }
	| { error: string };

/**
 * Switches the shown profile in place. Closing the overlay and reopening it on
 * the next tab let the terminal paint the screen beneath for a frame (and wait
 * on the async model catalog before the new frame), which is the tab flicker.
 */
type RoutingProfileSwitcher = (name: string, saveFirst?: AgentModelConfig, saveFirstMode?: OrchestratorMode) => RoutingProfileSwitch;

type RoutingTableMouseAction =
	| { kind: "tab"; name: string }
	| { kind: "tab-menu" }
	| { kind: "new" }
	| { kind: "row"; row: string }
	| { kind: "effort"; row: string }
	| { kind: "tier"; row: string }
	| { kind: "all-fast" }
	| { kind: "model-option"; index: number }
	| { kind: "effort-option"; index: number }
	| { kind: "menu-item"; id: string }
	| { kind: "button"; button: RoutingTableButton };

interface RoutingMenuItem {
	id: string;
	label: string;
	tone?: PanelTone;
}

const ROUTING_TABLE_BUTTONS: Record<RoutingTableButton, string> = {
	use: "Use in this session",
	default: "Make default",
	save: "Save",
	"switch-save": "Save and switch",
	"switch-discard": "Discard",
	"switch-stay": "Stay",
};

/**
 * The orchestrator row's mode chip, widest form first. Each form carries only
 * its mode — never a tone — because the two modes are peers, not ranks: one
 * shared tone below renders every form alike, and a later edit cannot
 * reintroduce a per-mode ranking through this table.
 */
const ORCHESTRATOR_MODE_CHIP_FORMS: Array<{ text: string; mode: OrchestratorMode }> = [
	{ text: "  ⇄ full delegation", mode: "full-delegation" },
	{ text: "  ◎ organic", mode: "organic" },
	{ text: "  ⇄ full", mode: "full-delegation" },
	{ text: "  ◎ org", mode: "organic" },
	{ text: "  ⇄", mode: "full-delegation" },
	{ text: "  ◎", mode: "organic" },
];
/** One tone for every mode form: the modes are peers, never ranked. */
const ORCHESTRATOR_MODE_CHIP_TONE: PanelTone = "status";
/**
 * The focused-Orchestrator explainer, appended to the description slot only
 * while that row is the focused one. Symmetric by construction: one line
 * states both behaviours and the key, so neither mode reads as the special
 * case. Sized to fit beside the scope sentence at 100 columns (35 chars of
 * budget on the fixtures' titles); it drops before it displaces the sentence.
 */
const ORCHESTRATOR_MODE_EXPLAINER = "◎ inline · ⇄ writer · w switches";

/**
 * `/td:profiles` — one screen, one table, profiles as
 * tabs. Each tab is a profile and carries where it is in effect (◉ this
 * session, ★ default for new sessions, ⌂ this repo); the table below is that
 * profile's routing, orchestrator first; three buttons decide where it applies.
 * Model and effort changes happen in small cards over the still-visible table.
 * Keyboard and pointer reach the same actions, and each key means one thing.
 */
/** Reads and writes the profile's fallback chains; `save` returns an error message when it refuses. */
interface RoutingFallbacks {
	chain(profile: string, key: string): readonly FallbackStep[];
	save(profile: string, key: string, chain: readonly FallbackStep[]): string | undefined;
}

/** The panel's view of profile-fallbacks.json: read once, re-read after each save; a broken file is never overwritten. */
function fileRoutingFallbacks(configHome: string): RoutingFallbacks {
	const path = fallbacksFilePath(configHome);
	let read = readFallbacksFile(path);
	return {
		chain: (profile, key) => (read.status === "valid" ? read.file.profiles[profile]?.[key] ?? [] : []),
		save: (profile, key, chain) => {
			// Chains belong to saved profiles; a draft would leave them orphaned.
			const profiles = readProfilesFileResult(profilesFilePath(configHome));
			if (profiles.status !== "valid" || !hasOwnProfile(profiles.file.profiles, profile)) return `Save the profile first (s), then add its fallbacks.`;
			read = readFallbacksFile(path);
			if (read.status === "invalid") return `${path} is malformed; fix or remove it first.`;
			try {
				writeFallbacksFile(path, setChain(read.status === "valid" ? read.file : emptyFallbacksFile(), profile, key, chain));
			} catch (error) {
				return `Fallbacks not saved: ${error instanceof Error ? error.message : String(error)}`;
			} finally {
				read = readFallbacksFile(path);
			}
			return undefined;
		},
	};
}

/** A renamed or deleted profile takes its fallback chains along; a failure leaves the chains where they were. */
function followProfileFallbacks(profilesPath: string, from: string, to: string | undefined): void {
	try { followProfileRename(dirname(profilesPath), from, to); } catch { /* The profile change already succeeded. */ }
}

class RoutingTablePanel implements OverlayComponent {
	private overlay: "model" | "effort" | "menu" | "new" | "switch" | "fallbacks" | undefined;
	/** The model and effort cards are picking a fallback step, not the row's own model. */
	private pickingFallback = false;
	private fallbackCursor = 0;
	private readonly fallbacks: RoutingFallbacks | undefined;
	private target: string = PROFILE_ORCHESTRATOR_KEY;
	private pending: RoutingTableResult | undefined;
	private cursor = 0;
	private query = "";
	private modelCursor = 0;
	private effortCursor = 0;
	private menuCursor = 0;
	private hovered: string | undefined;
	private escArmed = false;
	private feedback: string | undefined;
	private completed = false;
	private hitRegions: RoutingHitRegion[] = [];
	private activeTabColumn = 0;
	private newColumn = 0;
	private draft: AgentModelConfig;
	private stored: AgentModelConfig;
	/** The shown profile's committed and drafted orchestrator workflow; `w` drafts, a commit lands it. */
	private committedMode: OrchestratorMode;
	private modeDraft: OrchestratorMode;
	private readonly rows: string[];
	private readonly agents: string[];
	private readonly catalog: string[];
	private readonly done: (result: RoutingTableResult) => void;
	private readonly theme: Theme | undefined;
	private readonly terminalRows: (() => number) | undefined;
	private profileName: string;
	private file: AgentProfilesFile;
	private sessionBoundName: string | undefined;
	private pinWinner: string | undefined;
	private readonly thinkingSupport: Record<string, readonly ThinkingLevel[]>;
	private readonly fastModels: ReadonlySet<string>;
	/** Configuration problems the screen must not hide: pins that do not resolve, keys no agent matches. */
	private notices: string[];
	private readonly switchProfile: RoutingProfileSwitcher | undefined;

	constructor(
		draft: AgentModelConfig,
		modelOptions: string[],
		agents: string[],
		done: (result: RoutingTableResult) => void,
		theme?: Theme,
		profileName = "current",
		terminalRows?: () => number,
		options: {
			file?: AgentProfilesFile;
			sessionBoundName?: string;
			pinWinner?: string;
			feedback?: string;
			thinkingSupport?: Record<string, readonly ThinkingLevel[]>;
			fastModels?: string[];
			notices?: string[];
			switchProfile?: RoutingProfileSwitcher;
			fallbacks?: RoutingFallbacks;
			modeDraft?: OrchestratorMode;
		} = {},
	) {
		this.switchProfile = options.switchProfile;
		this.fallbacks = options.fallbacks;
		this.thinkingSupport = options.thinkingSupport ?? {};
		this.fastModels = new Set(options.fastModels ?? []);
		this.notices = options.notices ?? [];
		this.file = options.file ?? bootstrapProfilesFile(cloneModelConfig(draft));
		const names = Object.keys(this.file.profiles);
		this.profileName = hasOwnProfile(this.file.profiles, profileName) ? profileName : (names[0] ?? profileName);
		this.stored = cloneModelConfig(normalizeModelConfig(this.file.profiles[this.profileName]) ?? {});
		this.draft = cloneModelConfig(draft);
		this.committedMode = readProfileWorkflow(this.file, this.profileName).orchestratorMode;
		// A carried draft keeps its unsaved mode across the reopen; a fresh open starts at the committed mode.
		this.modeDraft = options.modeDraft ?? this.committedMode;
		this.agents = [...agents];
		this.rows = [PROFILE_ORCHESTRATOR_KEY, ROUTING_ALL_ROW, ...agents];
		// The control entries of the old panel (keep current, custom id) are not
		// models; this screen offers inherit and custom as its own options.
		this.catalog = modelOptions.filter((option) => !(MODEL_CONTROL_OPTIONS as readonly string[]).includes(option));
		this.done = done;
		this.theme = theme;
		this.terminalRows = terminalRows;
		this.sessionBoundName = options.sessionBoundName;
		this.pinWinner = options.pinWinner;
		this.feedback = options.feedback;
	}

	invalidate(): void {
		this.hovered = undefined;
	}

	// -- state ----------------------------------------------------------------

	private profileNames(): string[] {
		return Object.keys(this.file.profiles).filter((name) => hasOwnProfile(this.file.profiles, name));
	}

	private changeCount(): number {
		let count = 0;
		for (const key of [PROFILE_ORCHESTRATOR_KEY, ...this.agents]) {
			if (this.isEdited(key, "model")) count += 1;
			if (this.isEdited(key, "thinking")) count += 1;
			if (this.isEdited(key, "tier")) count += 1;
		}
		// The drafted orchestrator mode is one unsaved change, like a routing edit.
		if (this.modeDraft !== this.committedMode) count += 1;
		return count;
	}

	private isEdited(key: string, field: "model" | "thinking" | "tier"): boolean {
		return (this.draft[key]?.[field] ?? undefined) !== (this.stored[key]?.[field] ?? undefined);
	}

	private scopeGlyphs(name: string): Array<{ text: string; tone: PanelTone }> {
		const glyphs: Array<{ text: string; tone: PanelTone }> = [];
		if (this.sessionBoundName === name) glyphs.push({ text: "◉", tone: "good" });
		if (this.file.active === name) glyphs.push({ text: "★", tone: "accent" });
		if (this.pinWinner === name) glyphs.push({ text: "⌂", tone: "edited" });
		return glyphs;
	}

	private scopeSentence(name: string): string {
		const parts: string[] = [];
		if (this.sessionBoundName === name) parts.push("Used in this session.");
		if (this.file.active === name) parts.push("Default for new sessions.");
		if (this.pinWinner === name) parts.push("Used in this repo.");
		return parts.length > 0 ? parts.join(" ") : "Not in use. Pick a button below to use it.";
	}

	private rowLabel(key: string): string {
		if (key === PROFILE_ORCHESTRATOR_KEY) return "the orchestrator";
		if (key === ROUTING_ALL_ROW) return "every agent";
		return key;
	}

	private modelValue(key: string): string {
		if (key === PROFILE_ORCHESTRATOR_KEY) return this.draft[key]?.model ?? LEAVE_ORCHESTRATOR_UNTOUCHED;
		// Provider review roles inherit Pi's persisted default; the table cell says
		// so in short, the cards spell it out.
		if (isProviderReviewRole(key)) return this.draft[key]?.model ?? ROUTING_PI_DEFAULT;
		return this.draft[key]?.model ?? routingDefaultLabel(key, "model");
	}

	private effortValue(key: string): string {
		if (key === PROFILE_ORCHESTRATOR_KEY && !this.draft[key]?.model) return "";
		const thinking = this.draft[key]?.thinking;
		if (thinking === undefined) return isProviderReviewRole(key) ? ROUTING_PI_DEFAULT : routingDefaultLabel(key, "effort");
		const supported = this.supportedLevels(key);
		const landed = supported ? clampToSupportedLevel(thinking, supported) : thinking;
		return landed === thinking ? thinking : `${thinking} → ${landed}`;
	}

	/**
	 * The levels the row's model supports, from the catalog. Every agent at once
	 * offers what all their known models share. Undefined means unknown: the row
	 * inherits its model, or the model is not in the catalog.
	 */
	private supportedLevels(key: string): readonly ThinkingLevel[] | undefined {
		if (key !== ROUTING_ALL_ROW) {
			const model = this.draft[key]?.model;
			return model === undefined ? undefined : this.thinkingSupport[model];
		}
		const known = this.agents
			.map((agent) => this.draft[agent]?.model)
			.map((model) => (model === undefined ? undefined : this.thinkingSupport[model]))
			.filter((levels): levels is readonly ThinkingLevel[] => levels !== undefined);
		if (known.length === 0) return undefined;
		return THINKING_LEVELS.filter((level) => known.every((levels) => levels.includes(level)));
	}

	/** The effort card's choices: inherit, then the supported levels, or every level when unknown. */
	private effortOptions(): Array<ThinkingLevel | typeof INHERIT_THINKING> {
		const step = this.pickingFallback ? this.chain()[this.fallbackCursor] : undefined;
		const supported = step ? this.thinkingSupport[step.model] : this.supportedLevels(this.target);
		return [INHERIT_THINKING, ...THINKING_LEVELS.filter((level) => !supported || supported.includes(level))];
	}

	/** The value the picker marks as current: one agent's, or every agent's when they agree. */
	private currentValue(key: string, field: "model" | "thinking"): string | undefined {
		if (key === ROUTING_ALL_ROW) {
			const values = this.agents.map((agent) => this.draft[agent]?.[field]);
			return values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined;
		}
		return this.draft[key]?.[field];
	}

	private inheritLabel(key: string): string {
		if (key === PROFILE_ORCHESTRATOR_KEY) return LEAVE_ORCHESTRATOR_UNTOUCHED;
		if (key !== ROUTING_ALL_ROW) return routingDefaultLabel(key, "model");
		return "inherit";
	}

	private modelOptions(): string[] {
		const query = this.query.trim().toLowerCase();
		if (this.pickingFallback) {
			// Only real models, never the row's own one or one already in the chain.
			const taken = new Set([...this.chain().map((step) => step.model), ...this.targetKeys().map((key) => this.draft[key]?.model)]);
			const offered = this.catalog.filter((option) => !taken.has(option));
			return query ? offered.filter((option) => option.toLowerCase().includes(query)) : offered;
		}
		const all = [this.inheritLabel(this.target), ...this.catalog];
		const matches = query ? all.filter((option) => option.toLowerCase().includes(query)) : all;
		return [...matches, ROUTING_CUSTOM_MODEL];
	}

	private menuItems(): RoutingMenuItem[] {
		if (this.overlay === "new") {
			return [
				{ id: "new-copy", label: `Copy of ${this.profileName}` },
				{ id: "new-live", label: "From what's running now" },
				{ id: "new-empty", label: "Empty", tone: "muted" },
			];
		}
		return [
			{ id: "rename", label: "Rename" },
			{ id: "duplicate", label: "Duplicate" },
			{ id: "repo", label: this.pinWinner === this.profileName ? "Stop using in this repo" : "Use in this repo" },
			{ id: "delete", label: "Delete", tone: "danger" },
		];
	}

	// -- actions ----------------------------------------------------------------

	private finish(result: RoutingTableResult): void {
		if (this.completed) return;
		if (result.type === "load" && this.switchProfile) {
			this.showProfile(result.name, result.saveFirst, result.saveFirstMode);
			return;
		}
		this.completed = true;
		this.done(result);
	}

	/** Replaces the shown profile on this same screen, as a fresh open on that tab would. */
	private showProfile(name: string, saveFirst?: AgentModelConfig, saveFirstMode?: OrchestratorMode): void {
		const next = this.switchProfile!(name, saveFirst, saveFirstMode);
		this.closeOverlay();
		if ("error" in next) {
			this.say(next.error);
			return;
		}
		this.file = next.file;
		this.profileName = hasOwnProfile(this.file.profiles, name) ? name : (this.profileNames()[0] ?? name);
		this.stored = cloneModelConfig(normalizeModelConfig(this.file.profiles[this.profileName]) ?? {});
		this.draft = cloneModelConfig(this.stored);
		this.committedMode = readProfileWorkflow(this.file, this.profileName).orchestratorMode;
		this.modeDraft = this.committedMode;
		this.sessionBoundName = next.sessionBoundName;
		this.pinWinner = next.pinWinner;
		this.notices = next.notices;
		this.target = PROFILE_ORCHESTRATOR_KEY;
		this.cursor = 0;
		this.hovered = undefined;
		this.feedback = next.feedback;
		this.escArmed = false;
	}

	private say(message: string): void {
		this.feedback = message;
		this.escArmed = false;
	}

	private closeOverlay(): void {
		this.overlay = this.pickingFallback ? "fallbacks" : undefined;
		this.pickingFallback = false;
		this.pending = undefined;
		this.query = "";
	}

	// -- fallback chains --------------------------------------------------------

	/** The chain key of a row: the every-agent row edits the profile's `*` chain. */
	private chainKey(row: string): string {
		return row === ROUTING_ALL_ROW ? "*" : row;
	}

	private chain(row = this.target): FallbackStep[] {
		return [...(this.fallbacks?.chain(this.profileName, this.chainKey(row)) ?? [])].map((step) => ({ ...step }));
	}

	private saveChain(chain: FallbackStep[], message: string): boolean {
		const error = this.fallbacks?.save(this.profileName, this.chainKey(this.target), chain);
		if (error) {
			this.say(error);
			return false;
		}
		this.say(message);
		return true;
	}

	private openFallbacks(row: string): void {
		if (!this.fallbacks) return this.say("Fallback chains are unavailable here.");
		this.target = row;
		this.overlay = "fallbacks";
		this.fallbackCursor = 0;
	}

	private handleFallbacksKey(data: string): void {
		const chain = this.chain();
		const label = this.rowLabel(this.target);
		if (matchesKey(data, "escape")) {
			this.overlay = undefined;
			return;
		}
		if (matchesKey(data, "shift+up") || matchesKey(data, "shift+down")) {
			const to = this.fallbackCursor + (matchesKey(data, "shift+up") ? -1 : 1);
			if (to < 0 || to >= chain.length) return;
			const [step] = chain.splice(this.fallbackCursor, 1);
			chain.splice(to, 0, step!);
			if (this.saveChain(chain, `${label}: ${step!.model} is fallback ${to + 1}.`)) this.fallbackCursor = to;
			return;
		}
		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			this.fallbackCursor = Math.max(0, this.fallbackCursor - 1);
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.fallbackCursor = Math.min(Math.max(0, chain.length - 1), this.fallbackCursor + 1);
			return;
		}
		if (matchesKey(data, "f") || matchesKey(data, "a") || matchesKey(data, "return")) {
			this.pickingFallback = true;
			this.overlay = "model";
			this.query = "";
			this.modelCursor = 0;
			if (this.modelOptions().length === 0) {
				this.closeOverlay();
				this.say(`${label}: every model is already in its chain.`);
			}
			return;
		}
		if (matchesKey(data, "e") && chain[this.fallbackCursor]) {
			this.pickingFallback = true;
			this.overlay = "effort";
			const current = chain[this.fallbackCursor]!.thinking;
			this.effortCursor = Math.max(0, current === undefined ? 0 : this.effortOptions().indexOf(current));
			return;
		}
		if ((matchesKey(data, "x") || matchesKey(data, "delete")) && chain[this.fallbackCursor]) {
			const [removed] = chain.splice(this.fallbackCursor, 1);
			if (this.saveChain(chain, `${label}: removed fallback ${removed!.model}.`)) this.fallbackCursor = Math.max(0, Math.min(this.fallbackCursor, chain.length - 1));
		}
	}

	private fallbacksCard(inner: number): { lines: string[]; width: number; top: number; left: number } {
		const width = Math.min(60, inner - 4);
		const content = width - 4;
		const chain = this.chain();
		const lines: string[] = [];
		lines.push(this.renderText("Fallbacks for ", "muted") + this.renderText(this.target === ROUTING_ALL_ROW ? "every agent" : this.rowLabel(this.target), "title"));
		lines.push(this.renderText(truncateToWidth("Used in order when the model runs out or keeps failing.", content, "…"), "dim"));
		lines.push(this.renderText("─".repeat(content), "border"));
		if (chain.length === 0) lines.push(this.renderText(this.target === ROUTING_ALL_ROW ? "No fallbacks. f adds one for every agent without its own." : "No fallbacks. f adds one.", "dim"));
		chain.forEach((step, index) => {
			const focused = index === this.fallbackCursor;
			const text = truncateToWidth(`${index + 1}. ${sanitizeTerminalText(step.model)}${step.thinking ? ` · ${step.thinking}` : ""}`, content - 2, "…");
			lines.push(this.renderText(focused ? "▸ " : "  ", "accent") + this.renderText(text, focused ? "title" : "text"));
		});
		lines.push("");
		lines.push(this.renderText(truncateToWidth("f add · e effort · shift+↑↓ move · x remove · esc back", content, "…"), "dim"));
		return { lines, width, top: 4, left: Math.max(0, Math.floor((inner - width) / 2)) };
	}

	/** Leaving this profile with unsaved edits asks first; nothing is lost in silence. */
	private leave(result: RoutingTableResult): void {
		if (this.changeCount() === 0) {
			this.finish(result);
			return;
		}
		this.pending = result;
		this.overlay = "switch";
	}

	private switchTab(name: string): void {
		if (name === this.profileName) return;
		this.leave({ type: "load", name });
	}

	private switchBy(delta: number): void {
		const names = this.profileNames();
		const index = names.indexOf(this.profileName);
		const next = names[Math.max(0, Math.min(names.length - 1, index + delta))];
		if (next) this.switchTab(next);
	}

	private openModel(key: string): void {
		this.target = key;
		this.overlay = "model";
		this.query = "";
		const options = this.modelOptions();
		const current = this.currentValue(key, "model") ?? (key === ROUTING_ALL_ROW ? undefined : this.inheritLabel(key));
		this.modelCursor = Math.max(0, current === undefined ? 0 : options.indexOf(current));
	}

	private openEffort(key: string): void {
		if (key === PROFILE_ORCHESTRATOR_KEY && !this.draft[key]?.model) {
			this.say("Pick a model for the orchestrator first; its effort follows the model.");
			return;
		}
		this.target = key;
		this.overlay = "effort";
		const current = this.currentValue(key, "thinking") as ThinkingLevel | undefined;
		const supported = this.supportedLevels(key);
		const landed = current !== undefined && supported ? clampToSupportedLevel(current, supported) : current;
		this.effortCursor = Math.max(0, landed === undefined ? 0 : this.effortOptions().indexOf(landed));
	}

	private toggleTier(key: string): void {
		const entry = this.draft[key];
		if (!entry?.model || !this.fastModels.has(entry.model)) {
			this.say("Standard/Fast is available only for compatible OpenAI models.");
			return;
		}
		entry.tier = entry.tier === "fast" ? "standard" : "fast";
		this.say(`${this.rowLabel(key)}: ${entry.tier === "fast" ? "Fast" : "Standard"}. Save keeps it in ${this.profileName}.${entry.tier === "fast" ? " Fast depends on plan/model; subscription usage 2.5x or purchased credits 2x. API pricing differs." : ""}`);
	}

	/** `w` drafts the shown profile's orchestrator workflow; saving or using the profile commits it. */
	private toggleOrchestratorMode(): void {
		this.modeDraft = this.modeDraft === "full-delegation" ? "organic" : "full-delegation";
		this.say(`Orchestrator mode ${this.modeDraft}. Save keeps it in ${this.profileName}.`);
	}

	private setAllFast(): void {
		let count = 0;
		for (const key of [PROFILE_ORCHESTRATOR_KEY, ...this.agents]) {
			const entry = this.draft[key];
			if (!entry?.model || !this.fastModels.has(entry.model)) continue;
			if (entry.tier !== "fast") this.toggleTier(key);
			count += 1;
		}
		this.say(count
			? `All Fast: ${count} compatible route${count === 1 ? "" : "s"}. Save to keep. Subscription 2.5x; purchased credits 2x. API pricing differs.`
			: "No compatible OpenAI routes in this profile.");
	}

	private openMenu(kind: "menu" | "new"): void {
		this.overlay = kind;
		this.menuCursor = 0;
	}

	private pickModel(option: string | undefined): void {
		if (option === undefined) return;
		if (this.pickingFallback) {
			const chain = [...this.chain(), { model: option }];
			if (this.saveChain(chain, `${this.rowLabel(this.target)}: fallback ${chain.length} is ${option}.`)) this.fallbackCursor = chain.length - 1;
			this.closeOverlay();
			return;
		}
		if (option === ROUTING_CUSTOM_MODEL) {
			this.finish({ type: "custom", target: this.target, config: cloneModelConfig(this.draft), modeDraft: this.modeDraft });
			return;
		}
		const model = option === this.inheritLabel(this.target) ? undefined : option;
		for (const key of this.targetKeys()) this.setModel(key, model);
		this.say(`${this.rowLabel(this.target)}: model ${model ?? this.inheritLabel(this.target)}. Save keeps it in ${this.profileName}.`);
		this.closeOverlay();
	}

	private pickEffort(index: number): void {
		const option = this.effortOptions()[index];
		if (option === undefined) return;
		const thinking = option === INHERIT_THINKING ? undefined : (option as ThinkingLevel);
		if (this.pickingFallback) {
			const chain = this.chain();
			const step = chain[this.fallbackCursor];
			if (step) {
				chain[this.fallbackCursor] = thinking ? { model: step.model, thinking } : { model: step.model };
				this.saveChain(chain, `${this.rowLabel(this.target)}: ${step.model} effort ${thinking ?? "inherit"}.`);
			}
			this.closeOverlay();
			return;
		}
		for (const key of this.targetKeys()) this.setThinking(key, thinking);
		this.say(`${this.rowLabel(this.target)}: effort ${thinking ?? "inherit"}. Save keeps it in ${this.profileName}.`);
		this.closeOverlay();
	}

	private targetKeys(): string[] {
		return this.target === ROUTING_ALL_ROW ? this.agents : [this.target];
	}

	private setModel(key: string, model: string | undefined): void {
		if (key === PROFILE_ORCHESTRATOR_KEY && model === undefined) {
			delete this.draft[key];
			return;
		}
		const entry = { ...(this.draft[key] ?? {}) };
		if (model !== entry.model) delete entry.tier;
		if (model === undefined) delete entry.model;
		else entry.model = model;
		this.draft[key] = entry.model || entry.thinking ? entry : {};
	}

	private setThinking(key: string, thinking: ThinkingLevel | undefined): void {
		if (key === PROFILE_ORCHESTRATOR_KEY && !this.draft[key]?.model) return;
		const entry = { ...(this.draft[key] ?? {}) };
		if (thinking === undefined) delete entry.thinking;
		else entry.thinking = thinking;
		this.draft[key] = entry.model || entry.thinking ? entry : {};
	}

	private runMenuItem(id: string): void {
		const name = this.profileName;
		const draft = cloneModelConfig(this.draft);
		switch (id) {
			case "rename":
				this.finish({ type: "rename", name, draft });
				return;
			case "duplicate":
			case "new-copy":
				this.closeOverlay();
				this.leave({ type: "duplicate", name });
				return;
			case "repo":
				this.finish({ type: "pin", source: "local", name, draft });
				return;
			case "delete":
				this.finish({ type: "delete", name, draft });
				return;
			case "new-live":
				this.closeOverlay();
				this.leave({ type: "create-live" });
				return;
			case "new-empty":
				this.closeOverlay();
				this.leave({ type: "create" });
				return;
		}
	}

	private pressButton(button: RoutingTableButton): void {
		const config = cloneModelConfig(this.draft);
		switch (button) {
			case "use":
				this.finish({ type: "use-session", name: this.profileName, config, orchestratorMode: this.modeDraft });
				return;
			case "default":
				this.finish({ type: "apply-global", name: this.profileName, config });
				return;
			case "save":
				if (this.changeCount() === 0) {
					this.say("Nothing to save.");
					return;
				}
				this.finish({ type: "save", name: this.profileName, config, orchestratorMode: this.modeDraft });
				return;
			case "switch-save":
				if (this.pending) this.finish({ ...this.pending, saveFirst: config, saveFirstMode: this.modeDraft });
				return;
			case "switch-discard":
				if (this.pending) this.finish(this.pending);
				return;
			case "switch-stay":
				this.closeOverlay();
				return;
		}
	}

	// -- keyboard ----------------------------------------------------------------

	handleInput(data: string): void {
		if (isKeyRelease(data)) return;
		if (matchesKey(data, "ctrl+c")) {
			this.finish({ type: "close" });
			return;
		}
		switch (this.overlay) {
			case "model":
				this.handleModelKey(data);
				return;
			case "effort":
				this.handleEffortKey(data);
				return;
			case "menu":
			case "new":
				this.handleMenuKey(data);
				return;
			case "switch":
				this.handleSwitchKey(data);
				return;
			case "fallbacks":
				this.handleFallbacksKey(data);
				return;
			default:
				this.handleTableKey(data);
		}
	}

	private handleTableKey(data: string): void {
		if (matchesKey(data, "escape")) {
			if (this.changeCount() > 0 && !this.escArmed) {
				this.feedback = "Unsaved changes. Press esc again to close without saving.";
				this.escArmed = true;
				return;
			}
			this.finish({ type: "close" });
			return;
		}
		this.escArmed = false;
		if (matchesKey(data, "left")) return this.switchBy(-1);
		if (matchesKey(data, "right")) return this.switchBy(1);
		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			this.cursor = Math.max(0, this.cursor - 1);
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.cursor = Math.min(this.rows.length - 1, this.cursor + 1);
			return;
		}
		if (matchesKey(data, "return")) return this.openModel(this.rows[this.cursor] ?? PROFILE_ORCHESTRATOR_KEY);
		if (matchesKey(data, "e")) return this.openEffort(this.rows[this.cursor] ?? PROFILE_ORCHESTRATOR_KEY);
		if (matchesKey(data, "f")) return this.openFallbacks(this.rows[this.cursor] ?? PROFILE_ORCHESTRATOR_KEY);
		if (matchesKey(data, "t")) return this.toggleTier(this.rows[this.cursor] ?? PROFILE_ORCHESTRATOR_KEY);
		if (matchesKey(data, "w")) return this.toggleOrchestratorMode();
		if (matchesKey(data, "a")) return this.setAllFast();
		if (matchesKey(data, "s") || matchesKey(data, "ctrl+s")) return this.pressButton("save");
		if (matchesKey(data, "u")) return this.pressButton("use");
		if (matchesKey(data, "d")) return this.pressButton("default");
		if (matchesKey(data, "n")) return this.openMenu("new");
		if (matchesKey(data, "m")) return this.openMenu("menu");
	}

	private handleModelKey(data: string): void {
		const options = this.modelOptions();
		if (matchesKey(data, "escape")) return this.closeOverlay();
		if (matchesKey(data, "return")) return this.pickModel(options[this.modelCursor]);
		if (matchesKey(data, "up")) {
			this.modelCursor = Math.max(0, this.modelCursor - 1);
			return;
		}
		if (matchesKey(data, "down")) {
			this.modelCursor = Math.min(options.length - 1, this.modelCursor + 1);
			return;
		}
		if (matchesKey(data, "backspace")) {
			this.query = this.query.slice(0, -1);
			this.modelCursor = 0;
			return;
		}
		// Every printable key types into the search, so letters never act here.
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.query += data;
			this.modelCursor = 0;
		}
	}

	private handleEffortKey(data: string): void {
		if (matchesKey(data, "escape")) return this.closeOverlay();
		if (matchesKey(data, "return")) return this.pickEffort(this.effortCursor);
		if (matchesKey(data, "left") || matchesKey(data, "up")) {
			this.effortCursor = Math.max(0, this.effortCursor - 1);
			return;
		}
		if (matchesKey(data, "right") || matchesKey(data, "down")) {
			this.effortCursor = Math.min(this.effortOptions().length - 1, this.effortCursor + 1);
		}
	}

	private handleMenuKey(data: string): void {
		const items = this.menuItems();
		if (matchesKey(data, "escape")) return this.closeOverlay();
		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			this.menuCursor = Math.max(0, this.menuCursor - 1);
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.menuCursor = Math.min(items.length - 1, this.menuCursor + 1);
			return;
		}
		if (matchesKey(data, "return")) {
			const item = items[this.menuCursor];
			if (item) this.runMenuItem(item.id);
		}
	}

	private handleSwitchKey(data: string): void {
		if (matchesKey(data, "escape")) return this.pressButton("switch-stay");
		if (matchesKey(data, "s") || matchesKey(data, "return")) return this.pressButton("switch-save");
		if (matchesKey(data, "d")) return this.pressButton("switch-discard");
	}

	// -- pointer ----------------------------------------------------------------

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type === "wheel" && event.wheelDelta) {
			const delta = event.wheelDelta < 0 ? -1 : 1;
			if (this.overlay === "model") {
				this.modelCursor = Math.max(0, Math.min(this.modelOptions().length - 1, this.modelCursor + delta));
			} else if (this.overlay === "effort") {
				this.effortCursor = Math.max(0, Math.min(this.effortOptions().length - 1, this.effortCursor + delta));
			} else if (this.overlay === "menu" || this.overlay === "new") {
				this.menuCursor = Math.max(0, Math.min(this.menuItems().length - 1, this.menuCursor + delta));
			} else if (this.overlay === undefined) {
				this.cursor = Math.max(0, Math.min(this.rows.length - 1, this.cursor + delta));
			}
			return { handled: true, render: true };
		}
		const exact = this.hitRegions.find(
			(region) => region.y === event.y && event.x >= region.x0 && event.x < region.x1,
		);
		if (event.type === "move") {
			if (event.button !== "none") return undefined;
			// Whole-row targets light up anywhere on their line; buttons and tabs
			// only under the pointer.
			const hit = exact ?? this.hitRegions.find((region) => region.y === event.y && this.isRowAction(region.action));
			const next = hit ? this.hoverKey(hit.action) : undefined;
			const changed = next !== this.hovered;
			this.hovered = next;
			return { handled: hit !== undefined, render: changed };
		}
		// A click arrives as press then click: the press only claims the pointer,
		// so one click never runs two actions.
		if (event.type === "press") return exact ? { handled: true } : undefined;
		if (event.type !== "click" || event.button !== "left") return undefined;
		if (!exact) {
			if (this.overlay !== undefined && this.overlay !== "switch") {
				this.closeOverlay();
				return { handled: true, render: true };
			}
			return undefined;
		}
		this.dispatch(exact.action);
		return { handled: true, render: true };
	}

	private isRowAction(action: RoutingTableMouseAction): boolean {
		return action.kind === "row" || action.kind === "model-option" || action.kind === "menu-item";
	}

	private hoverKey(action: RoutingTableMouseAction): string {
		switch (action.kind) {
			case "row":
			case "effort":
			case "tier":
				return `row:${action.row}`;
			case "tab":
				return `tab:${action.name}`;
			case "model-option":
			case "effort-option":
				return `${action.kind}:${action.index}`;
			case "menu-item":
				return `menu:${action.id}`;
			case "button":
				return `button:${action.button}`;
			default:
				return action.kind;
		}
	}

	private dispatch(action: RoutingTableMouseAction): void {
		switch (action.kind) {
			case "tab":
				this.switchTab(action.name);
				return;
			case "tab-menu":
				this.openMenu("menu");
				return;
			case "new":
				this.openMenu("new");
				return;
			case "row":
				this.cursor = Math.max(0, this.rows.indexOf(action.row));
				this.openModel(action.row);
				return;
			case "effort":
				this.cursor = Math.max(0, this.rows.indexOf(action.row));
				this.openEffort(action.row);
				return;
			case "tier":
				this.cursor = Math.max(0, this.rows.indexOf(action.row));
				this.toggleTier(action.row);
				return;
			case "all-fast":
				this.setAllFast();
				return;
			case "model-option":
				this.pickModel(this.modelOptions()[action.index]);
				return;
			case "effort-option":
				this.pickEffort(action.index);
				return;
			case "menu-item":
				this.runMenuItem(action.id);
				return;
			case "button":
				this.pressButton(action.button);
				return;
		}
	}

	// -- render ----------------------------------------------------------------

	render(width: number): string[] {
		this.hitRegions = [];
		const inner = Math.max(20, width - 4);
		if (this.overlay === undefined) return this.renderFrame(this.tableLines(inner), width);
		// The table stays on screen, dimmed, under the card; its regions are
		// dropped because the card is modal.
		const table = this.tableLines(inner).map((line) => this.renderText(stripAnsi(line), "dim"));
		this.hitRegions = [];
		const card = this.cardFor(inner);
		return this.renderFrame(this.placeCard(table, card, inner), width);
	}

	private renderFrame(body: string[], width: number): string[] {
		const inner = Math.max(20, width - 4);
		const rows = this.terminalRows ? Math.floor(this.terminalRows()) - 2 : body.length;
		const padded = body.length < rows ? [...body, ...Array<string>(rows - body.length).fill("")] : body.slice(0, Math.max(rows, 1));
		const rule = "─".repeat(inner + 2);
		const border = (text: string) => this.renderText(text, "border");
		return [
			border(`╭${rule}╮`),
			...padded.map((line) => `${border("│")} ${this.fit(line, inner)} ${border("│")}`),
			border(`╰${rule}╯`),
		];
	}

	private tableLines(inner: number): string[] {
		const lines: string[] = [];
		// Regions are recorded in frame coordinates: the top border is row 0 and
		// content starts two columns in ("│ ").
		const region = (action: RoutingTableMouseAction, x0: number, x1: number) =>
			this.hitRegions.push({ y: lines.length + 1, x0: 2 + x0, x1: 2 + x1, action });

		// Tabs: every profile, its scopes, the menu on the active one, and New.
		const tabs = this.tabWindow(inner);
		let column = 0;
		let tabLine = "";
		let activeStart = 0;
		let activeEnd = 0;
		const put = (text: string, tone: PanelTone | undefined, action?: RoutingTableMouseAction) => {
			if (action) region(action, column, column + visibleWidth(text));
			const styled = tone ? this.renderText(text, tone) : sanitizeTerminalText(text);
			tabLine += action ? this.hoverWrap(this.hoverKey(action), styled, text) : styled;
			column += visibleWidth(text);
		};
		put(" ", undefined);
		if (tabs.before) put("‹ ", "dim");
		for (const name of tabs.names) {
			const active = name === this.profileName;
			if (active) activeStart = column;
			put(` ${truncateToWidth(sanitizeTerminalText(name), 18, "…")} `, active ? "title" : "muted", { kind: "tab", name });
			for (const glyph of this.scopeGlyphs(name)) put(glyph.text, glyph.tone);
			if (active) {
				put(" ▾ ", "accent", { kind: "tab-menu" });
				activeEnd = column;
				this.activeTabColumn = activeStart;
			}
			put("  ", undefined);
		}
		if (tabs.after) put("› ", "dim");
		this.newColumn = column;
		put("+ New", "accent", { kind: "new" });
		lines.push(tabLine);
		lines.push(
			this.renderText("─".repeat(activeStart), "border")
				+ this.renderText("━".repeat(Math.max(0, activeEnd - activeStart)), "accent")
				+ this.renderText("─".repeat(Math.max(0, inner - activeEnd)), "border"),
		);
		const title = truncateToWidth(sanitizeTerminalText(this.profileName), Math.max(8, inner - 4), "…");
		const room = inner - 1 - visibleWidth(title) - 3;
		const sentence = [this.scopeSentence(this.profileName), this.shortScope(this.profileName)]
			.find((candidate) => visibleWidth(candidate) <= room) ?? "";
		// While the Orchestrator row is the focused row, the description slot also
		// states what each orchestrator mode does — the same line for both modes.
		// It appends after the scope sentence and yields to it: it never displaces
		// the sentence nor wraps the line into an extra body row.
		let described = sentence;
		if (this.rows[this.cursor] === PROFILE_ORCHESTRATOR_KEY) {
			const combined = described ? `${described}   ${ORCHESTRATOR_MODE_EXPLAINER}` : ORCHESTRATOR_MODE_EXPLAINER;
			if (visibleWidth(combined) <= room) described = combined;
		}
		lines.push(` ${this.renderText(title, "title")}${described ? `   ${this.renderText(described, "muted")}` : ""}`);
		const notices = this.noticeLines(inner);
		for (const notice of notices) lines.push(this.renderText(notice, "edited"));
		lines.push("");

		// Labels are measured after sanitizing: control sequences in an agent name
		// would otherwise pad the column and then vanish, gluing name and model.
		const agentCol = Math.min(26, Math.max("Orchestrator".length, ...this.agents.map((agent) => visibleWidth(sanitizeTerminalText(agent)))) + 2);
		const padLabel = (text: string) => {
			const safe = truncateToWidth(sanitizeTerminalText(text), agentCol - 1, "…");
			return safe + " ".repeat(Math.max(0, agentCol - visibleWidth(safe)));
		};
		const tierRoom = Object.values(this.draft).some((entry) => entry.model && this.fastModels.has(entry.model)) ? 12 : 0;
		const modelCol = Math.max(20, Math.min(40, inner - agentCol - 12 - tierRoom));
		const effortStart = 2 + agentCol + modelCol;
		const row = (key: string, label: string, labelTone: PanelTone) => {
			const focused = this.rows[this.cursor] === key;
			const model = this.modelValue(key);
			const effort = this.effortValue(key);
			const tier = this.draft[key]?.model && this.fastModels.has(this.draft[key]!.model!) ? `  ${this.draft[key]?.tier === "fast" ? "Fast" : "Standard"} ▾` : "";
			// The shown profile's orchestrator mode is a read-only chip on its row.
			// It sits after the fallback chain, not between the tier and the chain:
			// that adjacency is existing, asserted behaviour of the row, and a new
			// reference does not get to move it. The chain therefore keeps the room it
			// always had, and the chip degrades its own wording before it disappears so
			// the mode stays readable beside a tier. No mouse region: it is a reference.
			const modelTone: PanelTone = this.isEdited(key, "model")
				? "edited"
				: model === LEAVE_ORCHESTRATOR_UNTOUCHED || model === "inherit" || model === ROUTING_PI_DEFAULT ? "dim" : "text";
			const effortTone: PanelTone = this.isEdited(key, "thinking") ? "edited" : effort === "inherit" || effort === ROUTING_PI_DEFAULT ? "dim" : "status";
			const chain = this.fallbacks ? this.chain(key) : [];
			const chips = key === PROFILE_ORCHESTRATOR_KEY
				? ORCHESTRATOR_MODE_CHIP_FORMS.filter((form) => form.mode === this.modeDraft)
				: [];
			// The chip is a reference the profile always shows, so the chain is sized
			// around its shortest WORD form (the ladder's second rung) instead of the
			// chip competing for whatever is left. A truncatable chain yielding a few
			// columns is cheaper than a mode that silently disappears.
			const reserved = chips.length > 1 ? visibleWidth(chips[1]!.text) : 0;
			const room = inner - effortStart - visibleWidth(effort + tier) - reserved - 3;
			const fallback = chain.length && room > 4 ? truncateToWidth(`↪ ${sanitizeTerminalText(chain[0]!.model)}${chain.length > 1 ? ` +${chain.length - 1}` : ""}`, room, "…") : "";
			const chipRoom = inner - effortStart - visibleWidth(effort + tier) - (fallback ? visibleWidth(fallback) + 3 : 0);
			const chip = chips.find((form) => visibleWidth(form.text) <= chipRoom);
			const plain = `${focused ? "▸ " : "  "}${padLabel(label)}${truncateToWidth(model, modelCol - 1, "…").padEnd(modelCol)}${effort}${tier}${fallback ? `   ${fallback}` : ""}${chip?.text ?? ""}`;
			const styled =
				this.renderText(focused ? "▸ " : "  ", "accent")
				+ this.renderText(padLabel(label), labelTone)
				+ this.renderText(truncateToWidth(model, modelCol - 1, "…").padEnd(modelCol), modelTone)
				+ this.renderText(effort, effortTone)
				+ this.renderText(tier, this.isEdited(key, "tier") ? "edited" : "status")
				+ (fallback ? `   ${this.renderText(fallback, "dim")}` : "")
				+ (chip ? this.renderText(chip.text, ORCHESTRATOR_MODE_CHIP_TONE) : "");
			if (tier) region({ kind: "tier", row: key }, effortStart + visibleWidth(effort), Math.min(inner, effortStart + visibleWidth(effort + tier)));
			if (effort) region({ kind: "effort", row: key }, effortStart, inner);
			region({ kind: "row", row: key }, 0, inner);
			lines.push(this.hoverWrap(`row:${key}`, styled, plain, inner));
		};

		row(PROFILE_ORCHESTRATOR_KEY, "Orchestrator", "title");
		lines.push(` ${this.renderText("─".repeat(Math.max(0, effortStart + 8 - 1)), "border")}`);

		// The header doubles as the "every agent" row: Model ▾ and Effort ▾.
		const headerFocused = this.rows[this.cursor] === ROUTING_ALL_ROW;
		const headerBase = `${headerFocused ? "▸ " : "  "}${"Agent".padEnd(agentCol)}${"Model ▾".padEnd(modelCol)}Effort ▾`;
		const allFast = tierRoom && visibleWidth(`${headerBase}  All Fast`) <= inner ? "  All Fast" : "";
		const headerNote = visibleWidth(`${headerBase}${allFast}   set every agent`) <= inner ? "   set every agent" : "";
		const headerPlain = `${headerBase}${allFast}${headerNote}`;
		region({ kind: "effort", row: ROUTING_ALL_ROW }, effortStart, effortStart + "Effort ▾".length);
		if (allFast) region({ kind: "all-fast" }, visibleWidth(headerBase), visibleWidth(headerBase + allFast));
		region({ kind: "row", row: ROUTING_ALL_ROW }, 0, inner);
		lines.push(
			this.hoverWrap(
				`row:${ROUTING_ALL_ROW}`,
				this.renderText(headerFocused ? "▸ " : "  ", "accent")
					+ this.renderText("Agent".padEnd(agentCol), "muted")
					+ this.renderText("Model ▾".padEnd(modelCol), "muted")
					+ this.renderText("Effort ▾", "muted")
					+ (allFast ? this.hoverWrap("all-fast", this.renderText(allFast, "accent"), allFast) : "")
					+ this.renderText(headerNote, "dim"),
				headerPlain,
				inner,
			),
		);

		const window = this.agentWindow(notices.length);
		if (window.start > 0) lines.push(this.renderText(`  ↑ ${window.start} more`, "dim"));
		for (const agent of this.agents.slice(window.start, window.end)) row(agent, agent, "text");
		if (window.end < this.agents.length) lines.push(this.renderText(`  ↓ ${this.agents.length - window.end} more`, "dim"));
		lines.push("");

		// Footer: three buttons, the unsaved count on the right.
		const changes = this.changeCount();
		const status = changes > 0 ? `● ${changes} unsaved` : "Saved";
		const buttonsWidth = (labels: (id: RoutingTableButton) => string) =>
			1 + (["use", "default", "save"] as const).reduce((sum, id) => sum + labels(id).length + 6, 0);
		const keyed = (id: RoutingTableButton, text: string) => `${id === "use" ? "u" : id === "default" ? "d" : "s"} · ${text}`;
		const fullLabel = (id: RoutingTableButton) => keyed(id, ROUTING_TABLE_BUTTONS[id]);
		const shortLabel = (id: RoutingTableButton) => keyed(id, ROUTING_TABLE_SHORT_BUTTONS[id] ?? ROUTING_TABLE_BUTTONS[id]);
		const label = buttonsWidth(fullLabel) + status.length + 1 <= inner ? fullLabel : shortLabel;
		let footer = "";
		let footerColumn = 0;
		const button = (id: RoutingTableButton, tone: PanelTone) => {
			const text = `[ ${label(id)} ]`;
			region({ kind: "button", button: id }, footerColumn, footerColumn + text.length);
			footer += this.hoverWrap(`button:${id}`, this.renderText(text, tone), text);
			footer += "  ";
			footerColumn += text.length + 2;
		};
		footer += " ";
		footerColumn += 1;
		button("use", "accent");
		button("default", "accent");
		button("save", changes > 0 ? "title" : "dim");
		const gap = Math.max(1, inner - footerColumn - status.length - 1);
		lines.push(footer + " ".repeat(gap) + this.renderText(status, changes > 0 ? "edited" : "good"));
		lines.push(this.renderText(this.fitHints(inner), "dim"));
		const [first = "", second = ""] = this.wrapFeedback(inner);
		const feedbackTone: PanelTone = this.escArmed ? "edited" : "muted";
		lines.push(first ? this.renderText(first, feedbackTone) : "");
		lines.push(second ? this.renderText(second, feedbackTone) : "");
		return lines;
	}

	/** The scope in a few characters, for terminals too narrow for the sentence. */
	private shortScope(name: string): string {
		const parts = this.scopeGlyphs(name).map((glyph) =>
			glyph.text === "◉" ? "◉ session" : glyph.text === "★" ? "★ default" : "⌂ repo",
		);
		return parts.length > 0 ? parts.join("  ") : "not in use";
	}

	/** As many key hints as fit, chosen by priority and shown in their usual order. */
	private fitHints(inner: number): string {
		const budget = inner - 1;
		const chosen = new Set<number>();
		let used = 0;
		const byPriority = ROUTING_TABLE_HINTS.map((hint, index) => ({ ...hint, index })).sort((a, b) => a.keep - b.keep);
		for (const hint of byPriority) {
			const cost = visibleWidth(hint.text) + (chosen.size > 0 ? 2 : 0);
			if (used + cost > budget) continue;
			chosen.add(hint.index);
			used += cost;
		}
		return ` ${ROUTING_TABLE_HINTS.filter((_, index) => chosen.has(index)).map((hint) => hint.text).join("  ")}`;
	}

	/**
	 * Each notice wrapped between words under a ⚠, at most four lines in all so
	 * the table keeps its room; anything beyond is counted, never cut mid-word.
	 */
	private noticeLines(inner: number): string[] {
		const width = Math.max(10, inner - 3);
		const lines: string[] = [];
		let shown = 0;
		for (const notice of this.notices) {
			const wrapped: string[] = [];
			let current = "";
			for (const word of sanitizeTerminalText(notice).split(/\s+/).filter(Boolean)) {
				const next = current ? `${current} ${word}` : word;
				if (visibleWidth(next) <= width || current === "") {
					current = next;
					continue;
				}
				wrapped.push(current);
				current = word;
			}
			if (current) wrapped.push(current);
			if (lines.length + wrapped.length > 4) break;
			wrapped.forEach((line, index) => lines.push(`${index === 0 ? " ⚠ " : "   "}${line}`));
			shown += 1;
		}
		const hidden = this.notices.length - shown;
		if (hidden > 0) lines.push(`   ${hidden} more problem${hidden === 1 ? "" : "s"} not shown.`);
		return lines;
	}

	/** The feedback message on up to two lines, broken between words. */
	private wrapFeedback(inner: number): string[] {
		if (!this.feedback) return [];
		const width = Math.max(10, inner - 1);
		const lines: string[] = [];
		let current = "";
		for (const word of sanitizeTerminalText(this.feedback).split(/\s+/).filter(Boolean)) {
			const next = current ? `${current} ${word}` : word;
			if (visibleWidth(next) <= width) {
				current = next;
				continue;
			}
			if (current) lines.push(current);
			current = word;
		}
		if (current) lines.push(current);
		if (lines.length > 2) {
			lines[1] = truncateToWidth(lines.slice(1).join(" "), width, "…");
			lines.length = 2;
		}
		return lines.map((line) => ` ${line}`);
	}

	/** Which tabs fit around the active one, and whether more hide on either side. */
	private tabWindow(inner: number): { names: string[]; before: boolean; after: boolean } {
		const names = this.profileNames();
		const widthOf = (name: string) =>
			Math.min(18, visibleWidth(name)) + 4 + this.scopeGlyphs(name).length + (name === this.profileName ? 3 : 0);
		const budget = inner - 1 - "+ New".length - 4;
		const active = Math.max(0, names.indexOf(this.profileName));
		let start = active;
		let end = active + 1;
		let used = widthOf(names[active] ?? "");
		for (let grew = true; grew;) {
			grew = false;
			if (end < names.length && used + widthOf(names[end]) <= budget) {
				used += widthOf(names[end]);
				end += 1;
				grew = true;
			}
			if (start > 0 && used + widthOf(names[start - 1]) <= budget) {
				start -= 1;
				used += widthOf(names[start]);
				grew = true;
			}
		}
		return { names: names.slice(start, end), before: start > 0, after: end < names.length };
	}

	private agentWindow(noticeRows = 0): { start: number; end: number } {
		const total = this.agents.length;
		if (!this.terminalRows) return { start: 0, end: total };
		const room = Math.max(3, Math.floor(this.terminalRows()) - 2 - ROUTING_TABLE_FIXED_ROWS - noticeRows);
		if (total <= room) return { start: 0, end: total };
		const visible = Math.max(1, room - 2);
		const focus = Math.max(0, this.cursor - 2);
		const start = Math.max(0, Math.min(focus - Math.floor(visible / 2), total - visible));
		return { start, end: start + visible };
	}

	// -- cards -------------------------------------------------------------------

	private cardFor(inner: number): { lines: string[]; width: number; top: number; left: number } {
		switch (this.overlay) {
			case "model":
				return this.modelCard(inner);
			case "effort":
				return this.effortCard(inner);
			case "menu":
				return this.menuCard(inner, this.activeTabColumn);
			case "new":
				return this.menuCard(inner, this.newColumn);
			case "fallbacks":
				return this.fallbacksCard(inner);
			default:
				return this.switchCard(inner);
		}
	}

	private modelCard(inner: number): { lines: string[]; width: number; top: number; left: number } {
		const width = Math.min(56, inner - 4);
		const content = width - 4;
		const lines: string[] = [];
		const region = (action: RoutingTableMouseAction) =>
			this.hitRegions.push({ y: lines.length, x0: 0, x1: content, action });
		lines.push(this.renderText("Model for ", "muted") + this.renderText(this.rowLabel(this.target), "title"));
		lines.push(this.renderText("⌕ ", "accent") + (this.query ? sanitizeTerminalText(this.query) : this.renderText("type to search", "dim")));
		lines.push(this.renderText("─".repeat(content), "border"));
		const options = this.modelOptions();
		const current = this.currentValue(this.target, "model") ?? (this.target === ROUTING_ALL_ROW ? undefined : this.inheritLabel(this.target));
		const rows = this.terminalRows ? Math.floor(this.terminalRows()) : options.length + ROUTING_MODEL_CARD_CHROME_ROWS;
		const visible = Math.max(3, Math.min(options.length, rows - ROUTING_MODEL_CARD_CHROME_ROWS));
		const start = Math.max(0, Math.min(this.modelCursor - Math.floor(visible / 2), options.length - visible));
		for (let index = start; index < Math.min(options.length, start + visible); index += 1) {
			const option = options[index] ?? "";
			const focused = index === this.modelCursor;
			const tone: PanelTone = focused ? "title" : option === ROUTING_CUSTOM_MODEL || option === this.inheritLabel(this.target) ? "muted" : "text";
			const mark = option === current ? " ✓" : "";
			const plain = `${focused ? "▸ " : "  "}${option}${mark}`;
			region({ kind: "model-option", index });
			lines.push(
				this.hoverWrap(
					`model-option:${index}`,
					this.renderText(focused ? "▸ " : "  ", "accent") + this.renderText(option, tone) + this.renderText(mark, "good"),
					plain,
					content,
				),
			);
		}
		lines.push("");
		lines.push(this.renderText("↑↓ choose · enter pick · esc back", "dim"));
		return { lines, width, top: 4, left: Math.max(0, Math.floor((inner - width) / 2)) };
	}

	private effortCard(inner: number): { lines: string[]; width: number; top: number; left: number } {
		// Provider review roles inherit Pi's persisted default, so their inherit
		// choice says so (gentle-pi#2271).
		const inheritLabel = this.target !== ROUTING_ALL_ROW && isProviderReviewRole(this.target)
			? routingDefaultLabel(this.target, "effort")
			: "inherit";
		const chips = this.effortOptions().map((option, index) => {
			const label = option === INHERIT_THINKING ? inheritLabel : option;
			const text = index === this.effortCursor ? `[${label}]` : ` ${label} `;
			return { index, text };
		});
		const oneRow = chips.reduce((sum, chip) => sum + chip.text.length + 1, 0) - 1;
		const width = Math.min(inner - 4, Math.max(44, oneRow + 4));
		const content = width - 4;
		// One row when it fits; otherwise the levels wrap onto a second row, so a
		// narrow terminal never cuts a level in half.
		const rows: Array<typeof chips> = [[]];
		let used = 0;
		for (const chip of chips) {
			const cost = chip.text.length + (rows[rows.length - 1].length > 0 ? 1 : 0);
			if (used + cost > content && rows[rows.length - 1].length > 0) {
				rows.push([]);
				used = 0;
			}
			rows[rows.length - 1].push(chip);
			used += chip.text.length + (rows[rows.length - 1].length > 1 ? 1 : 0);
		}
		const lines: string[] = [];
		lines.push(this.renderText("Effort for ", "muted") + this.renderText(this.rowLabel(this.target), "title"));
		lines.push(this.renderText(truncateToWidth(this.effortSource(), content, "…"), "dim"));
		for (const row of rows) {
			let column = 0;
			const drawn: string[] = [];
			for (const chip of row) {
				this.hitRegions.push({
					y: lines.length,
					x0: column,
					x1: column + chip.text.length,
					action: { kind: "effort-option", index: chip.index },
				});
				const focused = chip.index === this.effortCursor;
				drawn.push(this.hoverWrap(`effort-option:${chip.index}`, this.renderText(chip.text, focused ? "title" : "status"), chip.text));
				column += chip.text.length + 1;
			}
			lines.push(drawn.join(" "));
		}
		lines.push("");
		lines.push(this.renderText("←→ choose · enter pick · esc back", "dim"));
		return { lines, width, top: 6, left: Math.max(0, Math.floor((inner - width) / 2)) };
	}

	/** One line under the effort card's title: whose levels these are. */
	private effortSource(): string {
		const supported = this.supportedLevels(this.target);
		if (this.target === ROUTING_ALL_ROW) {
			return supported ? "Levels every agent's model supports." : "Models unknown to the catalog: every level is shown.";
		}
		const model = this.draft[this.target]?.model;
		if (model === undefined) return "Inherits its model: every level is shown.";
		return supported ? `Levels ${model} supports.` : `${model} is not in the catalog: every level is shown.`;
	}

	private menuCard(inner: number, anchor: number): { lines: string[]; width: number; top: number; left: number } {
		const items = this.menuItems();
		const width = Math.min(inner - 2, Math.max(28, ...items.map((item) => visibleWidth(item.label) + 8)));
		const content = width - 4;
		const lines: string[] = [];
		items.forEach((item, index) => {
			if (item.id === "delete") lines.push(this.renderText("─".repeat(content), "border"));
			const focused = index === this.menuCursor;
			const plain = `${focused ? "▸ " : "  "}${item.label}`;
			this.hitRegions.push({ y: lines.length, x0: 0, x1: content, action: { kind: "menu-item", id: item.id } });
			lines.push(
				this.hoverWrap(
					`menu:${item.id}`,
					this.renderText(focused ? "▸ " : "  ", "accent") + this.renderText(item.label, item.tone ?? (focused ? "title" : "text")),
					plain,
					content,
				),
			);
		});
		return { lines, width, top: 2, left: Math.max(0, Math.min(anchor, inner - width)) };
	}

	private switchCard(inner: number): { lines: string[]; width: number; top: number; left: number } {
		const width = Math.min(inner - 4, 60);
		const changes = this.changeCount();
		const lines: string[] = [];
		lines.push(
			this.renderText(sanitizeTerminalText(this.profileName), "title")
				+ this.renderText(` has ${changes} unsaved change${changes === 1 ? "" : "s"}.`, "text"),
		);
		lines.push("");
		let column = 0;
		let buttons = "";
		for (const id of ["switch-save", "switch-discard", "switch-stay"] as const) {
			const text = `[ ${ROUTING_TABLE_BUTTONS[id]} ]`;
			this.hitRegions.push({ y: lines.length, x0: column, x1: column + text.length, action: { kind: "button", button: id } });
			buttons += this.hoverWrap(`button:${id}`, this.renderText(text, id === "switch-save" ? "title" : id === "switch-stay" ? "dim" : "accent"), text) + "  ";
			column += text.length + 2;
		}
		lines.push(buttons);
		lines.push(this.renderText("enter save and switch · d discard · esc stay", "dim"));
		return { lines, width, top: 6, left: Math.max(0, Math.floor((inner - width) / 2)) };
	}

	/**
	 * Draws a card over the dimmed table. Card regions were recorded relative to
	 * the card content; they move into frame coordinates here: frame border and
	 * "│ " before the body, the card's own border and "│ " before its content.
	 */
	private placeCard(
		table: string[],
		card: { lines: string[]; width: number; top: number; left: number },
		inner: number,
	): string[] {
		const regions = this.hitRegions;
		this.hitRegions = regions.map((region) => ({
			...region,
			y: region.y + card.top + 2,
			x0: 2 + card.left + 2 + region.x0,
			x1: 2 + card.left + 2 + region.x1,
		}));
		const content = card.width - 4;
		const rule = "─".repeat(card.width - 2);
		const drawn = [
			this.renderText(`╭${rule}╮`, "accent"),
			...card.lines.map((line) => `${this.renderText("│", "accent")} ${this.fit(line, content)} ${this.renderText("│", "accent")}`),
			this.renderText(`╰${rule}╯`, "accent"),
		];
		const body = [...table];
		const rows = Math.max(body.length, card.top + drawn.length);
		while (body.length < rows) body.push("");
		for (let index = 0; index < drawn.length; index += 1) {
			const target = card.top + index;
			const right = " ".repeat(Math.max(0, inner - card.left - card.width));
			body[target] = " ".repeat(card.left) + drawn[index] + right;
		}
		return body;
	}

	// -- text helpers --------------------------------------------------------------

	/**
	 * The hover fill. It uses the theme's selection background, which reads on
	 * every bundled theme; the pending-tool background it replaced is a shade
	 * away from the terminal background on Gentleman-Cute and never showed.
	 */
	private hoverWrap(key: string, styled: string, plain: string, fillTo?: number): string {
		if (this.hovered !== key || !this.theme) return styled;
		const text = fillTo === undefined ? plain : plain + " ".repeat(Math.max(0, fillTo - visibleWidth(plain)));
		return this.theme.bg("selectedBg", this.theme.fg("text", sanitizeTerminalText(text)));
	}

	private renderText(text: string, tone: PanelTone): string {
		const safe = sanitizeTerminalText(text);
		if (!this.theme) return safe;
		return this.theme.fg(PANEL_TONE_COLOR[tone] ?? "text", safe);
	}

	private fit(line: string, width: number): string {
		const plain = stripAnsi(line);
		const visible = visibleWidth(plain);
		if (visible > width) return truncateToWidth(plain, Math.max(1, width), "…", true);
		return `${line}${" ".repeat(Math.max(0, width - visible))}`;
	}
}

interface RoutingTableTestEvent {
	type: "move" | "click" | "wheel";
	x: number;
	y: number;
	button?: string;
	wheelDelta?: number;
}

function renderRoutingTableForTesting(
	draft: AgentModelConfig,
	modelOptions: string[],
	agents: string[],
	width: number,
	theme?: Theme,
	terminalRows?: number,
	inputs: string[] = [],
	mouseEvents: RoutingTableTestEvent[] = [],
	results: RoutingTableResult[] = [],
	options: {
		file?: AgentProfilesFile;
		sessionBoundName?: string;
		pinWinner?: string;
		profileName?: string;
		feedback?: string;
		thinkingSupport?: Record<string, readonly ThinkingLevel[]>;
		fastModels?: string[];
		notices?: string[];
		fallbacks?: RoutingFallbacks;
	} = {},
): string[] {
	const panel = new RoutingTablePanel(
		draft,
		modelOptions,
		agents,
		(result) => results.push(result),
		theme,
		options.profileName ?? "current",
		terminalRows === undefined ? undefined : () => terminalRows,
		options,
	);
	panel.render(width);
	for (const data of inputs) {
		panel.handleInput(data);
		panel.render(width);
	}
	const send = (event: RoutingTableTestEvent, type: TuiMouseEvent["type"]) =>
		panel.handleMouse({
			type,
			x: event.x,
			y: event.y,
			button: event.button ?? (type === "move" ? "none" : "left"),
			wheelDelta: event.wheelDelta,
			screenX: event.x,
			screenY: event.y,
			width,
			height: terminalRows ?? 40,
		} as TuiMouseEvent);
	for (const event of mouseEvents) {
		// Real terminals send press then click; replay both so a test catches
		// any action that would fire twice.
		if (event.type === "click") send(event, "press");
		send(event, event.type);
		panel.render(width);
	}
	return panel.render(width);
}

interface RoutingTablePanelRequest {
	name: string;
	config: AgentModelConfig;
	file: AgentProfilesFile;
	/** An unsaved orchestrator mode draft carried across a reopen (custom prompt). */
	modeDraft?: OrchestratorMode;
	sessionBoundName?: string;
	pinWinner?: string;
	feedback?: string;
	notices?: string[];
	switchProfile?: RoutingProfileSwitcher;
}

/**
 * What the models screen must not hide: a pin layer that does not resolve
 * (invalid file, or a name no profile defines) silently returns the repository
 * to the global routing, and a routing key no agent matches is silently ignored
 * at launch (issues #2196 and #2400).
 */
function routingScreenNotices(
	ctx: ExtensionContext,
	file: AgentProfilesFile,
	shownName: string,
	sessionBoundName: string | undefined,
	launchRouting?: AgentModelConfig,
	authorityAvailable = true,
): string[] {
	const notices: string[] = [];
	if (!authorityAvailable) notices.push("Session profile authority is unavailable; affected launches are blocked. Use in this session selects one.");
	const pins = evaluateProfilePin(readProfilePinStatus(ctx.cwd), file.profiles);
	for (const issue of pins.invalid) {
		notices.push(`The ${issue.source} pin file ${issue.path} is not a valid pin and is ignored. Fix or remove it.`);
	}
	for (const issue of pins.stale) {
		notices.push(`The ${issue.source} pin names "${issue.profile}", which no profile defines, so it is ignored (${issue.path}).`);
	}
	if (sessionBoundName !== undefined && !hasOwnProfile(file.profiles, sessionBoundName)) {
		notices.push(`This session launches with "${sessionBoundName}", which is no longer in profiles.json; its launches keep that routing.`);
	}
	// The table shows the saved profile; the session's launches keep the routing
	// they took at the freeze or the binding. Both sides compare role routes only.
	const roleRoutes = (config: unknown) => JSON.stringify(Object.entries(normalizeModelConfig(config) ?? {})
		.filter(([key]) => !isProfileOrchestratorKey(key)).sort(([a], [b]) => a.localeCompare(b)));
	if (shownName === sessionBoundName && launchRouting !== undefined && hasOwnProfile(file.profiles, shownName)
		&& roleRoutes(file.profiles[shownName]) !== roleRoutes(launchRouting)) {
		notices.push(`Saved "${shownName}" differs from this session's launches; Use in this session adopts it.`);
	}
	const roots = {
		cwd: ctx.sessionManager?.getCwd?.() ?? ctx.cwd,
		home: homedir(),
		agentHome: resolveGentlePiAgentHome(),
	};
	let discovered: Array<{ name: string }> = [];
	try {
		discovered = discoverAgents(roots).agents;
	} catch {
		return notices;
	}
	// gentle-pi#2271: provider review roles are routed by key and never have an
	// agent file, so they always count as matched.
	const known = [...PROVIDER_REVIEW_ROLES.map((name) => ({ name })), ...discovered];
	const profileKeys = Object.keys(normalizeModelConfig(file.profiles[shownName]) ?? {}).filter((key) => !isProfileOrchestratorKey(key));
	const unmatched = unmatchedProfileKeys(Object.fromEntries(profileKeys.map((key) => [key, { model: undefined, thinking: undefined }])), known);
	const ignored = unmatched.filter((entry) => entry.suggestion === undefined).map((entry) => entry.key);
	if (ignored.length > 0) {
		notices.push(
			`Profile key${ignored.length === 1 ? "" : "s"} ${ignored.map((key) => `"${key}"`).join(", ")} match${ignored.length === 1 ? "es" : ""} no agent configured in tomidev, so ${ignored.length === 1 ? "it is" : "they are"} ignored at launch.`,
		);
	}
	for (const entry of unmatched) {
		if (entry.suggestion !== undefined) notices.push(`Profile key "${entry.key}" matches no agent configured in tomidev; did you mean ${entry.suggestion}?`);
	}
	// Issue #2400: model_profiles keys in subagents.json that match nothing and
	// suggest nothing. When the session resolves a profile (its binding or the one
	// frozen at startup), that profile replaces those launches' routing, so the
	// file's keys do not apply there; a pin the session did not freeze does not.
	if (sessionBoundName === undefined) {
		const stray = unmatchedProfileKeys(loadAgentsConfig(roots).modelProfiles, discovered)
			.filter((entry) => entry.suggestion === undefined && !isProviderReviewRole(entry.key) && !profileKeys.includes(entry.key))
			.map((entry) => entry.key);
		if (stray.length > 0) {
			notices.push(`subagents.json routes ${stray.map((key) => `"${key}"`).join(", ")}, which no agent matches, so ${stray.length === 1 ? "it is" : "they are"} ignored.`);
		}
	}
	return notices;
}

async function showRoutingTablePanel(
	ctx: ExtensionContext,
	request: RoutingTablePanelRequest,
): Promise<RoutingTableResult> {
	const modelOptions = await getPiModelOptions(ctx);
	const thinkingSupport = await getPiThinkingSupport(ctx);
	let fastModels: string[] = [];
	try {
		fastModels = (await ctx.modelRegistry.getAvailable()).filter(supportsOpenAIFast).map((model) => `${model.provider}/${model.id}`);
	} catch { /* Unknown catalog entries do not claim Fast compatibility. */ }
	const agents = modelAssignmentNames(ctx.cwd);
	return ctx.ui.custom<RoutingTableResult>(
		(tui, theme, _keybindings, done) => {
			const panel = new RoutingTablePanel(
				request.config,
				modelOptions,
				agents,
				done,
				theme,
				request.name,
				() => Math.max(0, tui.terminal.rows),
				{
					file: request.file,
					sessionBoundName: request.sessionBoundName,
					pinWinner: request.pinWinner,
					feedback: request.feedback,
					thinkingSupport,
					fastModels,
					notices: request.notices,
					switchProfile: request.switchProfile,
					fallbacks: fileRoutingFallbacks(gentleAiConfigHome()),
					modeDraft: request.modeDraft,
				},
			);
			const container = createNativeFullscreenInteraction({
				keyboardTarget: panel,
				requestRender: () => tui.requestRender(),
			});
			container.addChild(panel);
			return container;
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: "100%",
				maxHeight: "100%",
				margin: 0,
			},
		},
	);
}

/**
 * Bare `/td:profiles` opens the models screen on the profile this
 * repository resolves, after the routing preflight: legacy project overrides
 * migrate and a pinned repository is named before any edit. An unreadable
 * saved routing file does not block the screen; Make default discloses it.
 */
async function openModelsScreen(ctx: ExtensionContext, live: LiveSession): Promise<void> {
	migrateLegacyProjectModelOverrides(ctx.cwd);
	// A pinned repository resolves its subagent routing from the profile at launch,
	// so global routing written elsewhere will not reach its subagents. Saying it
	// before the edits, not after them, is the difference between a note and a surprise.
	const pinNote = profilePinScopeNote(ctx.cwd);
	if (pinNote) ctx.ui.notify(pinNote, "info");
	const read = readProfilesFileResult(profilesFilePath(gentleAiConfigHome()));
	const target = read.status === "valid"
		? resolveCurrentProfileTarget(ctx.cwd, read)
		: read.status === "missing"
			? ({ name: "current", source: "active" } as CurrentProfileTarget)
			: undefined;
	// The screen opens on the profile this session launches with while the store
	// still has it (gentle-shell#1064 slice 3c).
	const authorityAvailable = sessionProfileAuthorityAvailable(ctx);
	const launchName = sessionLaunchProfile(ctx, authorityAvailable)?.name;
	const opensOnLaunch = read.status === "valid" && launchName !== undefined && hasOwnProfile(read.file.profiles, launchName);
	await openProfilesPanelLoop(ctx, live, opensOnLaunch ? launchName : target?.name, authorityAvailable);
}

/** `/td:profiles export-routing`: write the saved global routing to models.export.json. */
async function exportRoutingCommand(ctx: ExtensionContext): Promise<void> {
	try {
		const count = await exportSavedModelConfig(ctx);
		ctx.ui.notify(`Tomidev exported ${count} saved model routing entr${count === 1 ? "y" : "ies"} to ${modelExportPath(ctx.cwd)}.`, "info");
	} catch (error) {
		ctx.ui.notify(`Model routing export failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
	}
}

/** `/td:profiles restore-routing`: replace the saved global routing with models.export.json, then apply it. */
async function restoreModelExport(ctx: ExtensionContext): Promise<void> {
	const restored = await readModelExport(ctx);
	if (!restored) {
		ctx.ui.notify(`Model routing restore failed: ${modelExportPath(ctx.cwd)} is missing or invalid.`, "warning");
		return;
	}
	const approved = await ctx.ui.confirm(
		"Restore saved model routing?",
		`Replace ${modelConfigPath(ctx.cwd)} with ${modelExportPath(ctx.cwd)}`,
	);
	if (!approved) return;
	try {
		await writeModelConfigAsync(ctx.cwd, restored);
	} catch (error) {
		ctx.ui.notify(`Model routing restore failed before writing config: ${error instanceof Error ? error.message : String(error)}`, "warning");
		return;
	}
	try {
		const applyResult = await applyModelConfigAsync(ctx.cwd, restored);
		ctx.ui.notify([
			"Tomidev restored global model config.",
			`Import: ${modelExportPath(ctx.cwd)}`,
			`Global config: ${modelConfigPath(ctx.cwd)}`,
			`Agents updated: ${applyResult.updated}`,
		].join("\n"), "info");
	} catch (error) {
		ctx.ui.notify([
			"Tomidev restored global model config, but applying it to agents failed.",
			`Global config: ${modelConfigPath(ctx.cwd)}`,
			`Apply error: ${error instanceof Error ? error.message : String(error)}`,
		].join("\n"), "warning");
	}
}

/** The profile bare `/td:profiles` preselects in the unified panel, and why it is that one. */
interface CurrentProfileTarget {
	name: string;
	source: "pinned" | "active";
}

/**
 * A pinned repository launches with its pinned profile, so that profile is the
 * one worth updating from here; anywhere else the globally active profile is.
 * Neither existing yields no target rather than a guess.
 */
function resolveCurrentProfileTarget(
	cwd: string,
	store: ProfilesFileReadResult = readProfilesFileResult(profilesFilePath(gentleAiConfigHome())),
): CurrentProfileTarget | undefined {
	const pin = resolveProfilePin({ cwd, configHome: gentleAiConfigHome() });
	if (pin) return { name: pin.profile, source: "pinned" };
	if (store.status !== "valid" || store.file.active === undefined) return undefined;
	if (!hasOwnProfile(store.file.profiles, store.file.active)) return undefined;
	return { name: store.file.active, source: "active" };
}



/**
 * What a panel action hands the reopened panel: a one-line status for the footer,
 * because notifications stay hidden behind the fullscreen overlay until it closes,
 * and the profile to select when the action created or renamed one.
 */
interface ProfilesPanelReport {
	status?: string;
	selectedName?: string;
}

function hasOwnProfile(profiles: Record<string, unknown>, name: string): boolean {
	return Object.prototype.hasOwnProperty.call(profiles, name);
}

function profilesErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The pin layer that wins, in one line: the winning layer's scope, name, and exact
 * file path, or the first stale layer named as missing from the loaded store. An
 * invalid layer is reported by `profilePinDetailLines` instead, because a file that
 * is not a pin is not a layer that could ever win.
 */
function profilePinStateLabel(
	status: ProfilePinStatus | undefined,
	evaluation: ProfilePinEvaluation,
): string {
	if (!status) return "none (not inside a Git worktree)";
	if (evaluation.winner) {
		return `${evaluation.winner.source}: ${evaluation.winner.profile} — ${evaluation.winner.path}`;
	}
	const stale = evaluation.stale[0];
	if (stale) return `${stale.source}: ${stale.profile} (missing from this store) — ${stale.path}`;
	return "none";
}

/**
 * Every line the panel needs to tell a pinned repository the truth: the winning
 * layer and its exact file, an explicit warning for a file that is not a pin named
 * by path (kept separate from a pin naming a profile this store no longer defines),
 * and one sentence that a winning pin outranks the globally active profile and every
 * global routing write.
 */
function profilePinDetailLines(
	status: ProfilePinStatus | undefined,
	profiles: Record<string, unknown>,
): string[] {
	const evaluation = evaluateProfilePin(status, profiles);
	const lines = [`pin           ${profilePinStateLabel(status, evaluation)}`];
	const shownStale = evaluation.winner ? undefined : evaluation.stale[0];
	for (const issue of evaluation.invalid) {
		lines.push(`              invalid pin file ${issue.path} (${issue.source} layer); ignoring it — fix or remove the file.`);
	}
	for (const issue of evaluation.stale) {
		if (issue === shownStale) continue;
		lines.push(`              the ${issue.source} pin names "${issue.profile}", which this store does not define; ignoring it (${issue.path}).`);
	}
	if (evaluation.winner) {
		lines.push("              This repository's subagent routing comes from the pin; the globally active profile and global routing writes do not apply here.");
	}
	return lines;
}

/**
 * Keep the clone-scoped pin pointing at the profile it names after a rename. The
 * repository declaration is a tracked file, so rewriting it would churn a commit
 * behind the operator's back; a declaration that still names the old profile is
 * reported instead, and `P` republishes it. Layers that name something else, or no
 * layer at all, are left alone.
 */
function followRenamedPin(
	cwd: string,
	from: string,
	to: string,
): { followed: string[]; stillDeclared: string[] } {
	const status = readProfilePinStatus(cwd);
	if (!status) return { followed: [], stillDeclared: [] };
	const followed: string[] = [];
	const stillDeclared: string[] = [];
	if (status.local.status === "valid" && status.local.profile === from) {
		try {
			writeProfilePinSync(status.localPath, to);
			followed.push(status.localPath);
		} catch {
			// A pin that cannot be rewritten is reported by the pin line and degrades to
			// the global routing, exactly like any other stale pin; a rename that already
			// succeeded in the store is not undone by it.
		}
	}
	if (status.repo.status === "valid" && status.repo.profile === from) {
		stillDeclared.push(status.repoPath);
	}
	return { followed, stillDeclared };
}

/**
 * One sentence naming the profile this repository resolves, for the commands whose
 * writes a pin outranks: global routing applied from the unified panel does not
 * reach a pinned repository's subagents. The launch resolver decides, so the note
 * names exactly what a launch would use.
 */
function profilePinScopeNote(cwd: string): string | undefined {
	const resolution = resolveProfilePin({ cwd, configHome: gentleAiConfigHome() });
	if (!resolution) return undefined;
	return sanitizeTerminalText(
		`This repository pins profile "${resolution.profile}" (${resolution.source} pin at ${resolution.path}), so its subagent launches resolve that profile instead of the global routing. Change or remove it in /td:profiles (profile menu ▾ › Use in this repo), or with /td:profiles publish <name> for the committed declaration.`,
	);
}

/**
 * Whether the committed declaration would actually be committed. This shells out to
 * Git, so it runs only on the key press that writes the declaration and makes at most
 * two bounded calls. Any Git failure is reported as unknown instead of thrown: a pin
 * write that already succeeded must not become an error because a probe about sharing
 * it failed.
 */
export function repoDeclarationSharing(root: string, path: string): string {
	const relativePath = relative(root, path).split(sep).join("/");
	const run = (...arguments_: string[]): string =>
		execFileSync("git", arguments_, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
	try {
		// Exit 0 means gitignore matches the path; the exact negation line is what makes
		// the declaration committable again.
		run("check-ignore", "--quiet", relativePath);
		return [
			`This worktree ignores ${relativePath}; add these exact lines to the root .gitignore to share only this declaration:`,
			...REPO_PROFILE_DECLARATION_GITIGNORE_RULES,
		].join("\n");
	} catch (error) {
		// Exit 1 means "not ignored"; anything else (including a missing git) is unknown.
		const exitStatus = (error as { status?: number }).status;
		if (exitStatus !== 1) return `Git could not say whether ${relativePath} is tracked; check it before committing.`;
	}
	try {
		run("ls-files", "--error-unmatch", relativePath);
		return `${relativePath} is tracked by Git; commit the change to share it.`;
	} catch {
		return `${relativePath} is not ignored, so it is committable as-is.`;
	}
}

function reportProfilesDrops(ctx: ExtensionContext, path: string, drops: ProfilesParseDrops): void {
	// Dropped names are by definition the ones that failed validation, so they are
	// untrusted input reaching the terminal and must be sanitized like any other
	// externally supplied text.
	const parts: string[] = [];
	if (drops.droppedProfiles.length > 0) {
		parts.push(`profiles: ${drops.droppedProfiles.map((name) => sanitizeTerminalText(name)).join(", ")}`);
	}
	if (drops.droppedAgents.length > 0) {
		parts.push(
			`routing entries: ${drops.droppedAgents.map(({ profile, agent }) => `${sanitizeTerminalText(profile)}/${sanitizeTerminalText(agent)}`).join(", ")}`,
		);
	}
	if (drops.droppedActive !== undefined) {
		parts.push(`active marker: ${sanitizeTerminalText(drops.droppedActive)}`);
	}
	if (parts.length > 0) {
		ctx.ui.notify(
			`Tomidev dropped invalid entries while loading ${sanitizeTerminalText(path)} — ${parts.join("; ")}.`,
			"warning",
		);
	}
}

/** Pi's own live-session controls: the ExtensionAPI's setModel/setThinkingLevel. */
type LiveSession = Pick<ExtensionAPI, "setModel" | "setThinkingLevel" | "getThinkingLevel"> & Partial<Pick<ExtensionAPI, "events">>;

/**
 * Switch the running session to the profile's orchestrator. `settings.json`
 * is the default for new sessions only; Pi's `setModel`/`setThinkingLevel`
 * are what move the live one without persisting global defaults. This helper
 * also serves explicit global apply, but never writes settings itself. Failures
 * keep the current live model and report what happened; callers retain their
 * routing snapshot or persisted default independently.
 */
async function switchLiveOrchestrator(ctx: ExtensionContext, live: LiveSession, entry: AgentRoutingEntry, current: () => boolean = () => true, onSuccess?: () => void): Promise<string> {
	const reference = parseOrchestratorModelRef(entry.model);
	if (reference === undefined) return "";
	const label = `${reference.provider}/${reference.model}`;
	const registry = ctx.modelRegistry;
	if (!registry) {
		if (ctx.hasUI && ctx.ui.notify) {
			ctx.ui.notify("Model registry unavailable; this session keeps its current model.", "warning");
		}
		return `\nModel registry unavailable; this session keeps its current model.`;
	}
	const model = registry.find(reference.provider, reference.model);
	if (model === undefined) return `\n${label} is not in the model catalog; this session keeps its current model.`;
	let switched = false;
	try {
		switched = await live.setModel(model);
	} catch (error) {
		return `\nThis session could not switch to ${label}: ${sanitizeTerminalText(error instanceof Error ? error.message : String(error))}.`;
	}
	if (!switched) return `\nno authentication is configured for ${reference.provider}; this session keeps its current model.`;
	if (!current()) return "";
	onSuccess?.();
	live.events?.emit(PROFILE_TIER_EVENT, { sessionId: ctx.sessionManager?.getSessionId?.(), tier: supportsOpenAIFast(model) ? entry.tier : undefined, model: `${model.provider}/${model.id}` });
	if (entry.thinking === undefined) return `\nThis session now runs on ${label}.`;
	try {
		live.setThinkingLevel(entry.thinking);
	} catch (error) {
		return `\nThis session now runs on ${label}, but its thinking level could not be set to ${entry.thinking}: ${sanitizeTerminalText(error instanceof Error ? error.message : String(error))}.`;
	}
	return `\nThis session now runs on ${label} · ${entry.thinking}.`;
}

/**
 * The live session's orchestrator entry, when a model is running. `s` captures
 * what the session actually runs rather than the default new sessions would
 * get from settings.json; an unreadable thinking level still snapshots the
 * model, just without a thinking claim.
 */
/** The live session's orchestrator: a snapshot result shaped for `s`, not a settings-file read. */
interface LiveOrchestratorSnapshot {
	readonly status: "valid";
	readonly entry: AgentRoutingEntry;
}

function liveOrchestratorSnapshot(ctx: ExtensionContext, live: LiveSession): LiveOrchestratorSnapshot | undefined {
	if (ctx.model === undefined || typeof ctx.model.provider !== "string" || typeof ctx.model.id !== "string") return undefined;
	let thinking: unknown;
	try { thinking = live.getThinkingLevel(); } catch { thinking = undefined; }
	return { status: "valid", entry: { model: `${ctx.model.provider}/${ctx.model.id}`, thinking: isThinkingLevel(thinking) ? thinking : undefined } };
}

function profileSnapshotFrom(
	current: AgentModelConfig,
	orchestrator: LiveOrchestratorSnapshot | OrchestratorSettingsReadResult,
): AgentModelConfig {
	const snapshot = cloneModelConfig(current);
	if (orchestrator.status === "valid" && orchestrator.entry !== undefined) {
		snapshot[PROFILE_ORCHESTRATOR_KEY] = { ...orchestrator.entry };
	}
	return snapshot;
}

/** The store actions runProfilesPanelAction implements; the loop handles the rest itself. */
type ProfileStoreAction = Extract<
	RoutingTableResult,
	{ type: "use-session" | "apply-global" | "create" | "duplicate" | "rename" | "delete" | "export-profile" | "import-profile" | "pin" }
>;

/** Runs one finished panel action against the store and the live session, returning the file the reopened panel should show. */
async function runProfilesPanelAction(
	ctx: ExtensionContext,
	live: LiveSession,
	path: string,
	file: AgentProfilesFile,
	result: ProfileStoreAction,
	report: ProfilesPanelReport = {},
): Promise<AgentProfilesFile> {
	switch (result.type) {
		case "use-session": {
			if (!hasOwnProfile(file.profiles, result.name)) return file;
			// Enter persists a complete routing snapshot for this parent session,
			// publishes only the returned state, then switches its live orchestrator.
			// No shared defaults, materialized stores, agent frontmatter, pins, or
			// declarations are written.
			const sessionId = ctx.sessionManager?.getSessionId?.();
			if (typeof sessionId !== "string" || sessionId.length === 0) {
				report.status = `This Pi session has no id to bind "${result.name}" to. Use Make default instead.`;
				ctx.ui.notify(
					`Tomidev cannot bind profile "${result.name}" to this session: no parent session id is available here. Use Make default instead.`,
					"warning",
				);
				return file;
			}
			const selected = await runCurrentSessionProfileSelection(ctx.sessionManager, async (attachment, owned) => {
				const startup = knownSessionProfileStartup(attachment.refresh().state, sessionId);
				const outcome = attachment.bind(result.name, normalizeModelConfig(result.config ?? file.profiles[result.name]) ?? {}, startup);
				if (!owned()) return false;
				const authority = publishSessionProfileOutcome(ctx.sessionManager, outcome);
				if ((outcome.status !== "persisted" && outcome.status !== "not-persisted") || outcome.state.status !== "bound" || !authority.available) {
					const kept = authority.available ? "The last disk-corroborated state was preserved." : "Session profile authority is unavailable; affected launches are blocked.";
					report.status = `"${result.name}" was not bound to this session. ${kept}`;
					ctx.ui.notify(
						`Tomidev could not bind profile "${result.name}". ${kept} No live model or thinking change was applied.`,
						"warning",
					);
					return false;
				}
				const snapshot = outcome.state.binding;
				// The live switch applies only while this exact snapshot is still current.
				const current = () => {
					if (!owned()) return false;
					const state = readCurrentSessionProfileOutcome(ctx.sessionManager)?.state;
					return state?.status === "bound" && isDeepStrictEqual(state.binding, snapshot);
				};
				const orchestrator = readProfileOrchestrator(snapshot.modelProfiles);
				const liveNote = orchestrator === undefined ? "" : await switchLiveOrchestrator(ctx, {
					setModel: (model) => current() ? live.setModel(model) : Promise.resolve(false),
					setThinkingLevel: (level) => { if (current()) live.setThinkingLevel(level); },
					getThinkingLevel: () => live.getThinkingLevel(),
					events: live.events,
				}, orchestrator, current);
				if (orchestrator?.model === undefined && current()) live.events?.emit(PROFILE_TIER_EVENT, { sessionId, tier: undefined });
				if (current()) {
					const persistence = outcome.status === "persisted" ? "persisted in this session" : "not yet persisted; active only until detach or disk corroboration";
					report.status = `This session now uses "${snapshot.name}" (${persistence}). Nothing shared was written.${liveNote.replace(/\n/g, " ")}`;
					ctx.ui.notify(
						`Tomidev bound profile "${snapshot.name}" to this session — its tab shows ◉; ${persistence}. Subagents and reviewers use this session's routing snapshot. Shared defaults were not written: the global routing, pins, and materialized stores are untouched. Make default writes them.${liveNote}`,
						"info",
					);
				}
				return true;
			});
			// A selection skipped by a reload or session replacement leaves a stale
			// ctx; only a still-active command reports the missing attachment.
			if (selected === undefined && isCommandContextActive(ctx)) {
				report.status = `"${result.name}" was not bound: this session's attachment is unavailable.`;
				ctx.ui.notify(
					`Tomidev cannot bind profile "${result.name}": the current session attachment is unavailable. No profile or live model change was applied.`,
					"warning",
				);
			}
			return file;
		}
		case "apply-global": {
			if (!hasOwnProfile(file.profiles, result.name)) return file;
			const manager = ctx.sessionManager;
			const sessionId = manager?.getSessionId?.();
			const current = () => isCommandContextActive(ctx) && ctx.sessionManager === manager && manager?.getSessionId?.() === sessionId;
			// A pinned repository resolves its subagent routing from the profile at launch,
			// so a global apply would move global state this repository never reads. When a
			// pin wins, applying is repo-scoped: re-pin this clone and write no global
			// routing, no materialized stores, and no orchestrator. The committed
			// declaration is never rewritten behind a commit.
			const pinResolution = resolveProfilePin({ cwd: ctx.cwd, configHome: gentleAiConfigHome() });
			if (pinResolution) {
				const localPath = pinResolution.status.localPath;
				let pinNote: string;
				try {
					writeProfilePinSync(localPath, result.name);
					pinNote = `Tomidev applied profile "${result.name}" repo-scoped: this clone now pins it in ${sanitizeTerminalText(localPath)}.\nSubagent launches here keep resolving the pin; no global routing or orchestrator was written.`;
				} catch (error) {
					ctx.ui.notify(
						`Tomidev could not pin profile "${result.name}" in ${sanitizeTerminalText(localPath)}: ${profilesErrorMessage(error)}`,
						"warning",
					);
					return file;
				}
				if (pinResolution.source === "repo" && pinResolution.path !== localPath) {
					pinNote += `\nThis worktree's committed declaration ${sanitizeTerminalText(pinResolution.path)} still declares "${pinResolution.profile}"; the clone-local pin now takes precedence.`;
				}
				ctx.ui.notify(pinNote, "info");
				return file;
			}
			const normalized = cloneModelConfig(result.config);
			const orchestratorEntry = readProfileOrchestrator(normalized);
			const hasAgentRoutes = Object.keys(normalized).some((name) => !isProfileOrchestratorKey(name));
			// Every global apply confirms before anything is written: applying replaces
			// the whole routing map in models.json and clears materialized routes the
			// profile omits, so the dialog must name the concrete diff. The current
			// routing is read from the same authority every other consumer uses; an
			// unreadable config is tolerated as empty, exactly like readModelConfigAsync.
			// Like applySavedModelConfig, an active profile excludes legacy project
			// routes it omitted, so they never surface as a false clearing diff.
			const savedRouting = await readModelRoutingAuthorityAsync(
				modelConfigPath(ctx.cwd),
				secondaryMergeSourcePath(ctx.cwd, resolveCurrentProfileTarget(ctx.cwd)),
			);
			// The apply pads omitted discoverable agents with clear entries, so the
			// diff must run against the effective current routing: the saved global
			// routing plus the materialized routes (frontmatter, subagents.json) of
			// agents the saved routing is silent about. models.json alone would hide
			// materialized-only routes the approval actually clears.
			const currentRouting = savedRouting.status === "valid"
				? await readGlobalEffectiveModelConfigFromAsync(ctx.cwd, savedRouting.config)
				: {};
			const agentNames = [
				...new Set([
					...Object.keys(currentRouting).filter((name) => !isProfileOrchestratorKey(name)),
					...Object.keys(normalized).filter((name) => !isProfileOrchestratorKey(name)),
				]),
			].sort();
			const replacedRoutes: string[] = [];
			const clearedRoutes: string[] = [];
			const addedRoutes: string[] = [];
			for (const name of agentNames) {
				const from = currentRouting[name];
				const to = normalized[name];
				if (to === undefined) {
					clearedRoutes.push(`${name}: ${formatOrchestratorSelection(from)} → inherit (cleared)`);
				} else if (from === undefined) {
					addedRoutes.push(`${name}: ${formatOrchestratorSelection(to)} (added)`);
				} else if (from.model !== to.model || from.thinking !== to.thinking || from.tier !== to.tier) {
					replacedRoutes.push(`${name}: ${formatOrchestratorSelection(from)} → ${formatOrchestratorSelection(to)}`);
				}
			}
			if (!hasAgentRoutes) {
				// A genuinely empty profile and an orchestrator-only profile both wipe
				// every materialized agent route, but they read very differently to the
				// user: the orchestrator entry survives the apply and reconfigures the
				// orchestrator, so the dialog must not promise an entirely empty config.
				const [confirmTitle, confirmMessage] = orchestratorEntry !== undefined
					? [
						"Apply orchestrator-only profile?",
						`Profile "${result.name}" has an orchestrator entry but no agent routing entries. Applying it will replace global routing in ${sanitizeTerminalText(modelConfigPath(ctx.cwd))} with the orchestrator entry alone, clear every materialized agent route so every agent returns to inherit its default model, set the configured orchestrator entry in settings.json, and attempt to switch this session to that orchestrator model. Continue?`,
					]
					: [
						"Apply empty profile?",
						`Profile "${result.name}" has no routing entries. Applying it will replace global routing in ${sanitizeTerminalText(modelConfigPath(ctx.cwd))} with an empty configuration and return every agent to inherit its default model. Continue?`,
					];
				const approved = await ctx.ui.confirm(confirmTitle, confirmMessage);
				if (!approved) return file;
			} else {
				// A populated profile keeps the same abort semantics as the empty and
				// orchestrator-only dialogs: declining leaves every surface untouched.
				// When the routing authority is unreadable the diff above was computed
				// against an empty map, so the dialog must disclose the unreadable
				// routing and the replace/clear-to-inherit effect instead of presenting
				// existing routes as merely "(added)" (the #1349 wipe-bug class).
				// When the profile carries an orchestrator entry, approval also writes
				// settings.json and tries to move the live session, so both variants
				// must disclose those effects in the same words the orchestrator-only
				// dialog uses. An unconditional "will switch" is never claimed: the
				// registry/auth can refuse the live move.
				const orchestratorEffects = orchestratorEntry !== undefined
					? ", set the configured orchestrator entry in settings.json, and attempt to switch this session to that orchestrator model"
					: "";
				// A profile whose agent routes already match the effective current routing
				// and that moves no orchestrator changes nothing: re-selecting the active
				// profile or verifying state would otherwise train users to approve a
				// dialog without reading it, weakening the guard on the destructive cases
				// (issue #1683). Any routing change, any orchestrator change, or an
				// unreadable routing authority (the diff above cannot prove a no-op)
				// keeps the confirmation exactly as #1349/#1384 defined it.
				// `applyOrchestratorSettings` treats an entry without a model as "leave
				// settings.json alone", so such an entry is a no-op too, not a change.
				// The live session is a fourth surface: applying re-asserts the profile's
				// orchestrator on it, so a session already moved to another model or
				// thinking level mid-session is a real change the user must approve,
				// even when settings.json and the profile agree.
				const liveOrchestrator = (() => {
					if (ctx.model === undefined || typeof ctx.model.provider !== "string" || typeof ctx.model.id !== "string") return undefined;
					let thinking: unknown;
					try { thinking = live.getThinkingLevel(); } catch { return undefined; }
					return { model: `${ctx.model.provider}/${ctx.model.id}`, thinking: isThinkingLevel(thinking) ? thinking : undefined };
				})();
				const orchestratorUnchanged = (orchestratorEntry === undefined || orchestratorEntry.model === undefined) || (() => {
					const current = readOrchestratorSettings(orchestratorSettingsPath());
					// An invalid stored defaultThinkingLevel is dropped from the entry but
					// applyOrchestratorSettings would delete the key, so the file would
					// change: a no-op cannot be proven and the dialog must stay.
					if (current.status === "valid" && "defaultThinkingLevel" in current.value && current.entry?.thinking === undefined) return false;
					return current.status === "valid" && current.entry !== undefined
						&& current.entry.model === orchestratorEntry.model
						&& current.entry.thinking === orchestratorEntry.thinking
						&& (savedRouting.status === "valid" ? savedRouting.config[PROFILE_ORCHESTRATOR_KEY]?.tier : undefined) === orchestratorEntry.tier
						&& liveOrchestrator !== undefined
						&& liveOrchestrator.model === orchestratorEntry.model
						&& liveOrchestrator.thinking === orchestratorEntry.thinking;
				})();
				if (savedRouting.status === "valid" && replacedRoutes.length === 0 && clearedRoutes.length === 0 && addedRoutes.length === 0 && orchestratorUnchanged) {
					ctx.ui.notify(
						`Profile "${result.name}" already matches the current global routing${orchestratorEntry !== undefined ? " and orchestrator" : ""}; applying it changed nothing.`,
						"info",
					);
				} else {
					let confirmMessage: string;
					if (savedRouting.status !== "valid") {
						const modelsPath = sanitizeTerminalText(modelConfigPath(ctx.cwd));
						confirmMessage = `Profile "${result.name}" has agent routing entries, but the current global routing in ${modelsPath} could not be read, so existing routes are not listed. Applying it will replace global routing in ${modelsPath} with this profile's routes, so every existing agent route may be replaced or cleared back to inherit${orchestratorEffects}. Continue?`;
					} else {
						const changes = [...replacedRoutes, ...clearedRoutes, ...addedRoutes];
						const changeSummary = changes.length > 0
							? changes.join("; ")
							: "its agent routes already match the current global routing";
						confirmMessage = `Profile "${result.name}" has agent routing entries. Applying it will replace global routing in ${sanitizeTerminalText(modelConfigPath(ctx.cwd))} with this profile's routes: ${changeSummary}${orchestratorEffects}. Continue?`;
					}
					const approved = await ctx.ui.confirm(`Apply profile "${result.name}"?`, confirmMessage);
					if (!approved) return file;
				}
			}
			// Applying spans three files — the store, models.json, and Pi's global
			// settings.json — and there is no cross-file rename, so order the writes to
			// keep the store truthful and compensate on failure: claim the profile in
			// the store first, then materialise routing, then the orchestrator. A claim
			// that fails leaves routing untouched; anything that fails after the claim
			// restores the previous claim and, when the previously active profile is
			// known, the routing that profile implies.
			const claimed = setActiveProfile(file, result.name);
			try {
				writeProfilesFileSync(path, claimed);
			} catch (error) {
				ctx.ui.notify(
					`Tomidev could not update ${sanitizeTerminalText(path)}: ${profilesErrorMessage(error)}`,
					"warning",
				);
				return file;
			}
			const previousActiveConfig =
				file.active !== undefined && hasOwnProfile(file.profiles, file.active)
					? normalizeModelConfig(file.profiles[file.active]) ?? {}
					: undefined;
			// Set only when the orchestrator write succeeded, so the revert knows it has
			// something to undo. A rollback closure (not a previous-bytes value) is used
			// because "the file did not exist before" is a real state that must restore
			// by removing the file, and `undefined` bytes cannot carry that distinction.
			let orchestratorRollback: (() => void) | undefined;
			const revertClaim = async (routingWritten: boolean): Promise<AgentProfilesFile> => {
				let restored = previousActiveConfig === undefined ? "" : "routing";
				if (routingWritten && previousActiveConfig !== undefined) {
					try {
						await writeModelConfigAsync(ctx.cwd, previousActiveConfig);
						// Materialize the previous profile again with the same
						// replacement semantics, so the failed profile's routes do not
						// linger in subagents.json or the agent frontmatter.
						await applyModelConfigAsync(
							ctx.cwd,
							await withOmittedAgentsClearedAsync(ctx.cwd, previousActiveConfig),
						);
					} catch {
						restored = "";
					}
				}
				if (orchestratorRollback) {
					try {
						orchestratorRollback();
						restored = restored === "" ? "settings" : `${restored} and settings`;
					} catch {
						restored = restored === "" ? "" : restored;
					}
				}
				try {
					writeProfilesFileSync(path, file);
					restored = restored === "" ? "active marker" : `${restored} and active marker`;
				} catch {
					restored = restored === "" ? "nothing" : restored;
				}
				const unresolved =
					routingWritten && previousActiveConfig === undefined
						? ` ${sanitizeTerminalText(modelConfigPath(ctx.cwd))} still holds this profile's routing because no previously active profile was recorded to restore.`
						: "";
				ctx.ui.notify(
					`Tomidev could not apply profile "${result.name}". Restored: ${restored}.${unresolved}`,
					"warning",
				);
				return file;
			};
			try {
				await writeModelConfigAsync(ctx.cwd, normalized);
			} catch (error) {
				ctx.ui.notify(
					`Tomidev could not write ${sanitizeTerminalText(modelConfigPath(ctx.cwd))}: ${profilesErrorMessage(error)}`,
					"warning",
				);
				return revertClaim(false);
			}
			// models.json holds the profile as written; the padding with clear
			// entries only drives materialization, so agents the profile omits
			// return to inherit instead of keeping a previously materialized route.
			let applyResult: { updated: number; skipped: number };
			try {
				applyResult = await applyModelConfigAsync(
					ctx.cwd,
					await withOmittedAgentsClearedAsync(ctx.cwd, normalized),
				);
			} catch (error) {
				ctx.ui.notify(
					`Tomidev could not materialize profile "${result.name}": ${profilesErrorMessage(error)}`,
					"warning",
				);
				return revertClaim(true);
			}
			let orchestratorNote = "";
			if (orchestratorEntry !== undefined) {
				const settingsPath = orchestratorSettingsPath();
				const written = applyOrchestratorSettings(settingsPath, orchestratorEntry);
				if (written.status === "invalid") {
					ctx.ui.notify(
						`Tomidev could not set the orchestrator from profile "${result.name}": ${sanitizeTerminalText(written.reason)}. ${sanitizeTerminalText(settingsPath)} was left unchanged.`,
						"warning",
					);
					return revertClaim(true);
				}
				if (written.status === "written") {
					const previous = written.previous;
					orchestratorRollback = () => restoreOrchestratorSettings(settingsPath, previous);
					orchestratorNote = `\nOrchestrator set to ${formatOrchestratorSelection(orchestratorEntry)} in ${sanitizeTerminalText(settingsPath)}.`;
				}
				// settings.json only governs future sessions. The session the user is
				// sitting in keeps its model until told otherwise, which made a profile
				// look applied while the orchestrator kept answering with the old one.
				if (current()) {
					if (orchestratorEntry.model) orchestratorNote += await switchLiveOrchestrator(ctx, live, orchestratorEntry, current, () => setFrozenDefaultOrchestrator(sessionId, orchestratorEntry));
					else {
						setFrozenDefaultOrchestrator(sessionId, undefined);
						live.events?.emit(PROFILE_TIER_EVENT, { sessionId, tier: undefined });
					}
				}
			} else if (current()) {
				setFrozenDefaultOrchestrator(sessionId, undefined);
				live.events?.emit(PROFILE_TIER_EVENT, { sessionId, tier: undefined });
			}
			// A pin that does not resolve changes nothing at launch, so the global apply
			// above is what governs this repository. Saying so keeps a broken pin from
			// looking like the reason a launch ignored the profile just applied.
			const pinEvaluation = evaluateProfilePin(readProfilePinStatus(ctx.cwd), file.profiles);
			let pinNote = "";
			if (pinEvaluation.stale.length > 0 || pinEvaluation.invalid.length > 0) {
				pinNote = "\nThis repository also has a pin layer that does not resolve; the global routing above governs its subagents until the pin is fixed.";
			}
			ctx.ui.notify(
				[
					`Tomidev applied profile "${result.name}" — ${applyResult.updated} agent${applyResult.updated === 1 ? "" : "s"} updated.`,
					"New routing takes effect on the next subagent launch.",
				].join("\n") + orchestratorNote + pinNote,
				"info",
			);
			return claimed;
		}
		case "create": {
			const answer = await ctx.ui.input("New profile name", "e.g. deep-work");
			if (answer === undefined) {
				report.status = "Create cancelled.";
				return file;
			}
			const name = answer.trim();
			if (name === "") {
				report.status = "No profile created: no name entered.";
				return file;
			}
			try {
				const next = createProfile(file, name, {});
				writeProfilesFileSync(path, next);
				report.status = `Profile "${name}" created.`;
				report.selectedName = name;
				return next;
			} catch (error) {
				report.status = `Profile not created: ${profilesErrorMessage(error)}`;
				ctx.ui.notify(report.status, "warning");
				return file;
			}
		}
		case "duplicate": {
			// The Pi host starts the field empty and ignores the placeholder, so the title
			// names the suggestion and Enter on an untouched field accepts it.
			const suggested = `${result.name}-copy`;
			const answer = await ctx.ui.input(`Duplicate profile "${result.name}" as (empty = ${suggested})`, suggested);
			if (answer === undefined) {
				report.status = "Duplicate cancelled.";
				return file;
			}
			const name = answer.trim() || suggested;
			try {
				const next = duplicateProfile(file, result.name, name);
				writeProfilesFileSync(path, next);
				report.status = `Profile "${result.name}" duplicated as "${name}".`;
				report.selectedName = name;
				return next;
			} catch (error) {
				report.status = `Profile not duplicated: ${profilesErrorMessage(error)}`;
				ctx.ui.notify(report.status, "warning");
				return file;
			}
		}
		case "rename": {
			const answer = await ctx.ui.input(`Rename profile "${result.name}" to (empty = keep ${result.name})`, result.name);
			if (answer === undefined) {
				report.status = "Rename cancelled.";
				return file;
			}
			const name = answer.trim();
			if (name === "") {
				report.status = `Profile "${result.name}" unchanged: no new name entered.`;
				return file;
			}
			try {
				const next = renameProfile(file, result.name, name);
				writeProfilesFileSync(path, next);
				followProfileFallbacks(path, result.name, name);
				// A pin stores a name, so a rename that did not follow it would leave every
				// pinned repository with a name the store no longer defines, which silently
				// returns those repositories to the global routing.
				const follow = followRenamedPin(ctx.cwd, result.name, name);
				ctx.ui.notify(
					`Tomidev renamed profile "${result.name}" to "${name}".` +
						(follow.followed.length > 0 ? `\nUpdated the clone pin: ${follow.followed.map((entry) => sanitizeTerminalText(entry)).join(", ")}.` : "") +
						(follow.stillDeclared.length > 0 ? `\nThe committed repository declaration ${follow.stillDeclared.map((entry) => sanitizeTerminalText(entry)).join(", ")} still names "${result.name}"; run /td:profiles publish ${name} to republish it.` : ""),
					"info",
				);
				report.status = `Profile "${result.name}" renamed to "${name}".`;
				report.selectedName = name;
				return next;
			} catch (error) {
				report.status = `Profile not renamed: ${profilesErrorMessage(error)}`;
				ctx.ui.notify(report.status, "warning");
				return file;
			}
		}
		case "delete": {
			// A pinned profile is live state for this repository, so deleting it is
			// refused the same way deleting the active profile is: the pin must be cleared
			// deliberately instead of leaving a name that resolves to nothing. Either
			// layer refuses, not just the winning one, because a non-winning layer still
			// names a live profile for this repository.
			const deletePinStatus = readProfilePinStatus(ctx.cwd);
			const namedLayers: string[] = [];
			if (deletePinStatus) {
				for (const layer of [
					{ scope: "local", read: deletePinStatus.local, path: deletePinStatus.localPath },
					{ scope: "repo", read: deletePinStatus.repo, path: deletePinStatus.repoPath },
				]) {
					if (layer.read.status === "valid" && layer.read.profile === result.name) {
						namedLayers.push(`${layer.scope} pin at ${sanitizeTerminalText(layer.path)}`);
					}
				}
			}
			if (namedLayers.length > 0) {
				ctx.ui.notify(
					`Profile "${result.name}" is pinned for this repository (${namedLayers.join(" and ")}). Remove the pin first (profile menu ▾ › Stop using in this repo for the clone pin, /td:profiles publish <name> for the declaration), then delete it.`,
					"warning",
				);
				return file;
			}
			const approved = await ctx.ui.confirm(
				"Delete profile?",
				`Delete profile "${result.name}" from ${path}? The routing in ${modelConfigPath(ctx.cwd)} is not changed.`,
			);
			if (!approved) return file;
			try {
				const next = deleteProfile(file, result.name);
				writeProfilesFileSync(path, next);
				followProfileFallbacks(path, result.name, undefined);
				return next;
			} catch (error) {
				ctx.ui.notify(`Profile not deleted: ${profilesErrorMessage(error)}`, "warning");
				return file;
			}
		}
		case "pin": {
			if (!hasOwnProfile(file.profiles, result.name)) return file;
			// The pin layer is chosen by the key, not by the file that happens to exist:
			// `p` sets the local pin in the clone's Git common directory, `P` sets the
			// committable per-worktree declaration. Both toggle: the same key on the
			// profile a layer already names removes that layer, so a repository can be
			// released without editing files by hand. Neither writes routing, so a
			// failure here has nothing to roll back.
			const status = readProfilePinStatus(ctx.cwd);
			if (!status) {
				report.status = "This session is not inside a Git worktree, so nothing was pinned.";
				ctx.ui.notify(
					"Tomidev cannot pin a profile because this session is not inside a Git worktree. Pinning is per repository; apply the profile globally instead.",
					"warning",
				);
				return file;
			}
			const pinPath = result.source === "local" ? status.localPath : status.repoPath;
			const current = result.source === "local" ? status.local : status.repo;
			const currentlyPinned = current.status === "valid" && current.profile === result.name;
			const scope = result.source === "local" ? "clone" : "worktree";
			try {
				if (currentlyPinned) clearProfilePinSync(pinPath);
				else writeProfilePinSync(pinPath, result.name);
			} catch (error) {
				report.status = `The pin could not be updated: ${profilesErrorMessage(error)}`;
				ctx.ui.notify(
					`Tomidev could not update profile pin ${sanitizeTerminalText(pinPath)}: ${profilesErrorMessage(error)}`,
					"warning",
				);
				return file;
			}
			if (currentlyPinned) {
				ctx.ui.notify(
					[
						`Tomidev removed the ${result.source} pin for this ${scope} from ${sanitizeTerminalText(pinPath)}.`,
						result.source === "local"
							? "This clone falls back to the repository declaration, then to the global routing."
							: "This worktree falls back to the global routing; a local pin in the clone still outranks it.",
					].join("\n"),
					"info",
				);
				return file;
			}
			// The sharing line is only worth a Git call when the declaration was just
			// written, and it must never turn a successful pin into a failure.
			const sharingNote = result.source === "repo" ? `\n${repoDeclarationSharing(status.root, pinPath)}` : "";
			ctx.ui.notify(
				result.source === "local"
					? [
						`Tomidev pinned profile "${result.name}" for this clone in ${sanitizeTerminalText(pinPath)}.`,
						"Subagent launches in this repository resolve that profile at launch; the orchestrator and every other repository keep their global routing. Choose Stop using in this repo in the profile menu (▾) to unpin.",
					].join("\n")
					: [
						`Tomidev declared profile "${result.name}" for this worktree in ${sanitizeTerminalText(pinPath)}.`,
						`Subagent launches resolve it at launch. Commit the file to share the routing; a local pin takes precedence over it. Run /td:profiles publish ${result.name} again to remove the declaration.`,
					].join("\n") + sharingNote,
				"info",
			);
			return file;
		}
		case "export-profile": {
			if (!hasOwnProfile(file.profiles, result.name)) return file;
			const exportPath = profileExportPath(gentleAiConfigHome());
			try {
				const text = serializeProfileExport(result.name, file.profiles[result.name]);
				await mkdir(dirname(exportPath), { recursive: true });
				await writeFile(exportPath, text);
				ctx.ui.notify(`Tomidev exported profile "${result.name}" to ${exportPath}.`, "info");
			} catch (error) {
				ctx.ui.notify(`Profile export failed: ${profilesErrorMessage(error)}`, "warning");
			}
			return file;
		}
		case "import-profile": {
			const importPath = profileExportPath(gentleAiConfigHome());
			let text: string;
			try {
				text = await readFile(importPath, "utf8");
			} catch {
				ctx.ui.notify(`Profile import failed: ${importPath} is missing or unreadable.`, "warning");
				return file;
			}
			const parsed = parseProfileExportTextWithDrops(text);
			if (!parsed) {
				ctx.ui.notify(
					`Profile import failed: ${importPath} is not a valid agent-model profile export.`,
					"warning",
				);
				return file;
			}
			if (parsed.droppedAgents.length > 0) {
				ctx.ui.notify(
					`Tomidev dropped invalid routing entries while importing profile "${parsed.name}": ${parsed.droppedAgents.join(", ")}.`,
					"warning",
				);
			}
			if (hasOwnProfile(file.profiles, parsed.name)) {
				const approved = await ctx.ui.confirm(
					"Replace existing profile?",
					`Profile "${parsed.name}" already exists in ${path}. Replace its routing with the import?`,
				);
				if (!approved) return file;
			}
			try {
				const next = hasOwnProfile(file.profiles, parsed.name)
					? updateProfile(file, parsed.name, parsed.config)
					: createProfile(file, parsed.name, parsed.config);
				writeProfilesFileSync(path, next);
				const entries = Object.keys(parsed.config).length;
				ctx.ui.notify(
					`Tomidev imported profile "${parsed.name}" (${entries} routing ${entries === 1 ? "entry" : "entries"}) from ${importPath}.`,
					"info",
				);
				return next;
			} catch (error) {
				ctx.ui.notify(`Profile import failed: ${profilesErrorMessage(error)}`, "warning");
				return file;
			}
		}
	}
}

/** `/td:profiles`: seed or open the store, then loop the panel over one action at a time until it closes. */
const PROFILES_COMMAND_USAGE = "Usage: /td:profiles [export <name> | import | publish <name> | export-routing | restore-routing | clear]";

/**
 * `/td:profiles` opens the models screen. File operations live in
 * subcommands rather than on the screen: `clear` ends this session's profile
 * selection, `export <name>` and `import` move a
 * profile through `profiles.export.json`, `publish <name>` toggles the
 * committed repository declaration, and `export-routing` / `restore-routing`
 * move the saved global routing (models.json, not a profile) through
 * `models.export.json`. The routing verbs carry their own names so a profile
 * can never be mistaken for them.
 */
async function handleProfilesCommand(ctx: ExtensionContext, live: LiveSession, args = ""): Promise<void> {
	const [verb = "", ...rest] = args.trim().split(/\s+/).filter(Boolean);
	if (verb === "") {
		await openModelsScreen(ctx, live);
		return;
	}
	if (verb === "export-routing" || verb === "restore-routing" || verb === "clear") {
		if (rest.length > 0) {
			ctx.ui.notify(PROFILES_COMMAND_USAGE, "warning");
			return;
		}
		if (verb === "export-routing") await exportRoutingCommand(ctx);
		else if (verb === "restore-routing") await restoreModelExport(ctx);
		else await handleProfilesClear(ctx);
		return;
	}
	const store = await loadProfilesStore(ctx);
	if (!store) return;
	const name = rest.join(" ");
	switch (verb) {
		case "export":
		case "publish": {
			if (name === "" || !hasOwnProfile(store.file.profiles, name)) {
				ctx.ui.notify(
					name === "" ? PROFILES_COMMAND_USAGE : `No profile named "${sanitizeTerminalText(name)}". ${PROFILES_COMMAND_USAGE}`,
					"warning",
				);
				return;
			}
			await runProfilesPanelAction(
				ctx,
				live,
				store.path,
				store.file,
				verb === "export" ? { type: "export-profile", name } : { type: "pin", source: "repo", name },
			);
			return;
		}
		case "import":
			await runProfilesPanelAction(ctx, live, store.path, store.file, { type: "import-profile" });
			return;
		default:
			ctx.ui.notify(PROFILES_COMMAND_USAGE, "warning");
	}
}

/** Reads the profiles store, seeding it on first use; undefined after a reported failure. */
async function loadProfilesStore(ctx: ExtensionContext): Promise<{ path: string; file: AgentProfilesFile } | undefined> {
	const path = profilesFilePath(gentleAiConfigHome());
	const read = readProfilesFileResult(path);
	if (read.status === "invalid") {
		ctx.ui.notify(
			`Tomidev cannot open agent profiles because ${path} is invalid JSON or not a profiles file. Fix or remove the file, then run /td:profiles again.`,
			"warning",
		);
		return undefined;
	}
	if (read.status === "valid") {
		reportProfilesDrops(ctx, path, read.drops);
		return { path, file: read.file };
	}
	const file = bootstrapProfilesFile(await readEffectiveModelConfigAsync(ctx.cwd));
	try {
		writeProfilesFileSync(path, file);
	} catch (error) {
		ctx.ui.notify(`Tomidev could not create ${path}: ${profilesErrorMessage(error)}`, "warning");
		return undefined;
	}
	ctx.ui.notify(`Tomidev seeded the "current" profile in ${path} from the routing currently in effect.`, "info");
	return { path, file };
}

/**
 * The models screen loop: shows one profile's table, runs what the user chose,
 * and reopens with fresh store, binding, and pin state; a tab switch stays on
 * the open screen instead. Bare `/td:profiles` passes the profile this
 * repository resolves so it is the tab on screen. Every
 * outcome is reported on the screen's feedback line, because notifications stay
 * hidden behind the fullscreen overlay until it closes.
 */
async function openProfilesPanelLoop(
	ctx: ExtensionContext,
	live: LiveSession,
	initialSelectedName?: string,
	openingAuthority?: boolean,
): Promise<void> {
	const store = await loadProfilesStore(ctx);
	if (!store) return;
	const { path } = store;
	let file = store.file;
	const pinWinner = () => evaluateProfilePin(readProfilePinStatus(ctx.cwd), file.profiles).winner?.profile;
	let selectedName = initialSelectedName
		?? resolveCurrentProfileTarget(ctx.cwd, { status: "valid", file, drops: { droppedProfiles: [], droppedAgents: [], droppedActive: undefined } })?.name
		?? Object.keys(file.profiles)[0];
	let feedback: string | undefined;
	let draftOverride: AgentModelConfig | undefined;
	// The unsaved mode draft carried across a reopen that keeps the routing draft.
	let modeDraftOverride: OrchestratorMode | undefined;
	// Read once per visit: the opening read serves the first one.
	let authorityAvailable = true;
	const writeDraft = (name: string, config: AgentModelConfig, orchestratorMode?: OrchestratorMode): boolean => {
		try {
			let next = hasOwnProfile(file.profiles, name)
				? updateProfile(file, name, cloneModelConfig(config))
				: createProfile(file, name, cloneModelConfig(config));
			// The mode lands in the same write as the routing: the two never drift apart.
			if (orchestratorMode !== undefined && hasOwnProfile(next.profiles, name)) {
				next = setProfileOrchestratorMode(next, name, orchestratorMode);
			}
			writeProfilesFileSync(path, next);
			file = next;
			return true;
		} catch (error) {
			feedback = `"${name}" was not saved: ${profilesErrorMessage(error)}`;
			return false;
		}
	};
	const switchProfile: RoutingProfileSwitcher = (name, saveFirst, saveFirstMode) => {
		const previous = selectedName!;
		if (saveFirst && !writeDraft(previous, saveFirst, saveFirstMode)) {
			const error = feedback ?? `"${previous}" was not saved.`;
			feedback = undefined;
			return { error };
		}
		selectedName = name;
		// The profile this session launches with, bound or frozen: the tab marked ◉.
		const launch = sessionLaunchProfile(ctx, authorityAvailable);
		return {
			file,
			sessionBoundName: launch?.name,
			pinWinner: pinWinner(),
			notices: routingScreenNotices(ctx, file, name, launch?.name, launch?.modelProfiles, authorityAvailable),
			feedback: `${saveFirst ? `Saved "${previous}". ` : ""}Showing "${name}".`,
		};
	};
	const differsFromStore = (name: string, config: AgentModelConfig) =>
		JSON.stringify(normalizeModelConfig(config) ?? {}) !== JSON.stringify(normalizeModelConfig(file.profiles[name]) ?? {});
	// Pi's runner invalidates this command ctx in a microtask when a reload or
	// session replacement lands, possibly while a panel or input step is still in
	// flight. Every step therefore re-checks the ctx when it settles (or throws),
	// and a stale ctx closes the loop quietly instead of touching ctx.cwd again.
	const stale = Symbol("stale-profiles-ctx");
	const step = async <T>(run: () => Promise<T>): Promise<T> => {
		let value: T;
		try {
			value = await run();
		} catch (error) {
			if (!isCommandContextActive(ctx)) throw stale;
			throw error;
		}
		if (!isCommandContextActive(ctx)) throw stale;
		return value;
	};
	try {
		await runProfilesPanelSteps();
	} catch (error) {
		if (error !== stale) throw error;
	}
	async function runProfilesPanelSteps(): Promise<void> {
		while (true) {
			if (!isCommandContextActive(ctx)) return;
			if (selectedName === undefined || !hasOwnProfile(file.profiles, selectedName)) {
				selectedName = Object.keys(file.profiles)[0];
				draftOverride = undefined;
			}
			if (selectedName === undefined) {
				ctx.ui.notify("Tomidev has no profiles left. Run /td:profiles again to seed one from the routing in effect.", "info");
				return;
			}
			const shown = selectedName;
			const stored = cloneModelConfig(normalizeModelConfig(file.profiles[shown]) ?? {});
			authorityAvailable = openingAuthority ?? sessionProfileAuthorityAvailable(ctx);
			openingAuthority = undefined;
			const launch = sessionLaunchProfile(ctx, authorityAvailable);
			const result = await step(() => showRoutingTablePanel(ctx, {
				name: shown,
				config: draftOverride ?? stored,
				file,
				modeDraft: modeDraftOverride,
				sessionBoundName: launch?.name,
				pinWinner: pinWinner(),
				feedback,
				notices: routingScreenNotices(ctx, file, shown, launch?.name, launch?.modelProfiles, authorityAvailable),
				switchProfile,
			}));
			draftOverride = undefined;
			feedback = undefined;
			modeDraftOverride = undefined;
			const previous = selectedName;
			if (result.saveFirst && !writeDraft(previous, result.saveFirst, result.saveFirstMode)) {
				draftOverride = result.saveFirst;
				continue;
			}
			const savedNote = result.saveFirst ? `Saved "${previous}". ` : "";
			switch (result.type) {
				case "close":
					return;
				case "load":
					selectedName = result.name;
					feedback = `${savedNote}Showing "${result.name}".`;
					continue;
				case "custom": {
					const label = result.target === PROFILE_ORCHESTRATOR_KEY
						? "the orchestrator"
						: result.target === ROUTING_ALL_ROW ? "every agent" : sanitizeTerminalText(result.target);
					const answer = await step(() => ctx.ui.input(`Custom model id for ${label}`, "provider/model"));
					draftOverride = cloneModelConfig(result.config);
					modeDraftOverride = result.modeDraft;
					if (answer === undefined || answer.trim() === "") {
						feedback = "No custom model set.";
						continue;
					}
					const model = normalizeModelId(answer.trim());
					if (!model) {
						feedback = "Custom model id must be one provider/model line using letters, numbers, '.', '-', '_', '~', ':', '@', '/', '+', '%' only.";
						continue;
					}
					const keys = result.target === ROUTING_ALL_ROW ? modelAssignmentNames(ctx.cwd) : [result.target];
					for (const key of keys) draftOverride[key] = { ...(draftOverride[key] ?? {}), model };
					feedback = `${label}: model ${model}. Save keeps it in "${previous}".`;
					continue;
				}
				case "save":
					if (writeDraft(previous, result.config, result.orchestratorMode)) feedback = `Saved "${previous}".`;
					else draftOverride = result.config;
					continue;
				case "use-session": {
					// What you see is what the session uses: edits are saved first.
					// A tab switch may have changed the shown profile since this visit opened.
					const config = result.config ?? cloneModelConfig(normalizeModelConfig(file.profiles[previous]) ?? {});
					const saved = differsFromStore(previous, config);
					// A toggled mode persists before the bind: Enter never leaves it behind,
					// and the status line says so.
					const modeChanged = result.orchestratorMode !== undefined
						&& result.orchestratorMode !== readProfileWorkflow(file, previous).orchestratorMode;
					if ((saved || modeChanged) && !writeDraft(previous, config, result.orchestratorMode)) {
						draftOverride = config;
						continue;
					}
					const report: ProfilesPanelReport = {};
					file = await step(() => runProfilesPanelAction(ctx, live, path, file, { type: "use-session", name: previous, config }, report));
					feedback = `${saved ? `Saved "${previous}". ` : ""}${modeChanged ? `"${previous}" now keeps its orchestrator in ${result.orchestratorMode} mode. ` : ""}${report.status ?? ""}`.trim() || undefined;
					continue;
				}
				case "apply-global": {
					// Make default saves what you see, then runs the guarded global
					// apply with its diff confirmation, pin honesty, and rollback.
					const saved = differsFromStore(previous, result.config);
					if (saved && !writeDraft(previous, result.config)) {
						draftOverride = result.config;
						continue;
					}
					file = await step(() => runProfilesPanelAction(ctx, live, path, file, { type: "apply-global", name: previous, config: cloneModelConfig(result.config) }));
					const prefix = saved ? `Saved "${previous}". ` : "";
					feedback = file.active === previous
						? `${prefix}"${previous}" is the default for new sessions.`
						: pinWinner() === previous
							? `${prefix}This repo pins its profile, so "${previous}" now applies to this repo only.`
							: `${prefix}"${previous}" was not made the default.`;
					continue;
				}
				case "create-live": {
					if (!authorityAvailable) {
						feedback = `${savedNote}Session profile authority is unavailable; affected launches are blocked. No profile created.`;
						continue;
					}
					const answer = await step(() => ctx.ui.input("Name for a profile of what's running now", "e.g. snapshot"));
					const name = answer?.trim() ?? "";
					if (name === "") {
						feedback = `${savedNote}No profile created.`;
						continue;
					}
					// Captures the routing this session's launches resolve and the
					// orchestrator it actually runs, the way the old snapshot did.
					const snapshot = profileSnapshotFrom(
						await step(() => readSessionLaunchModelConfigAsync(ctx, authorityAvailable)),
						liveOrchestratorSnapshot(ctx, live) ?? readOrchestratorSettings(orchestratorSettingsPath()),
					);
					try {
						const next = createProfile(file, name, snapshot);
						writeProfilesFileSync(path, next);
						file = next;
						selectedName = name;
						feedback = `${savedNote}Created "${name}" from what's running now.`;
					} catch (error) {
						feedback = `${savedNote}Profile not created: ${profilesErrorMessage(error)}`;
					}
					continue;
				}
				default: {
					const report: ProfilesPanelReport = {};
					file = await step(() => runProfilesPanelAction(ctx, live, path, file, result, report));
					selectedName = report.selectedName ?? selectedName;
					if (result.type === "delete" && !hasOwnProfile(file.profiles, previous)) {
						feedback = `Deleted "${previous}".`;
					} else if (result.type === "pin") {
						feedback = report.status ?? (pinWinner() === previous
							? `"${previous}" is used in this repo.`
							: `"${previous}" is no longer pinned to this repo.`);
					} else {
						feedback = report.status ? `${savedNote}${report.status}` : savedNote || undefined;
					}
					// Rename, pin, and a declined delete keep the profile on screen; carry
					// unsaved edits across them instead of reloading from the store.
					if (result.draft && hasOwnProfile(file.profiles, selectedName) && (selectedName === previous || result.type === "rename")) {
						draftOverride = result.draft;
					}
				}
			}
		}
	}
}

/**
 * The startup state this session knows (gentle-shell#2742, section 3): the one
 * the newest corroborated record carries, else the profile this process froze
 * at the session's own start. Follow mode has none.
 */
function knownSessionProfileStartup(state: SessionProfileAppendOutcome["state"], sessionId: string): SessionProfileStartupState | undefined {
	if (profileFollowEnabled()) return undefined;
	if (state.status === "bound") {
		const { origin, name, modelProfiles, startup } = state.binding;
		if (origin !== "user") return { origin, name, modelProfiles };
		if (startup !== undefined) return startup;
	} else if (state.status === "cleared" && state.startup === "none") return "none";
	return readSessionProfileOwnStartup(sessionId);
}

/** Where a clear goes back to, named with the status label convention. */
function startupStateText(startup: SessionProfileStartupState): string {
	return startup === "none" ? "no profile, as this session started" : `the profile this session started with, "${sessionProfileLabel({ kind: "inherited", profile: startup })}", and use it`;
}

/**
 * `/td:profiles clear`: go back to the startup state when it is known
 * (gentle-shell#2742, section 3), else append a legacy clear record, and publish
 * only the returned state. Never-bound, already-cleared and startup sessions
 * write nothing; an unreadable record is the recovery case and is replaced.
 * Follow mode has no startup state, so a startup record gets a legacy clear
 * (section 6). The live orchestrator and every shared default stay untouched.
 */
async function handleProfilesClear(ctx: ExtensionContext): Promise<void> {
	const sessionId = ctx.sessionManager?.getSessionId?.();
	if (typeof sessionId !== "string" || sessionId.length === 0) {
		ctx.ui.notify("Tomidev cannot clear the session profile: no parent session id is available here.", "warning");
		return;
	}
	const selected = await runCurrentSessionProfileSelection(ctx.sessionManager, async (attachment, owned) => {
		const prior = attachment.refresh().state;
		// An unsaved or in-memory branch reads as indeterminate; without any profile
		// record on the branch it was never selected, so nothing is written.
		const selectedBefore = ctx.sessionManager.getBranch().some((entry) => isSessionProfileFamilyEntry(entry));
		const notifyAlreadyThere = (label: string | undefined) =>
			ctx.ui.notify(label === undefined ? "Tomidev: this session is already on no profile, as it started; nothing to clear." : `Tomidev: this session is already on the profile it started with, "${label}"; nothing to clear.`, "info");
		if (prior.status === "absent" || (prior.status === "indeterminate" && !selectedBefore)) {
			// Never selected but started here: the session is on its startup state.
			const ownStartup = profileFollowEnabled() ? undefined : readSessionProfileOwnStartup(sessionId);
			if (ownStartup !== undefined) notifyAlreadyThere(ownStartup === "none" ? undefined : sessionProfileLabel({ kind: "inherited", profile: ownStartup }));
			else ctx.ui.notify("Tomidev: no session profile was ever selected in this session; nothing to clear.", "info");
			return true;
		}
		const startupOrigin = prior.status === "bound" && prior.binding.origin !== "user" ? prior.binding.origin : undefined;
		if (!profileFollowEnabled() && (startupOrigin !== undefined || (prior.status === "cleared" && prior.startup === "none"))) {
			notifyAlreadyThere(prior.status === "bound" && startupOrigin ? sessionProfileLabel({ kind: "inherited", profile: { ...prior.binding, origin: startupOrigin } }) : undefined);
			return true;
		}
		if (prior.status === "cleared" && prior.startup !== "none") {
			ctx.ui.notify("Tomidev: this session profile is already cleared; nothing to clear.", "info");
			return true;
		}
		const startup = knownSessionProfileStartup(prior, sessionId);
		const outcome = typeof startup === "object" ? attachment.bindStartup(startup.origin, startup.name, startup.modelProfiles) : attachment.clear(startup);
		if (!owned()) return false;
		const authority = publishSessionProfileOutcome(ctx.sessionManager, outcome);
		if ((outcome.status !== "persisted" && outcome.status !== "not-persisted") || outcome.state.status !== (typeof startup === "object" ? "bound" : "cleared") || !authority.available) {
			ctx.ui.notify(
				`Tomidev could not clear the session profile. ${authority.available ? "The last disk-corroborated state was preserved." : "Session profile authority is unavailable; affected launches are blocked."}`,
				"warning",
			);
			return false;
		}
		const what = prior.status === "bound" ? `session profile "${prior.binding.name}"` : prior.status === "cleared" ? "the recorded startup state" : "the unreadable session profile record";
		const persistence = outcome.status === "persisted" ? "persisted in this session" : "not yet persisted; active only until detach or disk corroboration";
		if (startup !== undefined) {
			ctx.ui.notify(`Tomidev cleared ${what} (${persistence}). New launches go back to ${startupStateText(startup)}. The live orchestrator is unchanged.`, "info");
			return true;
		}
		ctx.ui.notify(
			`Tomidev cleared ${what} — ${outcome.status === "persisted" ? "persisted in this session" : "not yet persisted; active only until detach or disk corroboration"}. New launches use the routing without a session profile (pins, repository declaration, global). The live orchestrator is unchanged.`,
			"info",
		);
		return true;
	});
	// A selection skipped by a reload or session replacement leaves a stale ctx;
	// only a still-active command reports the missing attachment.
	if (selected === undefined && isCommandContextActive(ctx))
		ctx.ui.notify("Tomidev cannot clear the session profile: the current session attachment is unavailable. Nothing was changed.", "warning");
}

/**
 * Whether this `session_start` is the session's own start (gentle-shell#2742,
 * section 3). Pi has no new-session flag: "startup" also opens an existing
 * session file, and a reload or resume restarts a session that already began.
 * Before `session_start`, Pi records the model and thinking level of a session
 * without a conversation, a new one included, so an own start holds at most
 * that one pair. A profile record, any other entry, or an earlier pair means
 * the session started before, and its startup state stays unknown.
 */
function isSessionOwnStart(event: { reason: string }, manager: ExtensionContext["sessionManager"]): boolean {
	if (event.reason !== "startup" && event.reason !== "new") return false;
	const seen = new Set<string>();
	for (const entry of manager.getEntries()) {
		if ((entry.type !== "model_change" && entry.type !== "thinking_level_change") || seen.has(entry.type)) return false;
		seen.add(entry.type);
	}
	return true;
}

/**
 * Warn when the current session profile record cannot be read: an invalid record
 * or one from a newer version blocks affected launches instead of falling back.
 */
function notifySessionProfileProblem(ctx: ExtensionContext): void {
	const state = readCurrentSessionProfileOutcome(ctx.sessionManager)?.state;
	if (state?.status !== "invalid" && state?.status !== "unsupported") return;
	const file = ctx.sessionManager.getSessionFile?.() ?? "this in-memory session";
	const where = `${sanitizeTerminalText(file)} entry ${state.entryIndex ?? "?"}${state.lineNumber === undefined ? "" : ` (line ${state.lineNumber})`}`;
	const kind = state.status === "invalid" ? "invalid" : "from a newer version";
	ctx.ui.notify(
		`Tomidev: the session profile record at ${where} is ${kind}. Subagent launches are blocked until it is replaced. Select a profile with Enter or run /td:profiles clear.`,
		"warning",
	);
}

/** Pi's runner throws on any access to a ctx made stale by reload or session replacement. */
function isCommandContextActive(ctx: ExtensionContext): boolean {
	try {
		void ctx.sessionManager;
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
let processTelemetryTriggerAttempted = false;

/** Testing-only reset for the once-per-process telemetry trigger guard. */
function resetTelemetryTriggerGuardForTesting(): void {
	processTelemetryTriggerAttempted = false;
}

type PendingReviewConsentSessionKey = string | symbol;

function pendingReviewConsentSessionKey(context: ExtensionContext | undefined, fallbackKey: symbol): PendingReviewConsentSessionKey {
	try {
		const sessionManager = (context as unknown as { sessionManager?: { getSessionId?: () => unknown } } | undefined)?.sessionManager;
		const sessionId = sessionManager?.getSessionId?.();
		if (typeof sessionId === "string") return sessionId;
	} catch { /* Minimal or test contexts use the registration-local fallback. */ }
	return fallbackKey;
}

/** @internal */
export const __testing = {
	readSavedModelConfig,
	readSavedModelConfigAsync,
	runProfilesPanelAction,
	openProfilesPanelLoop,
	notifySessionProfileProblem,
	readEffectiveModelConfig,
	readReviewerModelConfig,
	reviewHostRelaySelection,
	readEffectiveModelConfigAsync,
	followRenamedPin,
	profilePinScopeNote,
	listAgentsFromDir,
	listAgentsFromDirAsync,
	listDiscoverableAgents,
	orderDiscoverableAgents,
	classifyGuardedCommand,
	evaluateGuardedCommand,
	findSensitiveCommandPath,
	shellCommandWords,
	guardedCommandPreview,
	guardedCommandTitle,
	loadRuntimeGuardrailsConfig,
	confirmCommand,
	saveGuardedCommandAllowAlways,
	sessionAllowedCheck,
	sessionAllowedRemember,
	isReversibleYoloCommand,
	evaluateSuperYoloCommand,
	yoloConfiguredRestriction,
	BASH_COMMAND_POLICIES,
	evaluateBashPolicies,
	buildGentlePrompt,
	routingTablePanel: renderRoutingTableForTesting,
	fileRoutingFallbacks,
	piThinkingSupport: getPiThinkingSupport,
	getOrchestratorPrompt,
	renderOrchestratorPrompt,
	loadBackgroundSubagentsPolicy,
	resolveBackgroundSubagentsPolicy,
	renderBackgroundSubagentsReport,
	writeGlobalBackgroundSubagentsPolicy,
	parseBackgroundSubagentsPolicyFile,
	resolveBackgroundSubagentsCapability,
	readActiveToolNames,
	renderBackgroundSubagentsStatusLine,
	resetTelemetryTriggerGuardForTesting,
	createGentleAiExtension: createGentleAiExtensionForTesting,
	getPiModelOptions,
	MODEL_CONTROL_OPTIONS,
	switchLiveOrchestrator,
};

export interface GentleAiRuntimeDependencies {
	nativeReviewCli?: unknown;
	candidateViews?: unknown;
	pendingReviewConsentRegistry?: unknown;
	childStandingReviewPermissionClient?: unknown;
	processEnv?: NodeJS.ProcessEnv;
	resolvePermissionIdentity?: typeof resolveCanonicalGitRepositoryIdentity;
	resolveTelemetryTriggerBinary?: () => string;
	telemetryTriggerSpawn?: TelemetryTriggerSpawn;
	telemetryExecFileAdapter?: ExecFileAdapter;
	autoPermissionClassifier?: AutoRuntimeClassifier;
	contextBackstopMeasure?: { now?: () => number; minIntervalMs?: number };
}

export function createGentleAiExtension(dependencies: GentleAiRuntimeDependencies = {}): (pi: ExtensionAPI) => void {
	return createGentleAiExtensionForTesting(dependencies);
}

function createGentleAiExtensionForTesting(
	dependencies: GentleAiRuntimeDependencies = {},
): (pi: ExtensionAPI) => void {
	const resolveTelemetryTriggerBinary = dependencies.resolveTelemetryTriggerBinary ?? (() => "");
	const telemetryExecFileAdapter = dependencies.telemetryExecFileAdapter ?? createNodeExecFileAdapter();
	return function gentleAi(pi: ExtensionAPI): void {
	const pendingReviewConsentFallbackKey = Symbol("pending-review-consent-fallback");
	const herdrLifecycle = createHerdrConfirmationLifecycle(pi.events);
	const permissionEnvironment = dependencies.processEnv ?? process.env;
	let autoPermissions: AutoPermissionRuntime | undefined;
	const yolo = registerYoloSessionPolicy(pi, permissionEnvironment, {
		onChange: () => autoPermissions?.cancelPending(),
		resolveIdentity: dependencies.resolvePermissionIdentity,
	});
	let classifier: AutoPermissionClassifier | undefined;
	autoPermissions = new AutoPermissionRuntime(pi, yolo, dependencies.autoPermissionClassifier ?? {
		run: request => {
			classifier ??= new AutoPermissionClassifier(request.modelRegistry);
			return classifier.run(request);
		},
		cancel: () => classifier?.cancel(),
	}, { configHome: gentlePiConfigHome(permissionEnvironment) });
	const auto = autoPermissions;
	const verifierSettleReminders = createVerifierSettleReminders<PendingReviewConsentSessionKey>();
	const explorationBudget = createExplorationBudget();
	const verifierSettleNamedRuns = new Map<PendingReviewConsentSessionKey, number>();
	pi.on("tool_result", (event, ctx) => {
		if (permissionEnvironment[ENV_AGENTS_CHILD] !== "1") auto.toolResult(event, ctx);
	});
	const humanReplyTexts = new Map<PendingReviewConsentSessionKey, string>();
	const persistedReplyAnchors = new Map<PendingReviewConsentSessionKey, string>();
	pi.on("context", (event, ctx) => {
		if (permissionEnvironment[ENV_AGENTS_CHILD] === "1") return undefined;
		const key = pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey);
		const anchor = replyLanguageAnchorFor(event.messages, humanReplyTexts.get(key));
		if (anchor === undefined) return undefined;
		if (persistedReplyAnchors.get(key) !== anchor.tail) {
			persistedReplyAnchors.set(key, anchor.tail);
			try { pi.sendMessage({ customType: REPLY_LANGUAGE_ANCHOR_TYPE, content: anchor.text, display: false }, { triggerTurn: false }); } catch { /* The trailing copy below still serves this request. */ }
		}
		return { messages: [...event.messages, { role: "custom", customType: REPLY_LANGUAGE_ANCHOR_TYPE, content: anchor.text, display: false, timestamp: Date.now() }] };
	});

	pi.on("input", (event, ctx) => {
		if (permissionEnvironment[ENV_AGENTS_CHILD] !== "1" && isHumanInput(event.source, event.text)) {
			const key = pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey);
			humanReplyTexts.set(key, event.text);
			persistedReplyAnchors.delete(key);
		}
		if (permissionEnvironment[ENV_AGENTS_CHILD] !== "1") auto.input(event, ctx);
		if (permissionEnvironment[ENV_AGENTS_CHILD] !== "1" && event.streamingBehavior !== "steer") {
			verifierSettleReminders.userPrompt(pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey));
		}
		return { action: "continue" };
	});

	const sessionProfiles = createSessionProfileIntegration();
	pi.on("session_before_fork", async (event, ctx) => {
		await waitCurrentSessionProfileSelection(ctx.sessionManager);
		sessionProfiles.beforeFork(ctx.sessionManager, { entryId: event.entryId, position: event.position });
	});
	pi.on("session_before_tree", async (_event, ctx) => {
		await waitCurrentSessionProfileSelection(ctx.sessionManager);
	});
	pi.on("session_tree", (_event, ctx) => {
		auto.reset();
		readSessionProfileAuthority(ctx.sessionManager);
		if (ctx.hasUI) notifySessionProfileProblem(ctx);
	});

	pi.on("session_shutdown", (event, context) => {
		if (hasPendingSessionProfileSelection(context.sessionManager)) {
			return waitCurrentSessionProfileSelection(context.sessionManager).then(() => shutdownSession(event, context));
		}
		shutdownSession(event, context);
	});
	const processAgentEndSubagentDepth = new Map<unknown, number>();
	function shutdownSession(event: SessionShutdownEvent, context: ExtensionContext): void {
		if (sessionProfiles.isCurrent(context.sessionManager)) {
			clearSessionProfileBinding(context.sessionManager.getSessionId());
			sessionProfiles.shutdown(context.sessionManager, event);
		}
		auto.reset();
		yolo.reset(context);
		const sessionKey = pendingReviewConsentSessionKey(context, pendingReviewConsentFallbackKey);
		processAgentEndSubagentDepth.delete(sessionKey);
		verifierSettleNamedRuns.delete(sessionKey);
	}

	const hiddenOddPhaseToolComponent = { render: (_width: number): string[] => [], invalidate() {} };
	pi.registerTool({
		name: "gentle_odd_phase",
		renderShell: "self",
		label: "Gentle ODD Phase",
		description: "Refine the primary session's current ODD phase for the Gentle prompt's working label. Best-effort UI only; never a source of truth for orchestration logic.",
		promptSnippet: "Refine the automatically inferred working label only at real ODD phase transitions; never poll or report per tool call.",
		promptGuidelines: [
			"Pass phase exactly as its schema enum; call only when the ODD phase actually changes for the primary session's active turn, never per tool call or thought.",
			"Never call this from a subagent or background/child task; it reports only the primary orchestrator's own phase, and a child's session id can never override the parent's label.",
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			required: ["phase"],
			properties: {
				phase: { type: "string", enum: [...ODD_PHASES, "clear"], description: "The reported ODD phase, or 'clear' to leave the current phase." },
			},
		} as const,
		executionMode: "parallel",
		renderCall() {
			return hiddenOddPhaseToolComponent;
		},
		renderResult(result, _options, theme, context) {
			if (!context.isError) return hiddenOddPhaseToolComponent;
			const message = result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
			return new Text(theme.fg("error", sanitizeTerminalText(message || "ODD phase report failed.")), 0, 0);
		},
		async execute(_toolCallId, parameters, _signal, _onUpdate, ctx) {
			const phase = (parameters as { phase?: unknown }).phase;
			const sessionId = ctx.sessionManager.getSessionId();
			if (!sessionId) throw new Error("No active session to report an ODD phase for; nothing changed.");
			if (phase === "clear") {
				oddPhaseRegistry.clear(sessionId);
				return { content: [{ type: "text", text: "ODD phase cleared." }], details: { phase: undefined } };
			}
			if (!isOddPhase(phase)) {
				throw new Error(`Invalid ODD phase; use one of ${ODD_PHASES.join(", ")}, or "clear". The previously reported phase, if any, is unchanged.`);
			}
			const reported = oddPhaseRegistry.report(sessionId, phase, "explicit");
			return { content: [{ type: "text", text: `ODD phase reported: ${reported}` }], details: { phase: reported } };
		},
	});

	pi.on("session_start", async (event, ctx) => {
		const profileSessionId = ctx.sessionManager?.getSessionId?.();
		if (profileSessionId) clearSessionProfileBinding(profileSessionId);
		sessionProfiles.start(ctx.sessionManager, (type, data) => pi.appendEntry(type, data), event);
		try {
			if (profileSessionId && isSessionOwnStart(event, ctx.sessionManager))
				freezeSessionProfileAtOwnStart({ sessionId: profileSessionId, cwd: ctx.sessionManager.getCwd(), configHome: gentleAiConfigHome() });
		} catch { /* The startup state stays unknown. */ }
		readSessionProfileAuthority(ctx.sessionManager);
		if (ctx.hasUI) notifySessionProfileProblem(ctx);
		auto.reset();
		yolo.reset(ctx);
		if (permissionEnvironment[ENV_AGENTS_CHILD] !== "1") await yolo.mode(ctx);
		if (permissionEnvironment[ENV_AGENTS_CHILD] !== "1") await startParentSession(event, ctx);
	});

	const startParentSession = async (event: unknown, ctx: ExtensionContext): Promise<void> => {
		const homeRoot = homeRootedRepository(ctx.cwd);
		if (homeRoot !== undefined && ctx.hasUI && !homeRepositoryWarnings.has(homeRoot)) {
			homeRepositoryWarnings.add(homeRoot);
			try { ctx.ui.notify(HOME_REPOSITORY_WARNING, "warning"); } catch { /* Nonblocking notice only. */ }
		}
		try {
			const installResult = installPackageAssets(ctx.cwd, true, ["delegation", "review"]);
			migrateLegacyProjectModelOverrides(ctx.cwd);
			const modelResult = await applySavedModelConfig(ctx);
			if (ctx.hasUI && modelResult.invalidPath) {
				ctx.ui.notify(
					`Tomidev skipped model config because ${modelResult.invalidPath} is invalid JSON or not an object. Fix or remove the file, then run /td:profiles again.`,
					"warning",
				);
				return;
			}
			if (ctx.hasUI && modelResult.updated > 0) {
				ctx.ui.notify(
					`Tomidev applied saved model config to ${modelResult.updated} agent(s). Global delegation assets ready: ${installResult.agents} new agent(s), ${installResult.chains} new chain(s), ${installResult.support} new support file(s).`,
					"info",
				);
			}
		} catch (error) {
			if (ctx.hasUI) {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					`Tomidev model config sweep failed: ${message}`,
					"warning",
				);
			}
		}
	};

	pi.on("before_agent_start", async (event, ctx) => {
		const isNamedAgent = isNamedAgentStartEvent(event);
		const isChildSession = permissionEnvironment[ENV_AGENTS_CHILD] === "1";
		const isPrimarySession = !isNamedAgent && !isChildSession;
		const subagentDepthKey = pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey);
		if (isPrimarySession && !ctx.signal?.aborted) explorationBudget.start(subagentDepthKey);
		if (isNamedAgent || isChildSession) {
			processAgentEndSubagentDepth.set(subagentDepthKey, (processAgentEndSubagentDepth.get(subagentDepthKey) ?? 0) + 1);
		} else {
			processAgentEndSubagentDepth.set(subagentDepthKey, 0);
		}
		verifierSettleNamedRuns.set(subagentDepthKey, isPrimarySession ? 0 : (verifierSettleNamedRuns.get(subagentDepthKey) ?? 0) + 1);

		if (isPrimarySession && !processTelemetryTriggerAttempted) {
			processTelemetryTriggerAttempted = true;
			try {
				const executable = resolveTelemetryTriggerBinary();
				if (executable) {
					spawnTelemetryTrigger({
						executable,
						cwd: ctx.cwd,
						env: dependencies.processEnv ?? process.env,
						spawn: dependencies.telemetryTriggerSpawn,
					});
				}
			} catch {
				// Best-effort only; never surfaced and never affects activation.
			}
		}

		const gentlePrompt = isPrimarySession
			? `\n\n${buildGentlePrompt(
					ctx.cwd,
					readActiveToolNames(pi),
					ctx.mode,
					resolveSessionDelegationMode(ctx, permissionEnvironment),
				)}`
			: "";

		appendSystemPromptOnce(event.systemPromptOptions, gentlePrompt);
		// Fresh for this prompt only; tool admission still revalidates independently.
		const permissionMode = isPrimarySession ? await yolo.mode(ctx) : "normal";
		updateYoloPrompt(event.systemPromptOptions, permissionMode === "yolo", permissionMode === "super-yolo");
		updateAutoPrompt(event.systemPromptOptions, permissionMode === "auto");
		return undefined;
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (permissionEnvironment[ENV_AGENTS_CHILD] === "1") return;
		const sessionKey = pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey);
		const subagentDepth = processAgentEndSubagentDepth.get(sessionKey) ?? 0;
		if (subagentDepth > 0) {
			processAgentEndSubagentDepth.set(sessionKey, subagentDepth - 1);
		}
	});

	pi.on("agent_before_settle", (event, ctx) => {
		if (permissionEnvironment[ENV_AGENTS_CHILD] === "1") return undefined;
		const sessionKey = pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey);
		if ((verifierSettleNamedRuns.get(sessionKey) ?? 0) > 0) return undefined;
		if (event.outcome !== "completed") return undefined;
		const reminder = verifierSettleReminders.beforeSettle(
			sessionKey,
			finalAssistantText(event.context.contextMessages),
		);
		if (reminder === undefined) return undefined;
		return {
			entries: [...event.entries, { type: "custom_message", customType: VERIFIER_SETTLE_REMINDER_TYPE, content: reminder, display: true }],
			continue: true,
		};
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (permissionEnvironment[ENV_AGENTS_CHILD] === "1") return;
		const sessionKey = pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey);
		const namedRuns = verifierSettleNamedRuns.get(sessionKey) ?? 0;
		if (namedRuns > 0) verifierSettleNamedRuns.set(sessionKey, namedRuns - 1);
		else explorationBudget.settle(sessionKey);
	});

	const contextBackstopSignal = createContextBackstopSignal(permissionEnvironment);
	const contextBackstopMeasure = createThrottledContextMeasure({
		now: dependencies.contextBackstopMeasure?.now,
		minIntervalMs: dependencies.contextBackstopMeasure?.minIntervalMs,
		env: permissionEnvironment,
	});
	pi.on("tool_result", async (event, ctx) => {
		const sessionKey = pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey);
		const primary = permissionEnvironment[ENV_AGENTS_CHILD] !== "1" && (processAgentEndSubagentDepth.get(sessionKey) ?? 0) === 0;
		const explorationNotice = explorationBudget.result(sessionKey, event, primary, ctx.signal?.aborted === true, () => resolveSessionDelegationMode(ctx, permissionEnvironment));
		if (explorationNotice && typeof ctx.isIdle === "function" && !ctx.isIdle()) {
			try { pi.sendMessage({ customType: "tomidev.exploration-budget", content: explorationNotice, details: explorationBudget.facts(sessionKey), display: true }, { deliverAs: "steer", triggerTurn: true }); } catch { /* Advisory only. */ }
		}
		let notice: string | undefined;
		try { notice = primary ? contextBackstopSignal(sessionKey, contextBackstopMeasure(sessionKey, () => ctx.getContextUsage?.()), () => resolveSessionDelegationMode(ctx, permissionEnvironment)) : undefined; } catch { notice = undefined; }
		const withNotice = (patch: ToolResultEventResult | undefined) => notice ? appendContextBackstopNotice(event, patch, notice) : patch;
		if (SHELL_COMMAND_TOOLS.has(event.toolName)) {
			if (permissionEnvironment[ENV_AGENTS_CHILD] === "1") return undefined;
			try { return withNotice(await commitSliceToolResult(event, ctx.cwd)); } catch { return withNotice(undefined); }
		}
		return withNotice(undefined);
	});

	pi.on("tool_call", async (event, ctx) => {
		const primaryToolCall = permissionEnvironment[ENV_AGENTS_CHILD] !== "1" && (processAgentEndSubagentDepth.get(pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey)) ?? 0) === 0;
		if (primaryToolCall && !ctx.signal?.aborted) explorationBudget.call(pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey), event.toolCallId, event.toolName, event.parentToolCallId);
		if (primaryToolCall) verifierSettleReminders.toolCall(pendingReviewConsentSessionKey(ctx, pendingReviewConsentFallbackKey), event.toolName, event.input);
		const settledMode = primaryToolCall ? await yolo.mode(ctx, { toolCallId: event.toolCallId }) : "normal";
		const yoloActive = primaryToolCall && settledMode === "yolo";
		const superYoloActive = primaryToolCall && settledMode === "super-yolo";
		const sensitivePathDenied = evaluateSensitivePathTool(
			event.toolName,
			event.input,
		);
		if (sensitivePathDenied) return sensitivePathDenied;
		const surfaceDenied = evaluateExecutionSurfaceTool(event.toolName, event.input);
		if (surfaceDenied) return surfaceDenied;
		const deliveredTestDenied = evaluateDeliveredTestTool(event.toolName, event.input, ctx.cwd);
		if (deliveredTestDenied) return deliveredTestDenied;
		if (event.toolName === "subagent_run") {
			const writerScopeDenied = rejectUnscopedBoundedWriterDispatch(event.input);
			if (writerScopeDenied) return writerScopeDenied;
			return undefined;
		}
		const modeConfigDenied = auto.guard(event, ctx);
		if (modeConfigDenied) return modeConfigDenied;
		const gate = async (): Promise<ToolCallEventResult | undefined> => {
			try { return await auto.check(event, ctx, primaryToolCall); }
			catch { return { block: true, reason: "Auto permission checking failed. This action was not run; do not bypass the check." }; }
		};
		if (!SHELL_COMMAND_TOOLS.has(event.toolName) || !isRecord(event.input)) return gate();
		const command = (event.input as { command?: unknown }).command;
		if (typeof command !== "string") return gate();
		// Every shell command is judged, with or without human input: a commit or push needs the human's confirmation here.
		const enforcement = await evaluateTomidevCommandEnforcement(command, ctx.cwd, {
			childSession: permissionEnvironment[ENV_AGENTS_CHILD] === "1",
			confirm: ctx.hasUI ? (title, message) => ctx.ui.confirm(title, message) : undefined,
		});
		if (enforcement.block) return enforcement;
		if (permissionEnvironment[ENV_AGENTS_CHILD] === "1") {
			const childDenied = blockChildDestructiveCommand(command);
			if (childDenied) return childDenied;
		}
		const modeEpoch = yolo.epoch();
		const permissionMode = primaryToolCall ? await yolo.mode(ctx) : "normal";
		if (primaryToolCall && modeEpoch !== yolo.epoch()) {
			return { block: true, reason: "Permission mode changed during tool admission. This action was not run; retry under the current mode." };
		}
		const autoGate = permissionMode === "auto" ? gate : undefined;
		return await evaluateBashPolicies(
			command,
			ctx,
			pi.events,
			herdrLifecycle,
			yoloActive,
			BASH_COMMAND_POLICIES,
			autoGate,
			superYoloActive,
			enforcement.block === false && enforcement.gitConfirmed,
		);
	});

	for (const owner of ["delegation", "review"] as const) {
		const label = owner;
		pi.registerCommand(brandCommand(`install-${owner}`), {
			description: `Repair or refresh only global Gentle AI ${label} assets.`,
			handler: async (args, ctx) => {
				const force = args.includes("--force");
				const result = installPackageAssets(ctx.cwd, force, [owner]);
				ctx.ui.notify(
					`Global Gentle AI ${label} assets installed: ${result.agents} agent(s), ${result.chains} chain(s), ${result.support} support file(s), ${result.skipped} already present.`,
					"info",
				);
			},
		});
	}

	pi.registerCommand(brandCommand("profiles"), {
		description: "Open the models screen (profiles as tabs). Subcommands: export <name>, import, publish <name>, export-routing, restore-routing, clear.",
		handler: async (args, ctx) => {
			await handleProfilesCommand(ctx, pi, typeof args === "string" ? args : "");
		},
	});

	pi.registerCommand(brandCommand("doctor"), {
		description: "Run read-only Gentle AI diagnostics for this Pi workspace.",
		handler: async (_args, ctx) => {
			const assetLines = packageAssetDiagnosticLines(ctx.cwd);
			const skillRegistryPresent = existsSync(
				join(ctx.cwd, ".atl", "skill-registry.md"),
			);
			const modelConfig = await readSavedModelConfigAsync(ctx.cwd);
			const engramActive = hasWritableEngramTool(pi);
			const lines = [
				"Tomidev doctor",
				...assetLines,
				"pass: Organic Driven Development (ODD): active",
				`${skillRegistryPresent ? "pass" : "warn"}: Skill registry ${skillRegistryPresent ? "present" : "missing"}`,
				`${modelConfig.status === "invalid" ? "fail" : "pass"}: Global model config ${modelConfig.status}`,
				"pass: Sensitive-path guard active for read/write/edit tools",
				`${engramActive ? "pass" : "warn"}: Engram memory tools ${engramActive ? "active" : "not active in this session"}`,
			];
			if (modelConfig.status === "invalid") {
				lines.push(`remedy: fix or remove ${modelConfig.path}`);
			}
			lines.push(...herdrSetupHint(process.env, {
				interactive: ctx.mode === "tui" && ctx.hasUI,
				isSocket: (path) => { try { return statSync(path).isSocket(); } catch { return false; } },
			}));
			ctx.ui.notify(
				lines.join("\n"),
				lines.some((line) => line.startsWith("fail:")) || assetLines.some((line) => line.startsWith("warn:")) ? "warning" : "info",
			);
		},
	});

	pi.registerCommand(brandCommand("telemetry"), {
		description: "Show or change the local Gentle AI telemetry trigger (status|enable|disable|preview); gentle-ai owns the data and the opt-out.",
		handler: async (args, ctx) => {
			const subAction = args.trim().length === 0 ? "status" : args.trim();
			if (subAction !== "status" && subAction !== "enable" && subAction !== "disable" && subAction !== "preview") {
				ctx.ui.notify(`Unknown /td:telemetry sub-action "${subAction}". Use status, enable, disable, or preview.`, "warning");
				return;
			}
			let executable: string;
			try {
				executable = resolveTelemetryTriggerBinary();
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}
			let result: ExecFileResult;
			try {
				result = await telemetryExecFileAdapter({
					file: executable,
					arguments: ["telemetry", subAction, "--json"],
					cwd: ctx.cwd,
					timeoutMs: 5_000,
					maxBufferBytes: 1024 * 1024,
				});
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}
			if (result.exitCode !== 0) {
				ctx.ui.notify(`gentle-ai telemetry ${subAction} failed (exit ${result.exitCode}): ${(result.stderr || result.stdout || "no output").trim()}`, "error");
				return;
			}
			let relayed: string;
			try {
				relayed = JSON.stringify(JSON.parse(result.stdout), null, 2);
			} catch {
				relayed = result.stdout.trim();
			}
			if (subAction === "disable") {
				ctx.ui.notify("Gentle AI telemetry disabled.", "info");
				return;
			}
			ctx.ui.notify(relayed, "info");
		},
	});

	pi.registerCommand(brandCommand("background-subagents"), {
		description: "Show or set the managed background-subagents policy; no argument opens a selectable menu (status|enable|disable). Every sub-action is user-initiated only; Pi automation never toggles it.",
		handler: async (args, ctx) => {
			let subAction = args.trim().length === 0 ? "status" : args.trim();
			if (args.trim().length === 0 && ctx.hasUI && typeof ctx.ui.select === "function") {
				const selected = await ctx.ui.select("Background subagents policy", ["status", "enable", "disable"]);
				if (selected === undefined) return;
				subAction = selected;
			}
			if (subAction !== "status" && subAction !== "enable" && subAction !== "disable") {
				ctx.ui.notify(`Unknown /td:background-subagents sub-action "${subAction}". Use status, enable, or disable.`, "warning");
				return;
			}
			try {
				const wrote: BackgroundSubagentsPolicy | undefined = subAction === "enable" ? "on" : subAction === "disable" ? "off" : undefined;
				if (wrote !== undefined) writeGlobalBackgroundSubagentsPolicy(wrote);
				const resolution = resolveBackgroundSubagentsPolicy(ctx.cwd);
				const capability = resolveBackgroundSubagentsCapability(ctx.cwd, readActiveToolNames(pi));
				const report = renderBackgroundSubagentsReport(resolution, capability, wrote);
				ctx.ui.notify(report.message, report.type);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});

	pi.registerCommand(brandCommand("status"), {
		description: "Show Gentle AI package status for this project.",
		handler: async (_args, ctx) => {
			const assetLines = packageAssetDiagnosticLines(ctx.cwd);
			const savedConfig = await readModelRoutingAuthorityAsync(
				modelConfigPath(ctx.cwd),
				legacyProjectModelConfigPath(ctx.cwd),
			);
			ctx.ui.notify(
				[
					"Tomidev package is active.",
					"Persona: senior-architect (fixed)",
					...assetLines,
					"Organic Driven Development (ODD): active",
					`Global model config: ${existsSync(modelConfigPath(ctx.cwd)) ? "present" : "missing"}`,
					`Saved model routing: ${savedConfig.status}${savedConfig.status === "invalid" ? ` (${savedConfig.path})` : ""}`,
					...(savedConfig.status === "invalid" ? [] : describeModelConfig(ctx.cwd, savedConfig.status === "valid" ? savedConfig.config : {})),
				].join("\n"),
				savedConfig.status === "invalid" || assetLines.some((line) => line.startsWith("warn:")) ? "warning" : "info",
			);
		},
	});
	};
}

export default function gentleAi(pi: ExtensionAPI): void {
	return createGentleAiExtension()(pi);
}
