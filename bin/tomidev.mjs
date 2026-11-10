#!/usr/bin/env node
// Thin process/fs/exec glue around lib/gentle-shell-launcher.ts (built to
// runtime/gentle-shell-launcher.mjs). All decision logic — argv parsing, home
// resolution, pi resolution order, the version gate, and the pi invocation —
// lives in that pure, unit-tested module; this file only wires it to the real
// process, filesystem, and child process.
import {
	accessSync,
	chmodSync,
	closeSync,
	constants as fsConstants,
	copyFileSync,
	existsSync,
	fstatSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { constants as osConstants, homedir, tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve as resolvePath } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	buildPiInvocation,
	checkPiVersion,
	decideTakeOver,
	describeVersion,
	discoverLooseExtensionEntries,
	findGentlePiDeclaration,
	helpText,
	homeSelectorFlags,
	HOME_OWNERSHIP_MARKER,
	launcherConfigPath,
	legacyHomeMigrationApplies,
	SETUP_VERSION,
	missingSetupCompanions,
	missingPiMessage,
	needsProvisioning,
	otherPackageInjections,
	parseLauncherArgs,
	parseLauncherConfig,
	parseRawLauncherConfig,
	planSpawn,
	postInstallRemovals,
	provisionedEntry,
	migrateLegacyHome,
	migrateStandaloneConfig,
	recordProvisioned,
	resolveHome,
	resolvePiRuntime,
	separateHomeHint,
	shellQuote,
	standaloneConfigHome,
	userPiHome,
	HERDR_REPORTER_ENV,
} from "../runtime/gentle-shell-launcher.mjs";
import { formatImportPiReport, importPi } from "../runtime/gentle-shell-import-pi.mjs";
import {
	BUNDLED_VERIFY_ENV,
	classifyEngramStartup,
	ENGRAM_COMPANION_SOURCE,
	ENGRAM_DEFAULT_URL,
	ENGRAM_RECOVERY_NOTICE,
	ENGRAM_START_FAILED_NOTICE,
	TOMIDEV_SHELL_CONFIG_HOME_ENV,
	engramProbeAllowed,
	sharedEngramEnv,
	piVersionOrHelpRequested,
	probeEngramEndpoint,
	sqliteHeaderUserVersion,
	supportsEngramStartupPolicy,
	bundledChildEnv,
	bundledPi,
	bundledSetupEnv,
	bundledUpdateNext,
	bundledUpdatePlan,
	nodeBundledFs,
	parseBundledUpgradeArgs,
	resolveBundledInstall,
	withBundledNpmCommand,
	withoutMissingBundledNpmCommand,
} from "../runtime/gentle-shell-bundled.mjs";
import {
	parseResumeHandoff,
	planResumeHint,
	RESUME_HANDOFF_DIR_PREFIX,
	RESUME_HANDOFF_ENV,
	RESUME_HANDOFF_FILE,
} from "../runtime/gentle-shell-resume-hint.mjs";
import { bundledEngramPath } from "../runtime/gentle-shell-bundled.mjs";
import { installIsolatedTuiModeSetting } from "../scripts/install-tui-mode-setting.mjs";
import { artifactFor, engramPinVersion } from "../scripts/installer-downloads.mjs";
import { migrateBundledEngram, migrationPending, MIGRATION_PENDING_NOTICE, MIGRATION_USAGE } from "../scripts/bundled-engram-migration.mjs";
import { BRAND_NAME, ENV_AGENTS_CHILD, ENV_AGENT_HOME, ENV_CONFIG_HOME, ENV_PREFIX, HOME_DIRNAME, LOG_PREFIX, BRAND_DISPLAY_NAME } from "../runtime/brand.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message, code) {
	process.stderr.write(`${message}\n`);
	process.exit(code);
}

function readJsonIfExists(path) {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}

// Resolve the public ESM entry without importing the agent or reaching through
// its exports map. Only an absent optional peer permits PATH fallback; malformed
// installed metadata must not silently select a different runtime.
function resolveBundledCli() {
	let publicEntry;
	try {
		publicEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
	} catch (error) {
		if (error.code === "ERR_MODULE_NOT_FOUND") return undefined;
		throw error;
	}
	const entry = realpathSync(publicEntry);
	const root = dirname(dirname(entry));
	const expectedEntry = join(root, "dist", "index.js");
	const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	if (entry !== expectedEntry || metadata.name !== "@earendil-works/pi-coding-agent" ||
		metadata.bin?.pi !== "dist/bundle/cli.js" || typeof metadata.version !== "string") {
		throw new Error("Unsupported adjacent Pi package entry/name/bin metadata");
	}
	const cliPath = join(root, metadata.bin.pi);
	if (realpathSync(cliPath) !== cliPath || !statSync(cliPath).isFile()) {
		throw new Error("Unsupported adjacent Pi CLI path");
	}
	return { path: cliPath, version: metadata.version };
}

function findOnPath(name) {
	const dirs = (process.env.PATH || "").split(delimiter).filter((entry) => entry.length > 0);
	const extensions = process.platform === "win32" ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
	for (const dir of dirs) {
		for (const extension of extensions) {
			const candidate = join(dir, `${name}${extension}`);
			try {
				accessSync(candidate, fsConstants.X_OK);
				return candidate;
			} catch {
				// keep scanning
			}
		}
	}
	return undefined;
}

function signalExitCode(signal) {
	const number = osConstants.signals[signal];
	return 128 + (typeof number === "number" ? number : 0);
}

// A bundled install (S8): this package inside <prefix>/versions/<id> that
// `current` names (lib/gentle-shell-bundled.ts decides from these reads).
const bundledFs = nodeBundledFs;

// Set in a bundled install: the environment every child (Pi, setup, the version
// probe) starts from instead of process.env (the user's own plus Gentle Shell's
// variables), and the folders setup puts ahead of the user's PATH.
let bundledEnv;
let bundledSetupDirs;
// The bundled install and its Pi cli, for bundledProcessEnv and setup's Engram.
let bundledInstall;
let bundledCli;
let bundledMemory;
// The Shell-owned guard ENGRAM_BIN names when memory is disabled (bin/engram-guard).
const ENGRAM_GUARD = join(packageRoot, "bin", "engram-guard");

// The pinned core only as ensureEngram published it: its runtime marker for
// this release's archive and a regular file. Never a link or a PATH engram.
function verifiedBundledCore() {
	const core = bundledEngramPath(bundledInstall.root, process.platform);
	try {
		const marker = readFileSync(join(dirname(core), ".tomidev-runtime"), "utf8");
		if (marker === `${artifactFor("engram", process.platform, process.arch).url}\n` && lstatSync(core).isFile()) return core;
	} catch {
		// Missing, unmarked, or an unsupported target: no verified core.
	}
	return undefined;
}

// The database's raw SQLite header, read as a plain file (never through
// SQLite): a regular, unlinked engram.db whose opened identity is the one seen.
function readSqliteUserVersion(path) {
	let fd;
	try {
		const seen = lstatSync(path);
		if (!seen.isFile()) return undefined;
		fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
		const opened = fstatSync(fd);
		if (opened.ino !== seen.ino || opened.dev !== seen.dev) return undefined;
		const header = Buffer.alloc(100);
		return readSync(fd, header, 0, 100, 0) === 100 ? sqliteHeaderUserVersion(header, opened.size) : undefined;
	} catch {
		return undefined;
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

// Evidence only: the default store's raw header and a bounded read-only probe
// of the default endpoint. No Engram executable, SQLite, or contact with an
// explicitly selected endpoint. A `spawn` decision starts nothing here.
async function classifyBundledMemory() {
	if (migrationPending(bundledInstall.root)) return { policy: "disabled", notice: MIGRATION_PENDING_NOTICE };
	const decision = { env: process.env, core: verifiedBundledCore() !== undefined, coreVersion: engramPinVersion };
	if (!engramProbeAllowed(process.env)) return classifyEngramStartup({ ...decision, endpoint: { kind: "unknown" } });
	const endpoint = await probeEngramEndpoint();
	const userVersion = endpoint.kind === "refused" ? readSqliteUserVersion(join(homedir(), ".engram", "engram.db")) : undefined;
	return classifyEngramStartup({ ...decision, endpoint, userVersion });
}

// Like other agents' hooks, Shell starts the shared server when nothing
// listens: the verified core's plain `serve` on Engram's own default port and
// data directory, detached so it outlives Pi. Its environment drops the user's
// Engram settings and GitHub tokens and skips the update check. Ready means the
// same /compatibility contract any reused server must answer, so a concurrent
// launch that wins the bind converges too: after the child exits, polling
// continues for a short grace within the overall bound.
const ENGRAM_START_TIMEOUT_MS = 10000;
const ENGRAM_START_EXIT_GRACE_MS = 2000;

async function startSharedEngram() {
	const failed = { policy: "disabled", notice: ENGRAM_START_FAILED_NOTICE };
	const core = verifiedBundledCore();
	if (core === undefined) return failed;
	let deadline = Date.now() + ENGRAM_START_TIMEOUT_MS;
	const exited = () => { deadline = Math.min(deadline, Date.now() + ENGRAM_START_EXIT_GRACE_MS); };
	try {
		const env = sharedEngramEnv(process.env);
		const child = spawn(core, ["serve"], { cwd: homedir(), env, detached: true, stdio: "ignore", windowsHide: true });
		child.once("error", exited);
		child.once("exit", exited);
		child.unref();
	} catch {
		return failed;
	}
	while (Date.now() < deadline) {
		const endpoint = await probeEngramEndpoint({ timeoutMs: 500 });
		if (endpoint.kind === "listening" && endpoint.compatible) return { policy: "allow", url: ENGRAM_DEFAULT_URL };
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return failed;
}

const LEGACY_ENGRAM_COMPANION_SOURCE = "npm:gentle-engram@0.4.2";
const companionSource = (entry) => typeof entry === "string" ? entry : entry?.source;

function ownsCompanionHome(home, homeHadContentBeforeBootstrap) {
	if (home.mode === "link") return false;
	const previous = provisionedEntry(readRawConfig(resolveConfigPath()), safeRealpath(home.dir));
	return !homeIsForeign(home, previous, homeHadContentBeforeBootstrap);
}

// The old launcher itself registered this exact pin. In a Shell-owned home,
// migrate only that legacy selection, using the selected Pi's own package
// manager to keep source identity, filters, ordering and settings locking. This
// changes configuration only: Pi's normal startup notice and explicit update
// command remain responsible for discovering and installing newer packages.
async function migrateManagedEngramCompanion(home, homeHadContentBeforeBootstrap) {
	if (!ownsCompanionHome(home, homeHadContentBeforeBootstrap)) return { ok: true };
	try {
		const settingsPath = join(home.dir, "settings.json");
		const packages = JSON.parse(readJsonIfExists(settingsPath) ?? "{}").packages ?? [];
		if (!Array.isArray(packages)) return { ok: true };
		const npmSources = packages.map(companionSource).filter((source) => typeof source === "string" && /^npm:gentle-engram(?:@|$)/.test(source));
		if (npmSources.length !== 1 || npmSources[0] !== LEGACY_ENGRAM_COMPANION_SOURCE) return { ok: true };
		// Do not take over an explicitly selected local companion, or infer
		// ownership from a missing/unverified npm installation.
		if (packages.some((entry) => {
			const source = companionSource(entry);
			return typeof source === "string" && !source.startsWith("npm:") && readPackageName(resolvePath(home.dir, source)) === "gentle-engram";
		})) return { ok: true };
		const metadata = join(home.dir, "npm", "node_modules", "gentle-engram", "package.json");
		const metadataText = readJsonIfExists(metadata);
		if (!supportsEngramStartupPolicy(metadataText) || JSON.parse(metadataText).version !== "0.4.2") throw new Error("the legacy companion installation could not be verified");
		const piRoot = dirname(dirname(dirname(bundledCli)));
		const main = JSON.parse(readJsonIfExists(join(piRoot, "package.json")) ?? "{}").main;
		if (typeof main !== "string" || !main) throw new Error("the selected Pi does not expose its package manager");
		const sdkPath = resolvePath(piRoot, main);
		const sdkRelative = relative(piRoot, sdkPath);
		if (!sdkRelative || sdkRelative === ".." || sdkRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(sdkRelative)) throw new Error("the selected Pi package manager is outside its package");
		const { DefaultPackageManager, SettingsManager } = await import(pathToFileURL(sdkPath).href);
		const settings = SettingsManager.create(process.cwd(), home.dir, { projectTrusted: false });
		const loadErrors = settings.drainErrors();
		if (loadErrors.length) throw loadErrors[0].error;
		const selected = settings.getGlobalSettings().packages ?? [];
		const currentNpmSources = selected.map(companionSource).filter((source) => typeof source === "string" && /^npm:gentle-engram(?:@|$)/.test(source));
		const localSelected = selected.some((entry) => {
			const source = companionSource(entry);
			return typeof source === "string" && !source.startsWith("npm:") && readPackageName(resolvePath(home.dir, source)) === "gentle-engram";
		});
		if (localSelected || currentNpmSources.length !== 1 || currentNpmSources[0] !== LEGACY_ENGRAM_COMPANION_SOURCE) throw new Error("companion selection changed");
		const manager = new DefaultPackageManager({ cwd: process.cwd(), agentDir: home.dir, settingsManager: settings });
		manager.addSourceToSettings(ENGRAM_COMPANION_SOURCE);
		await settings.flush();
		const errors = settings.drainErrors();
		if (errors.length) throw errors[0].error;
		const persisted = JSON.parse(readJsonIfExists(settingsPath) ?? "{}").packages;
		if (!Array.isArray(persisted) || !persisted.some((entry) => companionSource(entry) === ENGRAM_COMPANION_SOURCE)) throw new Error("companion selection was not saved");
		return { ok: true };
	} catch (error) {
		return { ok: false, exitCode: 1, message: `${LOG_PREFIX} could not prepare the managed gentle-engram package for updates (${error.message}); review its selection before retrying` };
	}
}

// Use Pi's install command, never an alternate extension loader. A user's
// selected companion stays selected; missing or unverified capability is only
// warned about, while the guard continues to protect unverified stores.
async function ensureEngramCompanion(home, runtime, stdio, timeoutMs, homeHadContentBeforeBootstrap) {
	const metadata = join(home.dir, "npm", "node_modules", "gentle-engram", "package.json");
	let packages;
	try {
		packages = JSON.parse(readJsonIfExists(join(home.dir, "settings.json")) ?? "{}").packages ?? [];
	} catch {
		return { ok: false, exitCode: 1, message: `${LOG_PREFIX} cannot verify Engram startupPolicy from malformed settings; repair settings and recheck` };
	}
	if (!Array.isArray(packages)) return { ok: false, exitCode: 1, message: `${LOG_PREFIX} cannot verify Engram startupPolicy from non-array packages` };
	let local = false;
	const npmSelections = [];
	for (const entry of packages) {
		const source = companionSource(entry);
		if (typeof source === "string" && /^npm:gentle-engram(?:@|$)/.test(source)) npmSelections.push(source);
		if (typeof source !== "string" || source.startsWith("npm:")) continue;
		const selected = resolvePath(home.dir, source);
		if (readPackageName(selected) !== "gentle-engram") continue;
		if (!supportsEngramStartupPolicy(readJsonIfExists(join(selected, "package.json")))) {
			return { ok: false, exitCode: 1, message: `${LOG_PREFIX} selected companion ${source} lacks engram.startupPolicy=1; update it and recheck (selection preserved)` };
		}
		local = true;
	}
	if (npmSelections.length) {
		const metadataText = readJsonIfExists(metadata);
		if (supportsEngramStartupPolicy(metadataText)) {
			const installedVersion = JSON.parse(metadataText).version;
			const mismatch = npmSelections.some((source) => {
				const exact = /^npm:gentle-engram@v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(source);
				return exact && exact[1] !== installedVersion;
			});
			if (!mismatch) return { ok: true };
			return { ok: false, exitCode: 1, message: `${LOG_PREFIX} selected gentle-engram does not match its installed version; recheck its startupPolicy (selection preserved)` };
		}
		return { ok: false, exitCode: 1, message: `${LOG_PREFIX} selected gentle-engram lacks engram.startupPolicy=1; update it and recheck (selection preserved)` };
	}
	if (local || !ownsCompanionHome(home, homeHadContentBeforeBootstrap)) return { ok: true };
	process.stderr.write(`${LOG_PREFIX} installing policy-capable companion ${ENGRAM_COMPANION_SOURCE} through Pi\n`);
	const result = await spawnAndWait(runtime.command, [...runtime.args, "install", ENGRAM_COMPANION_SOURCE], buildSetupEnv(home, runtime), stdio, timeoutMs);
	let declared = false;
	try {
		declared = JSON.parse(readJsonIfExists(join(home.dir, "settings.json")) ?? "{}").packages?.some((entry) => companionSource(entry) === ENGRAM_COMPANION_SOURCE) === true;
	} catch { /* Missing or malformed readback cannot establish enforcement. */ }
	if (!result.ok || result.timedOut || !declared || !supportsEngramStartupPolicy(readJsonIfExists(metadata))) {
		return { ok: false, exitCode: 1, message: `${LOG_PREFIX} companion installation did not establish engram.startupPolicy=1; the Engram guard still keeps unverified stores closed. Repair gentle-engram, then restart Shell.` };
	}
	return { ok: true };
}

// The bundled children's environment (bundledChildEnv), with the pinned Engram
// only once it is published: computed again right before Pi starts, so an
// Engram the automatic setup just published is used in the same launch.
function bundledProcessEnv() {
	return bundledChildEnv(process.env, { node: process.execPath, cli: bundledCli, prefix: bundledInstall.root, engram: verifiedBundledCore(),
		guard: ENGRAM_GUARD, memory: bundledMemory });
}

function ownPackageVersion() {
	const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
	return packageJson.version;
}

// The real spawn, only ever needed for a runtime with no in-memory version
// (env override, PATH pi): kind "bundled" always has runtime.version set and
// skips this entirely (#2096).
function probePiVersion(runtime) {
	const versionProbePlan = planSpawn({ command: runtime.command, args: [...runtime.args, "--version"], platform: process.platform });
	const versionProbe = spawnSync(versionProbePlan.command, versionProbePlan.args, {
		stdio: ["ignore", "pipe", "pipe"],
		timeout: 15000,
		encoding: "utf8",
		shell: versionProbePlan.shell,
		env: bundledEnv ?? process.env,
	});
	if (versionProbe.error) fail(`Could not run the pi runtime at "${runtime.command}": ${versionProbe.error.message}`, 1);
	return checkPiVersion(versionProbe.stdout ?? "");
}

function emptyArgs() {
	return {
		link: false,
		isolated: false,
		home: undefined,
		packageRoot: undefined,
		help: false,
		version: false,
		command: undefined,
		commandArgs: [],
		passthrough: [],
		piSubcommand: undefined,
		error: undefined,
	};
}

// package.json "name" reader injected into findGentlePiDeclaration: a
// missing or unreadable package.json, or a non-string "name", is never an
// error here — it just means that path package is not gentle-pi.
function readPackageName(dir) {
	try {
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		return typeof pkg.name === "string" ? pkg.name : undefined;
	} catch {
		return undefined;
	}
}

// Best-effort realpath: a directory that does not exist (yet, or ever)
// cannot be realpath'd, so the take-over decision falls back to comparing
// the raw path instead of failing.
function safeRealpath(path) {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

// Used to filter the loose extension dirs a take-over re-injects: a missing
// path, or one that is not a directory (for example a stray file named
// "extensions"), is silently excluded rather than passed to pi as -e.
function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

const HERDR_BRIDGE_FILE = "herdr-agent-state.ts";

// Canonical file name check; an unreadable path is simply not a bridge.
function isHerdrBridge(path) {
	try {
		return basenameOf(realpathSync(path)) === HERDR_BRIDGE_FILE;
	} catch {
		return false;
	}
}

// First readable managed bridge among `homes`, as an explicit -e of its
// canonical path. Pi's package-manager.toResolvedPaths and
// resource-loader.mergePaths dedupe canonical files across discovery,
// explicit -e and manifests, so declaring it is harmless.
function managedBridgeArgs(homes) {
	for (const agentHome of homes) {
		if (!agentHome) continue;
		const bridge = join(agentHome, "extensions", HERDR_BRIDGE_FILE);
		try {
			if (!statSync(bridge).isFile()) continue;
			accessSync(bridge, fsConstants.R_OK);
			return ["-e", realpathSync(bridge)];
		} catch {
			// An absent/unreadable bridge never prevents the ordinary launch.
		}
	}
	return [];
}

// Herdr agent identity for an interactive isolated launch (#2705). Herdr's
// managed Pi bridge reports every pane as `pi`, so when this launcher loads
// its own package (`loadsOwnPackage`) Gentle Shell no longer loads the bridge
// and enables its own reporter (extensions/gentle-herdr-agent.ts) through
// HERDR_REPORTER_ENV. Exactly one reporter owns the pane: a bridge in the
// selected home is discovered by Pi anyway, and a bridge the user passes
// explicitly is theirs, so Gentle Shell does not compete with either. A home
// that loads its own declared gentle-pi may predate the reporter, so it keeps
// the managed bridge. Best-effort, and it never modifies either agent home.
function herdrLaunchPlan(home, args, loadsOwnPackage) {
	const none = { extensionArgs: [], reporter: false };
	const env = process.env;
	if (home.mode !== "isolated" || args.piSubcommand !== undefined || args.passthrough[0] === "mcp") return none;
	if (env.HERDR_ENV !== "1" || !env.HERDR_SOCKET_PATH?.trim() || !env.HERDR_PANE_ID?.trim()) return none;
	if (env[ENV_AGENTS_CHILD] === "1" || !process.stdin.isTTY || !process.stdout.isTTY) return none;
	// Only automatic interactive loading: a user opt-out must not become an
	// explicit -e (which Pi loads even under --no-extensions). Conservatively
	// skip ambiguous mode flags too; --mode text alone still allows a TUI.
	const forwarded = args.passthrough;
	if (forwarded.some((arg) => ["--no-extensions", "-ne", "--print", "-p", "--export", "--list-models", "-v"].includes(arg))) return none;
	if (forwarded.some((arg, i) => (arg === "--mode" && forwarded[i + 1] !== "text") || arg.startsWith("--mode="))) return none;
	try {
		if (!statSync(env.HERDR_SOCKET_PATH).isSocket()) return none;
	} catch {
		return none;
	}
	if (forwarded.some((arg, i) => (arg === "-e" || arg === "--extension") && isHerdrBridge(forwarded[i + 1] ?? ""))) return none;
	if (!loadsOwnPackage) {
		// Prefer the selected home, keep the incoming Pi home override, then
		// fall back to Herdr's usual home.
		return { extensionArgs: managedBridgeArgs([home.dir, env.PI_CODING_AGENT_DIR, join(homedir(), ".pi", "agent")]), reporter: false };
	}
	const selected = managedBridgeArgs([home.dir]);
	return selected.length > 0 ? { extensionArgs: selected, reporter: false } : { extensionArgs: [], reporter: true };
}

// Real-fs adapter for discoverLooseExtensionEntries (lib/gentle-shell-launcher.ts):
// statSync-based isFile/isDirectory (not readdirSync's Dirent, which uses
// lstat and so would treat a symlinked file or directory as neither) so a
// symlinked loose extension resolves the same way pi's own fs.existsSync-based
// checks would.
const looseExtensionFs = {
	readdir(dir) {
		let names;
		try {
			names = readdirSync(dir);
		} catch (error) {
			// resolveLooseExtensionEntries only calls this once isDirectory(dir)
			// has already confirmed the directory exists, so a failure here (for
			// example EACCES) is a real read failure, not a missing directory.
			// Warn instead of silently dropping every loose extension it would
			// have contributed (R4-loose-extension-enumeration-fails-silently).
			process.stderr.write(`${LOG_PREFIX} could not read loose extension directory ${dir}: ${error.message} (skipping)\n`);
			return [];
		}
		return names.map((name) => {
			const entryPath = join(dir, name);
			try {
				const entryStat = statSync(entryPath);
				return { name, isFile: entryStat.isFile(), isDirectory: entryStat.isDirectory() };
			} catch {
				return { name, isFile: false, isDirectory: false };
			}
		});
	},
	exists: existsSync,
};

// A loose extensions directory that is itself a self-contained extension —
// a package.json declaring a non-empty "pi.extensions" manifest — is passed
// through as a single -e <dir> instead of being broken into per-file
// entries: pi's own module loader (jiti) resolves that case directly,
// exactly as it would for any other explicitly configured package path. A
// root-level index.ts/index.js is deliberately NOT treated as that same
// marker: pi's own discovery loads it as just another loose file, so
// collapsing the whole directory on its presence silently dropped sibling
// loose files like extra.ts (R4-loose-index-collapses-sibling-extensions).
function readPiManifestExtensions(dir) {
	try {
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		return Array.isArray(pkg?.pi?.extensions) ? pkg.pi.extensions : undefined;
	} catch {
		return undefined;
	}
}

function looseDirHasOwnEntryPoint(dir) {
	const manifestExtensions = readPiManifestExtensions(dir);
	return manifestExtensions !== undefined && manifestExtensions.length > 0;
}

// Resolves one candidate loose-extensions directory (<agentDir>/extensions or
// <cwd>/.pi/extensions) into the -e entries a take-over must re-inject: the
// directory itself when it is a self-contained extension, otherwise every
// loose file discoverLooseExtensionEntries finds inside it. A missing or
// non-directory candidate resolves to no entries.
function resolveLooseExtensionEntries(dir) {
	if (!isDirectory(dir)) return [];
	if (looseDirHasOwnEntryPoint(dir)) return [dir];
	return discoverLooseExtensionEntries(dir, looseExtensionFs);
}

// Test/development-only override for the launcher config.json path
// (normally launcherConfigPath(homedir())). Lets a test — or the
// packed-artifact E2E script, which also needs `--link` probes against the
// real pi home and so cannot just redirect HOME wholesale — read and write
// the `home` subcommand's and the auto-provisioning marker's config file
// without ever touching the real ~/.tomidev/config.json. Never
// consulted outside these two call sites; see docs/readme-reference.md.
function resolveConfigPath() {
	const override = process.env.TOMIDEV_CONFIG;
	return override !== undefined && override.length > 0 ? override : launcherConfigPath(homedir());
}

// Raw config.json as a plain object (see RawLauncherConfig in
// lib/gentle-shell-launcher.ts): unlike parseLauncherConfig, this preserves
// every key, so a write (home persistence, or the provisioning marker below)
// never drops a key it does not itself understand.
function readRawConfig(configPath) {
	return parseRawLauncherConfig(readJsonIfExists(configPath));
}

// Atomic (temp file in the same directory, then rename): a crash or kill
// mid-write must never leave config.json truncated or partially written,
// since it also carries the S7 provisioning marker every plain launch reads.
function writeRawConfig(configPath, config) {
	const configDir = dirname(configPath);
	if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true, mode: 0o700 });
	writeFileAtomically(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

// The one atomic write every launcher-owned config/settings update goes
// through: a temp file next to the real target, then a rename onto it, so a
// crash or kill never leaves a partial file. When `path` is a symlink (Nix
// home-manager, stow, and similar dotfile managers ship settings.json and
// config.json that way), the write lands on the link's real target and the
// link itself stays in place; renaming onto `path` would replace the link
// with a regular file. A missing path or a dangling link has no real target
// to preserve, so it is written at `path` itself, exactly as before this
// helper existed, instead of creating a file wherever a dangling link points.
// The permission bits are `mode` when given, otherwise the real target's own
// (applied with chmod, so the umask cannot narrow them); a new file keeps
// the default creation mode. The temp file is removed when the write or
// rename throws, and the error propagates to the caller's own handling.
function writeFileAtomically(path, data, { mode } = {}) {
	let target = path;
	try {
		target = realpathSync(path);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	let targetMode = mode;
	if (targetMode === undefined) {
		try {
			targetMode = statSync(target).mode & 0o777;
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	}
	const tempPath = join(dirname(target), `.${basenameOf(target)}.tomidev-${process.pid}.tmp`);
	try {
		writeFileSync(tempPath, data);
		if (targetMode !== undefined) chmodSync(tempPath, targetMode);
		renameSync(tempPath, target);
	} catch (error) {
		rmSync(tempPath, { force: true });
		throw error;
	}
}

function loadConfig() {
	const text = readJsonIfExists(resolveConfigPath());
	return text === undefined ? undefined : parseLauncherConfig(text);
}

function handleHomeCommand(commandArgs) {
	if (commandArgs.length === 0) {
		const resolved = resolveHome({ args: emptyArgs(), env: process.env, homedir: homedir(), config: loadConfig() });
		process.stdout.write(`${resolved.mode} ${resolved.dir}\n`);
		process.exit(0);
	}
	if (commandArgs.length > 1) fail("tomidev home accepts at most one argument. Run 'tomidev --help'.", 2);
	const [value] = commandArgs;
	if (value.length === 0) fail("tomidev home requires a non-empty argument. Run 'tomidev --help'.", 2);

	const configPath = resolveConfigPath();
	const existing = readRawConfig(configPath);

	if (value === "link" || value === "isolated") {
		writeRawConfig(configPath, { ...existing, home: value });
		process.stdout.write(`Saved home: ${value}\n`);
		process.exit(0);
	}
	const dir = resolvePath(value);
	writeRawConfig(configPath, { ...existing, home: dir });
	process.stdout.write(`Saved home: path ${dir}\n`);
	process.exit(0);
}

// `gentle-shell [home selectors] home import-pi [--dry-run]`: copies the
// user's pi sign-ins, MCP servers and default model into the resolved
// separate home (lib/gentle-shell-import-pi.ts). A home that is new or empty
// is first bootstrapped exactly as a first launch would, so the files this
// adds never make it look foreign to auto-provisioning (homeIsForeign).
async function handleImportPiCommand(args) {
	const options = args.commandArgs.slice(1);
	if (options.some((option) => option !== "--dry-run")) fail("tomidev home import-pi accepts only --dry-run. Run 'tomidev --help'.", 2);
	const dryRun = options.includes("--dry-run");
	let home = resolveHome({ args, env: process.env, homedir: homedir(), config: loadConfig() });
	if (home.mode === "path") home = { ...home, dir: resolvePath(home.dir) };
	const source = resolvePath(userPiHome(process.env, homedir()));
	const refusal = "Choose a separate home with --isolated or --home <path>.";
	if (home.mode === "link") {
		fail(`tomidev home import-pi: the selected home is your pi home itself (--link), so there is nothing to import. ${refusal}`, 1);
	}
	if ([source, join(homedir(), ".pi", "agent")].some((piHome) => safeRealpath(piHome) === safeRealpath(home.dir))) {
		fail(`tomidev home import-pi: ${home.dir} is your pi home itself, so there is nothing to import. ${refusal}`, 1);
	}
	if (homeNeedsBootstrap(home.dir)) {
		if (dryRun) {
			process.stdout.write(`Would prepare ${home.dir} as a new ${BRAND_DISPLAY_NAME} home\n`);
		} else {
			try {
				await bootstrapOwnedHome(home);
			} catch (error) {
				fail(`tomidev home import-pi: could not prepare ${home.dir} (${error.message}); nothing was imported`, 1);
			}
			process.stdout.write(`Prepared ${home.dir} as a new ${BRAND_DISPLAY_NAME} home\n`);
		}
	}
	const result = importPi({ source, target: home.dir, dryRun });
	for (const line of formatImportPiReport(result, { source, target: home.dir, dryRun })) process.stdout.write(`${line}\n`);
	process.exitCode = result.failed ? 1 : 0;
}

// Spawns `command` and resolves once it exits, instead of exiting the
// process directly: the shared core the manual `setup` subcommand and the
// automatic first-run provisioning flow (S7) both drive, deciding for
// themselves whether to `process.exit` (setup) or warn and continue (auto
// mode). `stdio` lets a silent caller route the child's stdout/stderr to the
// launcher's own stderr (see runSetupFlow) while a manual `setup` keeps the
// child's stdio inherited. A `signal` on the result records that the child
// exited via signal for any reason; `interrupted: true` additionally marks
// that it happened because *this launcher itself* received
// SIGINT/SIGTERM/SIGHUP and forwarded it — as opposed to the child dying by a
// signal entirely on its own (a crash, an OOM kill, an external `kill`),
// which is an ordinary failure, not a request to stop (R3-002). Only
// `interrupted` lets a caller skip printing remediation advice and abort the
// whole launch; a plain `signal` with no `interrupted` is treated like any
// other failure. `timeoutMs`, when given, kills the child and resolves with
// `timedOut: true` instead of waiting forever on a hung Pi package
// invocation; only the automatic first-run flow passes it (see
// AUTO_SETUP_CHILD_TIMEOUT_MS below) — manual `setup` never times out.
function spawnAndWait(command, args, env, stdio, timeoutMs) {
	return new Promise((resolve) => {
		const launchPlan = planSpawn({ command, args, platform: process.platform });
		const child = spawn(launchPlan.command, launchPlan.args, { stdio, env, shell: launchPlan.shell });
		let timedOut = false;
		let interrupted = false;
		const timer = timeoutMs !== undefined ? setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, timeoutMs) : undefined;
		const signalHandlers = ["SIGINT", "SIGTERM", "SIGHUP"].map((signal) => {
			const handler = () => {
				interrupted = true;
				child.kill(signal);
			};
			process.on(signal, handler);
			return [signal, handler];
		});
		const cleanup = () => {
			for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
			if (timer !== undefined) clearTimeout(timer);
		};
		child.on("error", (error) => {
			cleanup();
			resolve({ ok: false, exitCode: 1, error });
		});
		child.on("exit", (code, signal) => {
			cleanup();
			if (timedOut) {
				resolve({ ok: false, exitCode: 1, timedOut: true });
				return;
			}
			if (signal) {
				resolve(
					interrupted
						? { ok: false, exitCode: signalExitCode(signal), signal, interrupted: true }
						: { ok: false, exitCode: signalExitCode(signal), signal },
				);
				return;
			}
			const exitCode = code ?? 1;
			resolve({ ok: exitCode === 0, exitCode });
		});
	});
}

// Renders `ms` as a human ceiling for a "timed out after ..." message: whole
// minutes when `ms` is an exact multiple of 60000 (matching the production
// 15-minute default and any operator-chosen whole-minute override), seconds
// otherwise — including the sub-second overrides
// TOMIDEV_AUTO_SETUP_TIMEOUT_MS sets in tests. Used at every "timed out
// after ..." call site instead of a hardcoded "15 minutes"
// (R2-timeout-message-hardcoded), so the message always reflects the ceiling
// that actually fired.
function formatTimeoutCeiling(ms) {
	if (ms % 60000 === 0) {
		const minutes = ms / 60000;
		return `${minutes} minute${minutes === 1 ? "" : "s"}`;
	}
	const seconds = ms / 1000;
	return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

// Run package commands directly through the resolved Pi, against this home.
function buildSetupEnv(home, runtime) {
	if (bundledEnv) {
		return bundledSetupEnv({ ...bundledEnv, PI_CODING_AGENT_DIR: home.dir, [ENV_AGENT_HOME]: home.dir }, { dirs: bundledSetupDirs, platform: process.platform });
	}
	const env = {
		...process.env,
		PI_CODING_AGENT_DIR: home.dir,
		[ENV_AGENT_HOME]: home.dir,
		PATH: [dirname(runtime.command), process.env.PATH ?? ""].join(delimiter),
	};
	const configHome = standaloneConfigHome(home);
	if (configHome === undefined) delete env[TOMIDEV_SHELL_CONFIG_HOME_ENV];
	else env[TOMIDEV_SHELL_CONFIG_HOME_ENV] = configHome;
	return env;
}

// The real filesystem behind migrateStandaloneConfig (#2201).
const configMigrationFs = {
	kind: (path) => {
		try {
			const stat = lstatSync(path);
			return stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
		} catch {
			return "missing";
		}
	},
	list: (path) => readdirSync(path),
	mkdirPrivate: (path) => {
		mkdirSync(path, { recursive: true, mode: 0o700 });
	},
	copyNew: (from, to) => copyFileSync(from, to, fsConstants.COPYFILE_EXCL),
};

// The real filesystem behind migrateLegacyHome (T6, T6b). Only a missing path is
// read as absent: any other lookup error propagates, so the copy fails closed.
const legacyHomeFs = {
	kind: (path) => {
		try {
			const stat = lstatSync(path);
			return stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
		} catch (error) {
			if (error.code === "ENOENT" || error.code === "ENOTDIR") return "missing";
			throw error;
		}
	},
	list: (path) => readdirSync(path),
	mkdirPrivate: (path) => {
		mkdirSync(path, { recursive: true, mode: 0o700 });
	},
	copyNew: (from, to) => copyFileSync(from, to, fsConstants.COPYFILE_EXCL),
	writeNew: (path, text) => writeFileSync(path, text, { flag: "wx", mode: 0o600 }),
	makeStagingDir: (prefix) => mkdtempSync(prefix),
	rename: (from, to) => renameSync(from, to),
	readText: (path) => {
		try {
			return lstatSync(path).isFile() ? readFileSync(path, "utf8") : undefined;
		} catch (error) {
			if (error.code === "ENOENT" || error.code === "ENOTDIR") return undefined;
			throw error;
		}
	},
	realpath: (path) => realpathSync(path),
	readPackageName: (dir) => readPackageName(dir),
	// Only ever called on the staging folder or its staging marker; rm never follows a link.
	remove: (path) => rmSync(path, { recursive: true, force: true }),
};

// T6 (S6): the one-time copy from ~/.gentle-shell into ~/.tomidev, before the
// launch first writes to the default home. Its warning never blocks the launch.
function runLegacyHomeMigration(args, bundled) {
	if (!legacyHomeMigrationApplies({ args, env: process.env, bundled: Boolean(bundled) })) return;
	let result;
	try {
		result = migrateLegacyHome({ homedir: homedir(), readVersion: ownPackageVersion, pid: process.pid, fs: legacyHomeFs });
	} catch (error) {
		result = { status: "failed", message: `tomidev: could not copy your ${BRAND_DISPLAY_NAME} data from ~/.gentle-shell to ~/.tomidev (${error.message}); continuing with a new home.` };
	}
	if (result.status === "copied") process.stderr.write(`${result.line}\n`);
	else if (result.status === "failed") process.stderr.write(`${result.message}\n`);
}

// Keep the bundled verified Engram core provisioning and memory policy.
async function ensureBundledEngram() {
	const { ensureEngram, prefixLayout } = await import("../scripts/bundled-install.mjs");
	const layout = prefixLayout({ platform: process.platform, env: process.env, home: homedir(), root: bundledInstall.root });
	try {
		await ensureEngram({ layout, platform: process.platform, arch: process.arch, env: process.env });
		return { ok: true };
	} catch (error) {
		return { ok: false, exitCode: 1, message: `${LOG_PREFIX} could not install the pinned Engram in ${layout.engramDir} (${error.message})` };
	}
}

function basenameOf(path) {
	const parts = path.split(/[\\/]/);
	return parts[parts.length - 1];
}

// Optional settings maintenance must never prevent a normal launch.
function safely(label, path, fallback, fn) {
	try {
		return fn();
	} catch (error) {
		process.stderr.write(`${LOG_PREFIX} could not ${label} at ${path} (${error.message}); continuing\n`);
		return fallback;
	}
}

// gentle-pi replaces Pi's replaceable builtin codemode with its own decorated
// codemode tool (extensions/quiet-tools.ts -> registerCompactCodemode in
// lib/codemode-renderer.ts), and Pi prints a startup warning whenever a
// builtin loses its tool to another extension. Pi's only per-builtin opt-out
// is a `-builtin:<name>` entry in the settings `extensions` array, so every
// normal launch ensures that entry in the settings.json of a home
// gentle-shell owns (see main, below).
const BUILTIN_CODEMODE_EXTENSION = "builtin:codemode";

// Pure: returns `settingsText` with `-<builtin>` appended to its `extensions`
// array (created when absent), or undefined when nothing should change — the
// text does not parse as a JSON object, `extensions` exists but is not an
// array, or the array already holds any explicit entry for the builtin
// (`+`, `-`, `!`, or bare), which is the user's own decision. Keeps every
// other key and entry in place, plus the text's own indentation and trailing
// newline (same detection as detectJsonFormatting in
// lib/gentle-shell-launcher.ts).
function withBuiltinExtensionExcluded(settingsText, builtin) {
	let settings;
	try {
		settings = JSON.parse(settingsText);
	} catch {
		return undefined;
	}
	if (typeof settings !== "object" || settings === null || Array.isArray(settings)) return undefined;
	const extensions = Object.prototype.hasOwnProperty.call(settings, "extensions") ? settings.extensions : [];
	if (!Array.isArray(extensions)) return undefined;
	if (extensions.some((entry) => typeof entry === "string" && entry.replace(/^[+!-]/, "") === builtin)) return undefined;
	const indent = settingsText.match(/\{\r?\n([ \t]+)/)?.[1];
	const serialized = JSON.stringify({ ...settings, extensions: [...extensions, `-${builtin}`] }, null, indent);
	return settingsText.endsWith("\n") ? `${serialized}\n` : serialized;
}

// Applies withBuiltinExtensionExcluded to an existing settings.json with the
// same atomic temp-file-then-rename write as the restores above. A missing
// settings.json is left missing: only the brand-new-home bootstrap
// (installIsolatedTuiModeSetting) seeds that file, and this launch-time step
// never takes over that role. Returns true when it actually wrote the file.
function ensureBuiltinCodemodeExcluded(settingsPath) {
	const currentText = readJsonIfExists(settingsPath);
	if (currentText === undefined) return false;
	const newText = withBuiltinExtensionExcluded(currentText, BUILTIN_CODEMODE_EXTENSION);
	if (newText === undefined) return false;
	writeFileAtomically(settingsPath, newText);
	return true;
}

// Manual and automatic provisioning share this idempotent native plan.
// Pi owns package mutation; auto mode redirects child output to stderr and
// applies a timeout, while manual setup inherits stdio and returns its status.
async function runSetupFlow(home, runtime, { dryRun, stdio, timeoutMs, homeHadContentBeforeBootstrap }) {
	const settingsPath = join(home.dir, "settings.json");
	const settingsText = readJsonIfExists(settingsPath);
	const removals = postInstallRemovals(settingsText);
	const companions = missingSetupCompanions(settingsText);
	if (dryRun) {
		if (home.mode !== "link" && homeNeedsBootstrap(home.dir)) {
			process.stderr.write(`${LOG_PREFIX} would bootstrap ${home.dir} (fullscreen, tomidev theme, ownership marker)\n`);
		}
		if (home.mode !== "link") process.stderr.write(`${LOG_PREFIX} would ensure the builtin codemode exclusion in ${settingsPath}; MCP stays enabled\n`);
		if (bundledInstall) process.stderr.write(`${LOG_PREFIX} would ensure the verified bundled Engram core\n`);
		for (const source of removals) process.stderr.write(`${LOG_PREFIX} would remove ${source} from ${home.dir}\n`);
		for (const source of companions) process.stderr.write(`${LOG_PREFIX} would install ${source} into ${home.dir}\n`);
		process.stderr.write(`${LOG_PREFIX} would record the setup version for an owned home\n`);
		return { ok: true, exitCode: 0 };
	}

	process.stderr.write(`${LOG_PREFIX} provisioning ${home.dir} with the companion packages\n`);
	if (home.mode !== "link" && !homeIsForeign(home, provisionedEntry(readRawConfig(resolveConfigPath()), safeRealpath(home.dir)), homeHadContentBeforeBootstrap)) {
		ensureBuiltinCodemodeExcluded(settingsPath);
	}
	if (bundledInstall) {
		const engram = await ensureBundledEngram();
		if (!engram.ok) return engram;
		bundledMemory = await classifyBundledMemory();
		bundledEnv = bundledProcessEnv();
		if (bundledMemory.notice) process.stderr.write(`${LOG_PREFIX} ${bundledMemory.notice}\n`);
	}
	// Remove legacy/conflicting declarations before installs, even if an
	// install later fails, so the old package cannot load twice on continuation.
	for (const [command, sources] of [["remove", removals], ["install", companions]]) {
		for (const source of sources) {
			const result = await spawnAndWait(runtime.command, [...runtime.args, command, source], buildSetupEnv(home, runtime), stdio, timeoutMs);
			if (result.interrupted) return result;
			if (result.timedOut) return { ok: false, exitCode: 1, message: `${LOG_PREFIX} pi ${command} ${source} timed out after ${formatTimeoutCeiling(timeoutMs)}` };
			if (result.error) return { ok: false, exitCode: 1, message: `Could not run the pi runtime to ${command} ${source}: ${result.error.message}` };
			if (!result.ok) {
				const remediation = [...homeSelectorFlags(home).map(shellQuote), command, source].join(" ");
				return { ok: false, exitCode: result.exitCode, message: `${LOG_PREFIX} could not ${command} ${source}; run \`tomidev ${remediation}\` before starting` };
			}
		}
	}
	warnDisabledMCP(home);
	if (bundledInstall) {
		const companion = await ensureEngramCompanion(home, runtime, stdio, timeoutMs, homeHadContentBeforeBootstrap);
		if (!companion.ok) process.stderr.write(`${companion.message}\n`);
	}
	return { ok: true, exitCode: 0 };
}

function mcpAdapterActivity(packages) {
	if (typeof packages === "string") return packages === "npm:pi-mcp-adapter" || packages.startsWith("npm:pi-mcp-adapter@") ? "active" : "inactive";
	if (Array.isArray(packages)) {
		const activities = packages.map(mcpAdapterActivity);
		return activities.includes("active") ? "active" : activities.includes("unknown") ? "unknown" : "inactive";
	}
	if (packages === null || typeof packages !== "object") return "inactive";
	if (typeof packages.source !== "string") return mcpAdapterActivity(Object.keys(packages));
	if (mcpAdapterActivity(packages.source) === "inactive") return "inactive";
	const patterns = packages.extensions;
	if (patterns === undefined) return packages.autoload === false ? "inactive" : "active";
	if (!Array.isArray(patterns)) return "unknown";
	if (patterns.length === 0) return "inactive";
	if (packages.autoload === false) {
		return patterns.some(pattern => typeof pattern === "string" && !pattern.startsWith("!") && !pattern.startsWith("-")) ? "unknown" : "inactive";
	}
	// Ordinary exclusions run after includes, but exact +path entries can
	// restore resources. Other filters need actual package files to resolve.
	if (patterns.includes("!**") && !patterns.some(pattern => typeof pattern === "string" && pattern.startsWith("+"))) return "inactive";
	return "unknown";
}

// Onboarding cannot prove who disabled MCP: diagnose, never re-enable servers.
// This also covers automatic provisioning because both routes share setup.
function warnDisabledMCP(home) {
	const settingsPath = join(home.dir, "settings.json");
	const mcpPath = join(home.dir, "mcp.json");
	let inspecting = settingsPath;
	try {
		const settingsText = readJsonIfExists(settingsPath);
		if (settingsText === undefined) return;
		const settings = JSON.parse(settingsText);
		if (!Array.isArray(settings?.extensions) || !settings.extensions.includes("-builtin:mcp")) return;
		const activity = mcpAdapterActivity(settings.packages);
		if (activity === "active") return;
		inspecting = mcpPath;
		const mcpText = readJsonIfExists(mcpPath);
		if (mcpText === undefined) return;
		const servers = JSON.parse(mcpText)?.mcpServers;
		if (servers === null || typeof servers !== "object" || Array.isArray(servers) || Object.keys(servers).length === 0) return;
		const diagnosis = activity === "unknown"
			? `pi-mcp-adapter activity cannot be confirmed from its extension filters, so servers in ${mcpPath} may not load`
			: `pi-mcp-adapter is absent or inactive, so servers in ${mcpPath} will not load`;
		process.stderr.write(`${LOG_PREFIX} WARNING: Pi built-in MCP is disabled in ${settingsPath}; ${diagnosis}. If you want these servers enabled, remove -builtin:mcp from extensions in ${settingsPath}, then restart Pi. If MCP is intentionally disabled, keep the setting.\n`);
	} catch (error) {
		process.stderr.write(`${LOG_PREFIX} WARNING: Pi MCP configuration could not be inspected in ${inspecting}: ${error.message}; inspect or repair it manually.\n`);
	}
}

// CLI entry for `gentle-shell [home selectors] setup [--dry-run]`: parses
// --dry-run, runs the shared flow with the child's stdio inherited (today's
// behavior, unchanged), then exits with its result — this is the one place
// that keeps the pre-S7 exit semantics `handleSetupCommand` always had.
// A successful real run records the home exactly as auto-provisioning does
// (#2106: both installers finish with this command, and the first launch
// must not install the packages again), but only for a home auto-provisioning
// itself would own: never pi's own default home or an unrelated directory.
async function handleSetupCommand(commandArgs, home, runtime, { homeHadContentBeforeBootstrap }) {
	let dryRun = false;
	for (const arg of commandArgs) {
		if (arg === "--dry-run") {
			dryRun = true;
			continue;
		}
		fail(`Unrecognized argument for 'tomidev setup': ${arg}\nRun 'tomidev --help' for usage.`, 2);
	}

	const result = await runSetupFlow(home, runtime, { dryRun, stdio: "inherit", homeHadContentBeforeBootstrap });
	if (!result.ok && result.message !== undefined) process.stderr.write(`${result.message}\n`);
	if (result.ok && !dryRun && (home.mode === "isolated" || home.mode === "path")) {
		const configPath = resolveConfigPath();
		const homeKey = safeRealpath(home.dir);
		const config = readRawConfig(configPath);
		if (!homeIsForeign(home, provisionedEntry(config, homeKey), homeHadContentBeforeBootstrap)) {
			try {
				writeRawConfig(configPath, recordProvisioned(config, homeKey, SETUP_VERSION, ownPackageVersion(), new Date().toISOString()));
			} catch (error) {
				// Setup itself succeeded; the next launch only sets the home up again.
				process.stderr.write(`${LOG_PREFIX} could not record the setup in ${configPath} (${error.message})\n`);
			}
		}
	}
	process.exit(result.exitCode);
}

const AUTO_SETUP_OPT_OUT_ENV = `${ENV_PREFIX}NO_AUTO_SETUP`;
const SETUP_LOCK_STALE_MS = 15 * 60 * 1000;

// gentle-shell never auto-provisions a home it does not itself own: the
// dedicated isolated home is always owned outright, but a `--home <path>` (or
// a persisted `home <path>` config) can just as easily name the user's real
// pi agent directory, or any other pre-existing, unrelated directory. Only a
// path home that is new (does not exist yet) or empty — or one this launcher
// has already provisioned before, per the config marker — is fair game;
// everything else (R1-001) is left alone with a one-time hint instead.
function defaultPiAgentDir() {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function printForeignHomeHint(home, reason) {
	const remediation = [...homeSelectorFlags(home).map(shellQuote), "setup"].join(" ");
	process.stderr.write(`${LOG_PREFIX} ${home.dir} ${reason}; run \`tomidev ${remediation}\` to provision it\n`);
}

// Ownership marker (R3-001): written into a home's own directory by the
// isolated/--home bootstrap (main, below) the moment gentle-shell creates
// that home — the same place it seeds settings.json with tuiMode. Lets
// homeIsForeign recognize a home gentle-shell itself created even when the
// config.json provisioning marker was never written because the *first*
// auto-provision attempt against it failed (a --home directory whose
// bootstrap already seeded settings.json otherwise looks identical to an
// unrelated non-empty directory on the next launch, and would be treated as
// foreign and never retried). Content is a one-line JSON object naming the
// launcher version that created it, purely informational — homeIsForeign
// only checks the file's existence.
function homeOwnershipMarkerPath(home) {
	return join(home.dir, HOME_OWNERSHIP_MARKER);
}

function writeHomeOwnershipMarker(home) {
	const content = JSON.stringify({ createdBy: BRAND_NAME, version: ownPackageVersion() });
	writeFileSync(homeOwnershipMarkerPath(home), `${content}\n`, "utf8");
}

// The isolated/--home bootstrap: the first launch's own (main, below) and
// `home import-pi`'s before it adds files to a new or empty home.
async function bootstrapOwnedHome(home) {
	// 0700: under umask 002 a default mode would leave ~/.tomidev group-writable,
	// which the bundled install's prefix claim must tighten or refuse.
	mkdirSync(home.dir, { recursive: true, mode: 0o700 });
	await installIsolatedTuiModeSetting(home.dir);
	writeHomeOwnershipMarker(home); // R3-001: lets a failed first auto-provision attempt still be retried later
}

function homeNeedsBootstrap(dir) {
	if (!existsSync(dir)) return true;
	try {
		return isDirectory(dir) && readdirSync(dir).length === 0;
	} catch {
		return false;
	}
}

// `homeHadContentBeforeBootstrap` must be read by the caller (main, below)
// before the isolated/--home bootstrap runs: that bootstrap itself creates
// and seeds a brand-new directory (settings.json with tuiMode, and now the
// ownership marker above), so checking directory contents from inside this
// function would always see that seeded content and wrongly call a genuinely
// fresh home "foreign".
function homeIsForeign(home, previousEntry, homeHadContentBeforeBootstrap) {
	if (home.mode !== "path") return false; // the isolated home is always owned
	if (previousEntry !== undefined) return false; // already provisioned by gentle-shell before; trust the marker
	if (safeRealpath(home.dir) === safeRealpath(defaultPiAgentDir())) return true; // never touch pi's own default home, even if empty
	if (existsSync(homeOwnershipMarkerPath(home))) return false; // gentle-shell's own bootstrap created this home (R3-001); retry it even after a failed first attempt
	return homeHadContentBeforeBootstrap;
}

// Guards concurrent first-run auto-provisioning of the same home: an
// exclusive create (`wx`) fails when the lock already exists. A lock file
// younger than SETUP_LOCK_STALE_MS means another gentle-shell process is (or
// very recently was) provisioning this home, so this run skips
// auto-provisioning entirely rather than racing the native package plan;
// the existing lock is left untouched since this run never owned it. An
// older lock is stale — a previous run crashed or was killed before its
// `finally` released it — so it is removed here, but only after re-stating
// it immediately before the removal to confirm it is *still* stale at that
// exact moment: a concurrent process may have refreshed it (or removed and
// recreated it) between the first check and now, and a lock a racing process
// just legitimately acquired must never be deleted out from under it. If the
// post-removal retry `wx` create itself then fails (another process won the
// race to recreate it first), this run simply skips provisioning rather than
// looping. Any unexpected fs error (permissions, a vanished lock between the
// EEXIST and a stat, …) must never block the launch, so it resolves to
// "proceed" rather than failing closed.
function lockAgeMs(lockPath) {
	return Date.now() - statSync(lockPath).mtimeMs;
}

function acquireSetupLock(lockPath) {
	try {
		closeSync(openSync(lockPath, "wx"));
		return true;
	} catch (error) {
		if (error.code !== "EEXIST") return true;
		let age;
		try {
			age = lockAgeMs(lockPath);
		} catch {
			return true;
		}
		if (age < SETUP_LOCK_STALE_MS) {
			process.stderr.write(
				`${LOG_PREFIX} another tomidev process is already provisioning ${dirname(lockPath)}; skipping automatic setup for this run\n`,
			);
			return false;
		}
		let ageNow;
		try {
			ageNow = lockAgeMs(lockPath);
		} catch {
			return false;
		}
		if (ageNow < SETUP_LOCK_STALE_MS) return false;
		try {
			rmSync(lockPath, { force: true });
		} catch {
			return false;
		}
		try {
			closeSync(openSync(lockPath, "wx"));
			return true;
		} catch {
			return false;
		}
	}
}

function releaseSetupLock(lockPath) {
	try {
		rmSync(lockPath, { force: true });
	} catch {
		// Best-effort cleanup only: a missing or unremovable lock file must
		// never fail an otherwise-successful (or already-failed) run.
	}
}

// Ceiling for every child this flow spawns: a hung Pi package invocation
// must never hang a plain `tomidev` launch forever.
// Test/development only: TOMIDEV_AUTO_SETUP_TIMEOUT_MS overrides the
// 15-minute ceiling so a test can exercise it without actually waiting;
// documented as test/development-only in docs/readme-reference.md. Manual
// `setup` never passes a timeout at all (see handleSetupCommand).
const AUTO_SETUP_CHILD_TIMEOUT_MS = 15 * 60 * 1000;

function resolveAutoSetupTimeoutMs() {
	const override = process.env.TOMIDEV_AUTO_SETUP_TIMEOUT_MS;
	const parsed = override !== undefined && override.length > 0 ? Number(override) : undefined;
	return parsed !== undefined && Number.isFinite(parsed) ? parsed : AUTO_SETUP_CHILD_TIMEOUT_MS;
}

// Runs the same flow as `tomidev setup` automatically before a plain
// launch, for an isolated or `--home <path>` home that was never provisioned
// or needs a newer setup plan or launcher version. Never runs for
// `--link` (the caller only calls this for home.mode "isolated"/"path") or a
// pi subcommand (the caller only calls this when args.piSubcommand is
// undefined) — see main() below. Never blocks the launch: a failure (a
// non-zero Pi package exit, a timeout, or a spawned child dying by a signal on
// its own — a crash, an OOM kill, an external `kill`, never something this
// launcher asked for) only warns and lets the plain launch continue with
// today's injection behavior, to retry automatically on a later run —
// except an interrupt (SIGINT/SIGTERM/SIGHUP) actually reaching *this
// launcher*, which forwards it to the spawned child and returns
// `{ exitCode }` instead (R3-002) so the caller (main, below) exits the
// whole launcher immediately without starting pi (S9): the user asked this
// process to stop, not to fall back to a plain launch. Returns undefined to
// mean "continue the launch normally".
async function maybeAutoProvisionHome(home, runtime, { homeHadContentBeforeBootstrap }) {
	if (process.env[AUTO_SETUP_OPT_OUT_ENV] === "1") return undefined;

	const configPath = resolveConfigPath();
	const homeKey = safeRealpath(home.dir);
	const setupVersion = SETUP_VERSION;
	const gentlePiVersion = ownPackageVersion();
	const beforeConfig = readRawConfig(configPath);
	if (!needsProvisioning(beforeConfig, homeKey, setupVersion, gentlePiVersion)) return undefined;

	const previous = provisionedEntry(beforeConfig, homeKey);
	if (homeIsForeign(home, previous, homeHadContentBeforeBootstrap)) {
		const reason =
			safeRealpath(home.dir) === safeRealpath(defaultPiAgentDir())
				? "is pi's own default agent home; tomidev never auto-provisions it"
				: "already has content and was not set up by tomidev";
		printForeignHomeHint(home, reason);
		return undefined;
	}

	const lockPath = join(home.dir, ".tomidev-setup.lock");
	if (!acquireSetupLock(lockPath)) return undefined;

	try {
		if (previous === undefined) {
			process.stderr.write(
				`${LOG_PREFIX} first run in ${home.dir}: installing the companion packages (one time; set ${AUTO_SETUP_OPT_OUT_ENV}=1 to skip)\n`,
			);
		} else {
			// A marker written before gentle-pi version tracking existed (S8)
			// has no `gentlePi` field: needsProvisioning above already treats
			// that as changed, so this reports "unknown" as its prior value
			// instead of "undefined".
			const setupChanged = previous.setupVersion !== setupVersion || previous.gentleAi !== undefined;
			const gentlePiChanged = previous.gentlePi !== gentlePiVersion;
			if (setupChanged && gentlePiChanged) {
				process.stderr.write(
					`${LOG_PREFIX} setup version changed (${previous.setupVersion ?? "unknown"} -> ${setupVersion}) and tomidev package changed (${previous.gentlePi ?? "unknown"} -> ${gentlePiVersion}): updating ${home.dir}\n`,
				);
			} else if (gentlePiChanged) {
				process.stderr.write(`${LOG_PREFIX} tomidev package changed (${previous.gentlePi ?? "unknown"} -> ${gentlePiVersion}): updating ${home.dir}\n`);
			} else {
				process.stderr.write(`${LOG_PREFIX} setup version changed (${previous.setupVersion ?? "unknown"} -> ${setupVersion}): updating ${home.dir}\n`);
			}
		}

		const result = await runSetupFlow(home, runtime, { dryRun: false, stdio: ["ignore", 2, 2], timeoutMs: resolveAutoSetupTimeoutMs(), homeHadContentBeforeBootstrap });
		// Abort the whole launch only for a launcher-forwarded interrupt
		// (R3-002); a child that exited via signal on its own (crash, OOM kill,
		// external kill) falls through to the ordinary-failure branch below,
		// which warns and still starts pi.
		if (result.interrupted) return { exitCode: result.exitCode };
		if (!result.ok) {
			const remediation = [...homeSelectorFlags(home).map(shellQuote), "setup"].join(" ");
			process.stderr.write(
				`${LOG_PREFIX} automatic setup failed (exit ${result.exitCode}); starting anyway and retrying next run. Run \`tomidev ${remediation}\` to see the full output.\n`,
			);
			if (result.message !== undefined) process.stderr.write(`${result.message}\n`);
			return undefined;
		}

		writeRawConfig(configPath, recordProvisioned(readRawConfig(configPath), homeKey, setupVersion, gentlePiVersion, new Date().toISOString()));
		return undefined;
	} finally {
		releaseSetupLock(lockPath);
	}
}

// The adapters `upgrade` and `self-uninstall` run npm and pnpm with: { fs, which, run, invocation? }.
async function packageManagerAdapters() {
	const { hostAdapters } = await import("../scripts/installer-probes.mjs");
	const { upgradeInvocation } = await import("../scripts/installer-runner.mjs");
	const { run, fs: probeFs } = hostAdapters();
	// Windows: npm and pnpm are .cmd shims; run what they run, never through cmd.exe.
	const invocation = upgradeInvocation({ platform: process.platform, env: process.env, run, fs: probeFs });
	return {
		fs: await import("node:fs/promises"),
		which: async (name) => findOnPath(name) ?? null,
		...(invocation ? { invocation } : {}),
		// stderrTail: a caller that asks for it, such as a failed `update` install, gets the bounded stderr.
		run: (command, argv, options = {}) => run(command, argv, { env: options.env ?? process.env, cwd: options.cwd, deadlineMs: options.deadlineMs ?? 20 * 60_000,
			...(options.stderrTail === undefined ? {} : { stderrTail: options.stderrTail }) }),
	};
}

// `tomidev upgrade`: runs before any Pi runtime check, since it may replace this package.
// On release, a global pnpm or npm install moves to the bundled one when the
// latest release publishes its assets (S4), with one question about the old package.
async function handleUpgradeCommand(commandArgs) {
	const { MainChannelError, runUpgrade } = await import("../scripts/main-channel.mjs");
	const { fetchDistribution, migrateGlobalShell, windowsPathRegistry } = await import("../scripts/bundled-wizard.mjs");
	const { askLine } = await import("../runtime/gentle-shell-uninstall.mjs");
	const managers = await packageManagerAdapters();
	const out = (line) => process.stdout.write(`${line}\n`);
	const migrate = ({ latest, owner }) => migrateGlobalShell({
		latest,
		currentVersion: ownPackageVersion(),
		platform: process.platform,
		arch: process.arch,
		env: process.env,
		home: homedir(),
		interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
		// End of input or Ctrl+C answers No.
		ask: (question) => askLine(question, { input: process.stdin, output: process.stdout }).catch(() => ""),
		out,
		adapters: { owner, distribution: (version) => fetchDistribution({ version }), run: managers.run,
			...(process.platform === "win32" ? { registry: windowsPathRegistry(process.env) } : {}) },
	});
	try {
		process.exitCode = await runUpgrade({
			args: commandArgs,
			ctx: { env: process.env, home: homedir() },
			platform: process.platform,
			packageRoot,
			currentVersion: ownPackageVersion(),
			adapters: { fetch: globalThis.fetch, ...managers, migrate },
			out,
		});
	} catch (error) {
		if (error instanceof MainChannelError) fail(`tomidev upgrade: ${error.message}`, error.code === "upgrade-usage" ? 2 : 1);
		throw error;
	}
}

// `tomidev upgrade` in a bundled install: the latest release installed
// beside the active version, verified, then `current` switched (two versions
// kept), or `--rollback` to the kept one. Returns the exit code (a failure is
// printed, not thrown, so `update --all` can go on); a failure leaves `current`
// as it was.
async function handleBundledUpgrade(bundled, commandArgs) {
	const parsed = parseBundledUpgradeArgs(commandArgs);
	if ("error" in parsed) fail(`tomidev upgrade: ${parsed.error}`, parsed.usage ? 2 : 1);
	const { prefixLayout, rollbackBundled, upgradeBundled } = await import("../scripts/bundled-install.mjs");
	const layout = prefixLayout({ platform: process.platform, env: process.env, home: homedir(), root: bundled.root });
	const out = (line) => process.stdout.write(`${line}\n`);
	try {
		if (parsed.action === "rollback") {
			const { from, to } = await rollbackBundled({ layout, home: homedir(), platform: process.platform, arch: process.arch, env: process.env });
			out(`Switched ${BRAND_DISPLAY_NAME} from ${from} to ${to}.`);
			return 0;
		}
		const { fetchDistribution } = await import("../scripts/bundled-wizard.mjs");
		const { latestRelease } = await import("../scripts/main-channel.mjs");
		await upgradeBundled({
			layout,
			home: homedir(),
			platform: process.platform,
			arch: process.arch,
			env: process.env,
			adapters: { latest: () => latestRelease(globalThis.fetch), distribution: (version) => fetchDistribution({ version }) },
			out,
		});
		return 0;
	} catch (error) {
		process.stderr.write(`tomidev upgrade: ${error.message}${error.stderr ? `\n${error.stderr}` : ""}\n`);
		return 1;
	}
}

// `tomidev update` in a bundled install: the newest published
// Pi installed with this Gentle Shell beside the active version, without the
// release's verified lockfile (after a warning), verified, then `current`
// switched. Returns the exit code like handleBundledUpgrade; a failure leaves
// `current` as it was.
async function handleBundledPiLatest(bundled) {
	const { prefixLayout, publishedPi, upgradePiLatest } = await import("../scripts/bundled-install.mjs");
	const layout = prefixLayout({ platform: process.platform, env: process.env, home: homedir(), root: bundled.root });
	try {
		await upgradePiLatest({
			layout,
			home: homedir(),
			shell: ownPackageVersion(),
			platform: process.platform,
			arch: process.arch,
			env: process.env,
			adapters: { latestPi: () => publishedPi(layout, { platform: process.platform, env: process.env }) },
			out: (line) => process.stdout.write(`${line}\n`),
		});
		return 0;
	} catch (error) {
		process.stderr.write(`tomidev update: ${error.message}${error.stderr ? `\n${error.stderr}` : ""}\n`);
		return 1;
	}
}

// The bundled npm as the `npmCommand` of a home Gentle Shell owns (the isolated
// home, or a --home it created or provisioned; never --link or a foreign home),
// so Pi installs packages with our npm while its tools keep the user's PATH.
// Only that key is written, and only when it differs.
async function ensureBundledNpmCommand(bundled, home, homeHadContentBeforeBootstrap) {
	if (home.mode === "link") return;
	const previous = provisionedEntry(readRawConfig(resolveConfigPath()), safeRealpath(home.dir));
	if (homeIsForeign(home, previous, homeHadContentBeforeBootstrap) || !isDirectory(home.dir)) return;
	const { bundledNpmCommand, ensureNpmShim, prefixLayout } = await import("../scripts/bundled-install.mjs");
	const layout = prefixLayout({ platform: process.platform, env: process.env, home: homedir(), root: bundled.root });
	// The entry npmCommand names, also for a runtime installed before it existed.
	ensureNpmShim(layout);
	const settingsPath = join(home.dir, "settings.json");
	const edit = withBundledNpmCommand(readJsonIfExists(settingsPath), bundledNpmCommand(layout));
	if (edit.status === "malformed") {
		process.stderr.write(`${LOG_PREFIX} ${settingsPath} is not a JSON object, so Pi's package installs use the npm on your PATH\n`);
	} else if (edit.status === "write") {
		writeFileAtomically(settingsPath, edit.text);
	}
}

// The npmCommand a bundled install wrote into a home it owns must not outlive
// it (#2469): Pi runs it for every package install, so a key naming a deleted
// node.exe fails them all with ENOENT. A main-channel bootstrap drops the key
// when it has the shape a bundled install writes and its node is gone; a
// command the user set is never touched, and neither are an existing
// executable, a link home and a foreign home.
async function removeMissingNpmCommand(home, homeHadContentBeforeBootstrap) {
	if (home.mode === "link") return;
	const previous = provisionedEntry(readRawConfig(resolveConfigPath()), safeRealpath(home.dir));
	if (homeIsForeign(home, previous, homeHadContentBeforeBootstrap) || !isDirectory(home.dir)) return;
	const settingsPath = join(home.dir, "settings.json");
	const edit = withoutMissingBundledNpmCommand(readJsonIfExists(settingsPath), (path) => existsSync(path));
	if (edit.status === "malformed") {
		process.stderr.write(`${LOG_PREFIX} ${settingsPath} is not a JSON object, so a stale npmCommand in it is not repaired\n`);
	} else if (edit.status === "removed") {
		writeFileAtomically(settingsPath, edit.text);
		process.stderr.write(`${LOG_PREFIX} removed the bundled npmCommand naming a missing executable from ${settingsPath}; Pi installs packages with the npm on your PATH\n`);
	}
}

// `tomidev self-uninstall` in a bundled install (S6, S7): the prefix's own
// folders and exactly the PATH entry its receipt records; on Windows the running
// node.exe and launcher are removed by a detached process after this one exits.
async function handleBundledSelfUninstall(bundled, commandArgs) {
	const { askLine, runBundledSelfUninstall } = await import("../runtime/gentle-shell-uninstall.mjs");
	const { describePathReceipt, prefixLayout, readPathReceipt, removePathEntry, scheduleWindowsRemoval } = await import("../scripts/bundled-install.mjs");
	const windows = process.platform === "win32";
	const layout = prefixLayout({ platform: process.platform, env: process.env, home: homedir(), root: bundled.root });
	// Trusted only for the link or startup file the PATH plan can choose for this user.
	const receipt = readPathReceipt(layout, { env: process.env, home: homedir() });
	let pathEntry = receipt;
	if (receipt.status === "recorded") {
		const registry = windows ? (await import("../scripts/bundled-wizard.mjs")).windowsPathRegistry(process.env) : undefined;
		pathEntry = { status: "recorded", description: describePathReceipt(receipt.receipt), remove: () => removePathEntry(receipt.receipt, { registry }) };
	}
	return runBundledSelfUninstall({
		args: commandArgs,
		env: process.env,
		homedir: homedir(),
		platform: process.platform,
		interactive: process.stdin.isTTY === true,
		root: bundled.root,
		pathEntry,
		process: { pid: process.pid, execPath: process.execPath },
		...(windows ? { deferRemoval: (request) => scheduleWindowsRemoval({ ...request, env: process.env }) } : {}),
		ask: (question) => askLine(question, { input: process.stdin, output: process.stdout }),
		out: (line) => process.stdout.write(`${line}\n`),
		err: (line) => process.stderr.write(`${line}\n`),
	});
}

// `tomidev self-uninstall`: like upgrade, runs before any Pi runtime check,
// so it also works when pi is missing.
async function handleSelfUninstallCommand(commandArgs) {
	const { askLine, runSelfUninstall } = await import("../runtime/gentle-shell-uninstall.mjs");
	const { ownerManager } = await import("../scripts/main-channel.mjs");
	const managers = await packageManagerAdapters();
	const ctx = { env: process.env, home: homedir() };
	process.exitCode = await runSelfUninstall({
		args: commandArgs,
		env: process.env,
		homedir: homedir(),
		platform: process.platform,
		interactive: process.stdin.isTTY === true,
		resolveOwner: () => ownerManager({ ctx, platform: process.platform, packageRoot, adapters: managers, command: "uninstall" }),
		run: (command, argv) => managers.run(command, argv),
		ask: (question) => askLine(question, { input: process.stdin, output: process.stdout }),
		out: (line) => process.stdout.write(`${line}\n`),
		err: (line) => process.stderr.write(`${line}\n`),
	});
}

async function main() {
	const args = parseLauncherArgs(process.argv.slice(2));
	if (args.error !== undefined) fail(`${args.error}\nRun 'tomidev --help' for usage.`, 2);
	if (args.help) {
		process.stdout.write("Pi updates: update reinstalls the verified supplier of the Pi this launcher runs (a global Pi, or the\nShell package whose adjacent peer it is, at the same Shell version) and reads the resulting Pi version back.\nA linked source Shell updates its local Pi with its project manager and one matching lockfile;\npnpm may be newer than the declared minimum; npm must match its pin. No manager is downloaded;\nGit roots only, no lifecycle scripts or range changes. Root-only pnpm configuration is preserved;\nmulti-project/ancestor workspaces and conflicting lockfiles refuse before installation. Unknown ownership refuses; update --extensions-only stays Pi-only.\nPrefix-bundled Pi updates with tomidev upgrade.\n");
		process.stdout.write(`${helpText()}\nBundled Engram memory: Shell shares the global Engram server on 127.0.0.1:7437, like other agents' hooks.\nA running server is reused only with verified /compatibility evidence; when nothing listens, Shell starts the\nbundled core's engram serve (default ~/.engram) and waits for that evidence. Otherwise ENGRAM_BIN is Shell's\nguard and memory stays off for that launch. Matching versions or updating alone do not prove compatibility.\nBack up existing data before manual changes; do not delete it or bypass the safety check.\nShell rechecks on every launch and remains usable without memory.\nAn explicit ENGRAM_BIN or ENGRAM_URL is kept and bypasses the guard.\n`);
		process.exit(0);
	}
	// The verification input applies to `--version` only (scripts/bundled-install.mjs upgradeBundled).
	const verifying = args.version && args.command === undefined ? process.env[BUNDLED_VERIFY_ENV] : undefined;
	const bundled = resolveBundledInstall({ packageRoot, platform: process.platform, fs: bundledFs, verifying });
	if (args.command === "home") {
		// A persisting `home` or `home import-pi` writes the home: the one-time copy goes first.
		runLegacyHomeMigration(args, bundled);
		if (args.commandArgs[0] === "import-pi") await handleImportPiCommand(args);
		else handleHomeCommand(args.commandArgs);
		return;
	}
	if (args.command === "memory") {
		if (args.commandArgs.length !== 2 || args.commandArgs[0] !== "migrate" || args.commandArgs[1] !== "--confirm-quiescent") {
			process.stderr.write(MIGRATION_USAGE);
			process.exitCode = 2;
			return;
		}
		if (!bundled) fail(`${LOG_PREFIX} memory migrate requires a prefix-bundled installation`, 1);
		bundledInstall = bundled;
		const result = migrateBundledEngram({ prefix: bundled.root, core: verifiedBundledCore(), home: homedir(), env: process.env });
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		process.exitCode = result.code;
		return;
	}
	if (args.command === "upgrade") {
		if (bundled) process.exitCode = await handleBundledUpgrade(bundled, args.commandArgs);
		else await handleUpgradeCommand(args.commandArgs);
		return;
	}
	if (args.command === "self-uninstall") {
		if (bundled) process.exitCode = await handleBundledSelfUninstall(bundled, args.commandArgs);
		else await handleSelfUninstallCommand(args.commandArgs);
		return;
	}

	runLegacyHomeMigration(args, bundled);
	const config = loadConfig();
	let home = resolveHome({ args, env: process.env, homedir: homedir(), config });
	if (home.mode === "path") home = { ...home, dir: resolvePath(home.dir) };

	// Version and help runs (Shell's own or forwarded to Pi) never probe Engram,
	// ensure the companion, print memory notices or start a server.
	const engramQuiet = args.version || piVersionOrHelpRequested(args.passthrough);
	let runtime;
	if (bundled) {
		// S8: only the version's own Pi, never TOMIDEV_PI, an adjacent fallback or PATH.
		const pi = bundledPi(bundled, { platform: process.platform, fs: bundledFs });
		if (!pi.ok) fail(pi.message, 1);
		runtime = { kind: "bundled", command: process.execPath, args: [pi.cli], version: pi.version };
		bundledInstall = bundled;
		bundledCli = pi.cli;
		bundledMemory = engramQuiet ? { policy: "disabled", notice: ENGRAM_RECOVERY_NOTICE } : await classifyBundledMemory();
		bundledEnv = bundledProcessEnv();
		bundledSetupDirs = [dirname(process.execPath), join(bundled.versionDir, "node_modules", ".bin")];
	} else {
		runtime = resolvePiRuntime({
			env: process.env,
			resolveBundledCli,
			findOnPath,
			nodeExecPath: process.execPath,
		});
		if (runtime === undefined) fail(missingPiMessage(), 1);
	}

	// Bundled runtimes already carry their version in memory (package.json /
	// the pinned dependency): spawning a whole process just to print it back
	// is the redundant cost issue #2096 reports, so only env/path runtimes
	// (which have no such in-memory source) still pay for a real probe.
	const versionCheck = runtime.version !== undefined ? checkPiVersion(runtime.version) : probePiVersion(runtime);
	// A managed self update is how an old Pi gets replaced, so the minimum-version
	// gate must not block it; everything else still requires the minimum.
	const managedSelfUpdate = !bundled && args.piSubcommand === "update" && versionCheck.version !== undefined
		&& (await import("../scripts/pi-update.mjs")).managedUpdatePlan(args.passthrough).self;
	if (!versionCheck.ok && !managedSelfUpdate) fail(versionCheck.message, 1);

	if (args.version) {
		process.stdout.write(`${describeVersion({ gentlePiVersion: ownPackageVersion(), piVersion: versionCheck.version, home })}\n`);
		process.exit(0);
	}

	// Self updates select the latest published Pi in a bundled prefix; package
	// updates still go to Pi. A self failure must survive a successful child.
	let passthrough = args.passthrough;
	let updateExitCode = 0;
	if (bundled && args.piSubcommand === "update") {
		const plan = bundledUpdatePlan(args.passthrough);
		if (plan.self) {
			if (args.passthrough.includes("--force")) fail("tomidev update: --force is not supported for managed Pi updates.", 2);
			updateExitCode = await handleBundledPiLatest(bundled);
			const next = bundledUpdateNext(plan, updateExitCode);
			if ("exitCode" in next) process.exit(next.exitCode);
			if (next.note) process.stderr.write(`${next.note}\n`);
		}
		passthrough = plan.piArgs;
	} else if (args.piSubcommand === "update") {
		const { managedUpdatePlan, updateSelectedPi } = await import("../scripts/pi-update.mjs");
		const plan = managedUpdatePlan(args.passthrough);
		if (plan.self) {
			if (args.passthrough.includes("--force")) fail("tomidev update: --force is not supported for managed Pi updates.", 2);
			updateExitCode = await updateSelectedPi({ runtime, packageRoot, platform: process.platform, currentVersion: versionCheck.version, cwd: tmpdir(), env: process.env, home: homedir(),
				adapters: await packageManagerAdapters(), out: (line) => process.stdout.write(`${line}\n`) });
			if (plan.piArgs === undefined) { process.exitCode = updateExitCode; return; }
		}
		passthrough = plan.piArgs;
	}

	// Home-ownership signal for auto-provisioning (S9, homeIsForeign): must be
	// read before the isolated-home bootstrap below creates and seeds a
	// brand-new --home directory with its own settings.json — after that
	// bootstrap runs, "did this home already have content" can no longer be
	// answered by looking at the directory.
	let homeHadContentBeforeBootstrap = false;
	if (existsSync(home.dir)) {
		try {
			homeHadContentBeforeBootstrap = readdirSync(home.dir).length > 0;
		} catch {
			homeHadContentBeforeBootstrap = false;
		}
	}

	// Dry-run returns before bootstrap, config migration and npmCommand repair:
	// even these otherwise routine startup writes must not happen for a plan.
	if (args.command === "setup" && args.commandArgs.includes("--dry-run")) {
		await handleSetupCommand(args.commandArgs, home, runtime, { homeHadContentBeforeBootstrap });
		return;
	}

	// Isolated-home bootstrap: only on a home gentle-shell has not seen before
	// (link never bootstraps — it reuses the user's own pi agent home as-is).
	if ((home.mode === "isolated" || home.mode === "path") && !existsSync(home.dir)) {
		await bootstrapOwnedHome(home);
		const piSignIns = existsSync(join(userPiHome(process.env, homedir()), "auth.json"));
		process.stderr.write(`${separateHomeHint(home, { piSignIns })}\n`);
	}

	// #2201: the standalone isolated home's own config folder, seeded once from
	// the shared ~/.pi/gentle-ai. Not when an explicit TOMIDEV_CONFIG_HOME
	// decides the config home; never blocks the launch.
	const configHome = bundled || process.env[ENV_CONFIG_HOME] ? undefined : standaloneConfigHome(home);
	if (configHome !== undefined) {
		try {
			const migration = migrateStandaloneConfig({ source: join(homedir(), ".pi", "gentle-ai"), target: configHome, fs: configMigrationFs });
			for (const line of migration.lines) process.stderr.write(`${line}\n`);
		} catch (error) {
			process.stderr.write(`${LOG_PREFIX} could not prepare ${configHome} (${error.message}); continuing\n`);
		}
	}

	if (bundled) {
		try {
			await ensureBundledNpmCommand(bundled, home, homeHadContentBeforeBootstrap);
		} catch (error) {
			process.stderr.write(`${LOG_PREFIX} could not give Pi the bundled npm in ${join(home.dir, "settings.json")} (${error.message}); continuing\n`);
		}
	} else {
		try {
			await removeMissingNpmCommand(home, homeHadContentBeforeBootstrap);
		} catch (error) {
			process.stderr.write(`${LOG_PREFIX} could not repair the npmCommand in ${join(home.dir, "settings.json")} (${error.message}); continuing\n`);
		}
	}

	// Only a valid extension-only update gets the configuration migration. All
	// rejected forms must reach Pi without changing a package selection.
	const extensionUpdate = args.piSubcommand === "update" && passthrough?.[0] === "update" && passthrough.includes("--extensions")
		&& passthrough.slice(1).every((arg) => ["--extensions", "--approve", "-a", "--no-approve", "-na", "--force"].includes(arg));
	if (bundled && extensionUpdate) {
		const migrated = await migrateManagedEngramCompanion(home, homeHadContentBeforeBootstrap);
		if (!migrated.ok) fail(migrated.message, migrated.exitCode);
	}

	if (args.command === "setup") {
		await handleSetupCommand(args.commandArgs, home, runtime, { homeHadContentBeforeBootstrap });
		return;
	}

	// Auto-provision (S7): a plain launch against an isolated or --home home
	// (never --link) runs the same flow as `tomidev setup` automatically
	// before pi starts, so the maintainer's own packages install without ever
	// needing to know `setup` exists. Skipped for a pi subcommand
	// (`tomidev install/remove/list/...`) — argv[0] must stay the bare
	// subcommand for pi to dispatch it, same reason the declaration/take-over
	// block below skips it. Must run before that block reads settings.json,
	// so that block sees settings.json exactly as this same auto-provision run
	// (if any) left it — notably with any legacy npm:gentle-pi declaration
	// removed by the native plan — instead of reading stale pre-setup content
	// within the same launch. Never lets an unexpected failure here (fs
	// errors, a lock, a malformed config) block the launch itself (R4): any
	// throw is caught and only warned about, exactly like an ordinary
	// setup-flow failure.
	if ((home.mode === "isolated" || home.mode === "path") && args.piSubcommand === undefined) {
		let autoProvisionResult;
		try {
			autoProvisionResult = await maybeAutoProvisionHome(home, runtime, { homeHadContentBeforeBootstrap });
		} catch (error) {
			process.stderr.write(`${LOG_PREFIX} automatic setup failed unexpectedly (${error.message}); starting anyway and retrying next run.\n`);
			autoProvisionResult = undefined;
		}
		// Only an interrupt reaching the spawned child (SIGINT/SIGTERM/SIGHUP)
		// returns a result here: the user asked this process to stop, so it
		// exits with the same signal-derived code instead of falling through
		// to launch pi.
		if (autoProvisionResult !== undefined) process.exit(autoProvisionResult.exitCode);

		// Runs after auto-provision, so it sees settings.json exactly as that
		// run left it. Only a home gentle-shell owns, by the same rule
		// auto-provisioning uses (homeIsForeign): never --link (excluded above),
		// a foreign --home, or pi's own default agent home, since plain pi may
		// share those and would lose its builtin codemode. `setup` (including
		// --dry-run) returned before this point.
		const settingsPath = join(home.dir, "settings.json");
		const excluded = safely(`exclude Pi's builtin codemode in your ${BRAND_DISPLAY_NAME} settings`, settingsPath, false, () => {
			const previous = provisionedEntry(readRawConfig(resolveConfigPath()), safeRealpath(home.dir));
			return !homeIsForeign(home, previous, homeHadContentBeforeBootstrap) && ensureBuiltinCodemodeExcluded(settingsPath);
		});
		if (excluded) {
			process.stderr.write(`${LOG_PREFIX} disabled Pi's builtin codemode in ${settingsPath} (${BRAND_DISPLAY_NAME} ships its own codemode tool)\n`);
		}
	}

	const packageRootExplicit = args.packageRoot !== undefined;
	const effectivePackageRoot = packageRootExplicit ? resolvePath(args.packageRoot) : packageRoot;
	// R4-forced-package-root-unvalidated / R3-005: an unvalidated --package-root
	// forces a take-over (dropping normal extension discovery via
	// --no-extensions) and then hands pi -e/--theme/--skill/--prompt-template
	// flags pointing at directories that do not exist, turning an operator typo
	// into an obscure pi loader failure instead of a clear launcher error.
	if (packageRootExplicit && !isDirectory(effectivePackageRoot)) {
		fail(`--package-root ${args.packageRoot} does not exist or is not a directory.`, 2);
	}

	let declaration;
	let takeOver = false;
	let otherPackagePaths = [];
	let looseExtensionEntries = [];

	// Every mode consults the home's own settings.json for a gentle-pi
	// declaration, not just --link: users can explicitly declare tomidev
	// in an isolated or --home home's settings.json. When that declaration
	// exists the launcher must stop injecting its own copy
	// on top of it (buildPiInvocation skips injection whenever a declaration
	// is present and there is no take-over). A path declaration in a
	// non-link home follows the same take-over rules as --link. A home
	// without any declaration keeps the plain injection, unchanged.
	//
	// --package-root only forces a take-over in --link mode: an isolated or
	// --home target has no pre-existing pi installation to defer to, so
	// forcing --no-extensions there would just strip its own settings-driven
	// discovery for no benefit (see the "gated on link mode" bin test). A pi
	// subcommand skips this whole block: buildPiInvocation ignores
	// takeOver/declaration once piSubcommand is set, and running the
	// take-over/loose-dir discovery anyway would still print a misleading
	// "taking over gentle-pi..." message (and otherPackageInjections
	// warnings) for a plain `tomidev install npm:x` that never actually
	// takes anything over.
	if (args.piSubcommand === undefined) {
		const settingsText = readJsonIfExists(join(home.dir, "settings.json"));
		declaration = findGentlePiDeclaration(settingsText, { agentDir: home.dir, readPackageName });
		// --package-root only forces a take-over in --link mode (see below);
		// in every other mode a declared home silently keeps using its
		// declared gentle-pi and --package-root has no effect at all. Warn
		// once so an operator does not assume --package-root took effect.
		if (packageRootExplicit && home.mode !== "link" && declaration !== undefined) {
			process.stderr.write(
				`${LOG_PREFIX} --package-root only forces a take-over in --link mode; ${home.dir} declares tomidev, so the installed package is used and ${args.packageRoot} is ignored\n`,
			);
		}
		const realEffectivePackageRoot = safeRealpath(effectivePackageRoot);
		const realDeclaredDir = declaration?.kind === "path" ? safeRealpath(declaration.dir) : undefined;
		takeOver = decideTakeOver({
			declaration,
			realPackageRoot: realEffectivePackageRoot,
			realDeclaredDir,
			packageRootExplicit: home.mode === "link" && packageRootExplicit,
		});
		if (takeOver) {
			const skip = declaration ?? { kind: "path", dir: realEffectivePackageRoot };
			const injections = otherPackageInjections({ settingsText, agentDir: home.dir, skip, isDirectory, realpath: safeRealpath });
			otherPackagePaths = injections.paths;
			for (const warning of injections.warnings) process.stderr.write(`${warning}\n`);
			// --no-extensions drops pi's normal settings-driven extension
			// discovery, which also covers loose (non-package) extensions
			// under <agentDir>/extensions and the project-local
			// <cwd>/.pi/extensions. Re-injecting either directory wholesale
			// as `-e <dir>` does not work for a directory of loose files: pi's
			// -e flag hands the path straight to its module loader with no
			// directory-discovery pass, so a bare directory of loose files
			// fails with "Cannot find module ...". Resolve each candidate
			// into its actual loose file entries (or pass it through
			// unchanged when it is itself a self-contained extension) so a
			// take-over does not silently stop loading them.
			looseExtensionEntries = [join(home.dir, "extensions"), join(process.cwd(), ".pi", "extensions")].flatMap(resolveLooseExtensionEntries);
			const declaredFrom = declaration === undefined ? "the requested package root" : declaration.kind === "npm" ? "npm:tomidev" : declaration.dir;
			process.stderr.write(
				`${LOG_PREFIX} taking over tomidev from ${declaredFrom} for this run (settings unchanged; its skills, prompts, and themes still load alongside this launcher's).\n`,
			);
		}
	}

	if (bundled) {
		// Recheck after setup and before provider loading: never carry a stale
		// decision across an installer that could create data.
		if (args.piSubcommand === undefined && !engramQuiet) {
			bundledMemory = await classifyBundledMemory();
			bundledEnv = bundledProcessEnv();
			// The guard protects memory whatever provider loads, so a companion that
			// could not be verified is reported, never a reason to stop Shell.
			const migrated = await migrateManagedEngramCompanion(home, homeHadContentBeforeBootstrap);
			if (!migrated.ok) process.stderr.write(`${migrated.message}\n`);
			const companion = await ensureEngramCompanion(home, runtime, ["ignore", 2, 2], 10000, homeHadContentBeforeBootstrap);
			if (!companion.ok) process.stderr.write(`${companion.message}\n`);
			// Only this final decision starts the shared server, and Pi gets its
			// URL only once the server verified.
			if (bundledMemory.spawn) bundledMemory = await startSharedEngram();
			if (bundledMemory.notice) process.stderr.write(`${LOG_PREFIX} ${bundledMemory.notice}\n`);
		}
		bundledEnv = bundledProcessEnv();
	}
	// buildPiInvocation injects this package unless the home's own declared
	// gentle-pi is used as-is.
	const herdr = herdrLaunchPlan(home, args, takeOver || declaration === undefined);
	const invocation = buildPiInvocation({
		runtime,
		home,
		packageRoot: effectivePackageRoot,
		declaration,
		takeOver,
		otherPackagePaths,
		looseExtensionEntries,
		passthrough: [...herdr.extensionArgs, ...passthrough],
		piSubcommand: args.piSubcommand,
		baseEnv: bundledEnv ?? process.env,
		bundled: Boolean(bundled),
		homedir: homedir(),
		// The spawn below sets no cwd, so pi runs in the launcher's own.
		cwd: process.cwd(),
	});

	// Only an interactive session ends with pi's exit resume hint, which
	// gentle-shell completes with its own line; a pi subcommand gets no handoff.
	// A nested launch must not inherit a stale reporter handoff.
	if (herdr.reporter) invocation.env[HERDR_REPORTER_ENV] = "1";
	else delete invocation.env[HERDR_REPORTER_ENV];

	const resumeHandoff = args.piSubcommand === undefined ? createResumeHandoff() : undefined;
	const childEnv = resumeHandoff ? { ...invocation.env, [RESUME_HANDOFF_ENV]: resumeHandoff.path } : invocation.env;

	const launchPlan = planSpawn({ command: invocation.command, args: invocation.args, platform: process.platform });
	let child;
	try {
		child = spawn(launchPlan.command, launchPlan.args, { stdio: "inherit", env: childEnv, shell: launchPlan.shell });
	} catch (error) {
		resumeHandoff?.dispose();
		throw error;
	}
	// Only SIGHUP means the terminal is gone. pi may survive a forwarded
	// SIGINT and keep running, so other signals must not silence the hint.
	let terminalHungUp = false;
	for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
		process.on(signal, () => {
			if (signal === "SIGHUP") terminalHungUp = true;
			child.kill(signal);
		});
	}
	child.on("error", (error) => {
		resumeHandoff?.dispose();
		fail(`Could not start pi: ${error.message}`, 1);
	});
	child.on("exit", (code, signal) => {
		const exitCode = signal ? signalExitCode(signal) : ((code ?? 1) || updateExitCode);
		if (resumeHandoff) {
			const hint = planResumeHint({
				handoff: resumeHandoff.read(),
				homeFlags: homeSelectorFlags(home),
				stdoutIsTTY: process.stdout.isTTY === true,
				terminalHungUp,
				platform: process.platform,
				color: process.stdout.hasColors?.() === true,
			});
			resumeHandoff.dispose();
			// TTY writes are asynchronous on Windows: exit only once the
			// hint is flushed, or it can be lost.
			if (hint) {
				// A write error (e.g. EIO on a closed terminal) must not turn
				// pi's exit into a launcher crash.
				process.stdout.once("error", () => process.exit(exitCode));
				process.stdout.write(hint, () => process.exit(exitCode));
				return;
			}
		}
		process.exit(exitCode);
	});
}

// Private temp dir for the resume-hint handoff (lib/gentle-shell-resume-hint.ts).
// Best effort: if it cannot be created, only pi's own hint is printed.
function createResumeHandoff() {
	let dir;
	try {
		dir = mkdtempSync(join(tmpdir(), RESUME_HANDOFF_DIR_PREFIX));
	} catch {
		return undefined;
	}
	const path = join(dir, RESUME_HANDOFF_FILE);
	return {
		path,
		read: () => {
			try {
				const text = readJsonIfExists(path);
				return text === undefined ? undefined : parseResumeHandoff(text);
			} catch {
				return undefined;
			}
		},
		// Never throws: it runs inside the exit handler, where an EPERM on
		// Windows would otherwise replace pi's exit code with a crash.
		dispose: () => {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				// A leftover empty temp dir is harmless.
			}
		},
	};
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
