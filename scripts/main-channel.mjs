// Main channel: pack only tomidev from the fork's exact latest main SHA.
// No native binary build, Go prerequisite or dev-binary registration.
// The recorded channel lets `tomidev upgrade` follow release or main.
import { dirname, isAbsolute, join, posix, relative, win32 } from "node:path";
import { GIT_SOURCE, SOURCE_REPOSITORY, ENV_CONFIG_HOME, brandSchema, isBrandSchema, BRAND_DISPLAY_NAME } from "../runtime/brand.mjs";
import { pnpmGlobalBin } from "./installer-preflight.mjs";

export const SHELL_REPOSITORY = SOURCE_REPOSITORY;
export const CHANNEL_SCHEMA = brandSchema("channel", 1);
export const CHANNELS = Object.freeze(["release", "main"]);

const SHA = /^[0-9a-f]{40}$/;
const MINUTE = 60_000;
const deadlines = Object.freeze({ build: 15 * MINUTE, resolve: 2 * MINUTE, version: 30_000, extract: 2 * MINUTE, pack: 5 * MINUTE });
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

export class MainChannelError extends Error {
	constructor(code, message, cause) {
		super(`${code}: ${message}`, cause === undefined ? undefined : { cause });
		this.name = "MainChannelError";
		this.code = code;
	}
}

/** Same config home as the dev-binary override: a nonempty TOMIDEV_CONFIG_HOME or ~/.pi/gentle-ai.
 * Install-level state, so never the standalone launcher's per-home marker (#2201). */
export function configHome({ env, home }) {
	return env[ENV_CONFIG_HOME] || join(home, ".pi", "gentle-ai");
}
export function channelStatePath(ctx) {
	return join(configHome(ctx), "channel.json");
}

function validState(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value) || !isBrandSchema(value.schema, "channel", 1)) return null;
	if (value.channel === "release" && Object.keys(value).length === 2) return { channel: "release" };
	// Accept old two-repository records, but record only the fork going forward.
	if (value.channel === "main" && SHA.test(value.shellCommit) &&
		(Object.keys(value).length === 3 || (Object.keys(value).length === 4 && SHA.test(value.gentleAiCommit)))) {
		return { channel: "main", shellCommit: value.shellCommit };
	}
	return null;
}

/** The recorded channel; no record means release. A malformed record fails closed. */
export async function readChannel(ctx, fs) {
	let text;
	try {
		text = await fs.readFile(channelStatePath(ctx), "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return { channel: "release" };
		throw new MainChannelError("channel-state-invalid", `${channelStatePath(ctx)} could not be read`);
	}
	let parsed = null;
	try { parsed = validState(JSON.parse(text)); } catch { parsed = null; }
	if (!parsed) throw new MainChannelError("channel-state-invalid", `${channelStatePath(ctx)} is not a valid ${CHANNEL_SCHEMA} record; fix or remove it`);
	return parsed;
}

export async function writeChannel(ctx, state, fs) {
	const record = { schema: CHANNEL_SCHEMA, ...state };
	if (!validState(record)) throw new MainChannelError("channel-state-invalid", "refusing to record an invalid channel state");
	const path = channelStatePath(ctx);
	await fs.mkdir(dirname(path), { recursive: true });
	await fs.writeFile(`${path}.tmp`, `${JSON.stringify(record)}\n`);
	await fs.rename(`${path}.tmp`, path);
}

/** Latest commit of `main` as an exact SHA (GitHub's raw-SHA media type). */
export async function resolveMainCommit(repository, { fetch }) {
	let response;
	try {
		response = await fetch(`https://api.github.com/repos/${repository}/commits/main`, {
			headers: { Accept: "application/vnd.github.sha", "User-Agent": "tomidev" },
		});
	} catch {
		throw new MainChannelError("main-commit-unavailable", `the latest main commit of ${repository} could not be fetched`);
	}
	const sha = response?.ok ? String(await response.text()).trim() : "";
	if (!SHA.test(sha)) {
		throw new MainChannelError("main-commit-unavailable", `GitHub did not return the latest main commit of ${repository} (HTTP ${response?.status ?? "error"})`);
	}
	return sha;
}

export function mainVersion(baseVersion, commit) {
	return `${baseVersion}-main.${commit.slice(0, 12)}`;
}

function succeeded(result) {
	return result?.code === 0 && result.timedOut !== true && result.signal == null;
}

/** The failed command's bounded stderr tail as an error cause, or undefined when it printed nothing. */
function stderrCause(result) {
	const tail = typeof result?.stderrTail === "string" ? result.stderrTail.trim() : "";
	return tail.length > 0 ? new Error(tail) : undefined;
}

/** On Windows, System32's bsdtar by absolute path: an MSYS tar earlier on PATH (Git for
 * Windows' usr\bin) reads a drive-letter archive path such as `D:\...` as a remote host. */
function tarCommand(platform) {
	return platform === "win32" ? win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
}

/** Packs Gentle Shell from `commit` as `<version>-main.<sha12>` without running `prepack`. */
export async function packMainShell({ commit, ctx, fetch, run, pnpm, fs, platform = process.platform }) {
	if (!SHA.test(commit)) throw new MainChannelError("main-shell-pack-failed", `the ${BRAND_DISPLAY_NAME} commit is not an exact SHA`);
	const packages = join(configHome(ctx), "main", "packages");
	const work = join(configHome(ctx), "main", ".source");
	await fs.rm(work, { recursive: true, force: true });
	await fs.mkdir(join(work, "src"), { recursive: true });
	await fs.mkdir(packages, { recursive: true });
	try {
		let response;
		try {
			response = await fetch(`https://codeload.github.com/${SHELL_REPOSITORY}/tar.gz/${commit}`, { headers: { "User-Agent": "tomidev" } });
		} catch {
			response = null;
		}
		const bytes = response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
		if (!bytes || bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) {
			throw new MainChannelError("main-shell-download-failed", `the ${BRAND_DISPLAY_NAME} source for ${commit.slice(0, 12)} could not be downloaded`);
		}
		const archive = join(work, "source.tgz");
		await fs.writeFile(archive, bytes);
		const source = join(work, "src");
		const extract = await run(tarCommand(platform), ["-xzf", archive, "-C", source, "--strip-components=1"], { deadlineMs: deadlines.extract, stderrTail: 4096 });
		if (!succeeded(extract)) {
			throw new MainChannelError("main-shell-pack-failed", `the ${BRAND_DISPLAY_NAME} source archive could not be extracted`, stderrCause(extract));
		}
		const manifestPath = join(source, "package.json");
		const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
		if (manifest?.name !== "tomidev" || typeof manifest.version !== "string") {
			throw new MainChannelError("main-shell-pack-failed", "the downloaded source is not the tomidev package");
		}
		manifest.version = mainVersion(manifest.version, commit);
		// prepack runs the full test suite; postinstall (the native binary) stays.
		if (manifest.scripts) {
			delete manifest.scripts.prepack;
			delete manifest.scripts.prepare;
		}
		await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
		const pack = await run(pnpm.command, [...pnpm.prefix, "pack", "--pack-destination", packages], { cwd: source, deadlineMs: deadlines.pack });
		const tgz = join(packages, `tomidev-${manifest.version}.tgz`);
		if (!succeeded(pack) || !(await fs.stat(tgz).then((info) => info.isFile(), () => false))) {
			throw new MainChannelError("main-shell-pack-failed", `the ${BRAND_DISPLAY_NAME} main package could not be packed`);
		}
		return tgz;
	} finally {
		await fs.rm(work, { recursive: true, force: true });
	}
}

/** The installer runner's main-channel adapter over real network and files. */
export function mainChannelAdapter({ fetch = globalThis.fetch, fs }) {
	return {
		resolveCommit: (repository) => resolveMainCommit(repository, { fetch }),
		packShell: ({ commit, ctx, run, pnpm, platform }) => packMainShell({ commit, ctx, fetch, run, pnpm, fs, platform }),
		writeChannel: (ctx, state) => writeChannel(ctx, state, fs),
	};
}

// ---------------------------------------------------------------------------
// `tomidev upgrade [--channel release|main]`
// ---------------------------------------------------------------------------

const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const UPGRADE_USAGE = "usage: tomidev upgrade [--channel release|main]";
const INSTALL_DEADLINE = 20 * MINUTE;

function parseUpgradeArgs(args) {
	if (args.length === 0) return null;
	let value;
	if (args.length === 1 && args[0].startsWith("--channel=")) value = args[0].slice("--channel=".length);
	else if (args.length === 2 && args[0] === "--channel") value = args[1];
	if (!CHANNELS.includes(value)) throw new MainChannelError("upgrade-usage", UPGRADE_USAGE);
	return value;
}

function older(left, right) {
	const [a, b] = [STABLE.exec(left), STABLE.exec(right)];
	if (!a || !b) return true;
	for (let index = 1; index <= 3; index += 1) {
		if (Number(a[index]) !== Number(b[index])) return Number(a[index]) < Number(b[index]);
	}
	return false;
}

function inside(parent, child) {
	const path = relative(parent, child);
	return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

/** Latest stable GitHub release: only a vX.Y.Z tag of the source repository.
 * Network access is supplied by the host, never performed by tests. */
export async function latestRelease(fetch) {
	let version = null;
	try {
		const response = await fetch(`https://api.github.com/repos/${SOURCE_REPOSITORY}/releases/latest`, {
			headers: { Accept: "application/vnd.github+json", "User-Agent": "tomidev" },
		});
		const release = response?.ok ? await response.json() : null;
		if (release?.draft !== true && release?.prerelease !== true && typeof release?.tag_name === "string" && release.tag_name.startsWith("v")) {
			version = release.tag_name.slice(1);
		}
	} catch {
		version = null;
	}
	if (typeof version !== "string" || !STABLE.test(version)) {
		throw new MainChannelError("latest-release-unavailable", `the latest stable tomidev release could not be read from ${SOURCE_REPOSITORY} (expected a vX.Y.Z GitHub release tag)`);
	}
	return version;
}

/**
 * Which package manager owns an installed package (tomidev unless `name` says
 * otherwise), from real (symlink-free) paths: pnpm when it lives under PNPM_HOME,
 * npm only when it is `<npm root -g>/<name>` itself, otherwise null — for example
 * an `npm link` of a source checkout, which must never be reinstalled over.
 * Paths follow `platform` (this host by default): case-insensitive on Windows.
 */
export function installOwner({ packageRoot, pnpmHome, npmRoot, name = "tomidev", platform = process.platform }) {
	const path = platform === "win32" ? win32 : posix;
	const comparable = (value) => (platform === "win32" ? value.toLowerCase() : value);
	if (typeof packageRoot !== "string") return null;
	if (typeof pnpmHome === "string") {
		const rest = path.relative(pnpmHome, packageRoot);
		if (rest !== "" && !rest.startsWith("..") && !path.isAbsolute(rest)) return "pnpm";
	}
	if (typeof npmRoot === "string" && comparable(path.relative(npmRoot, packageRoot)) === comparable(path.normalize(name))) return "npm";
	return null;
}

/** How a package manager runs, as { command, prefix }: what the host's
 * `invocation(name)` adapter returns when it has one (on Windows, node.exe and
 * the manager's JS entry, or a native .exe), otherwise the command `which` finds,
 * with no prefix. A Windows .cmd or .bat cannot run with shell:false, so it
 * counts as missing. Null when it is missing.
 */
async function invocationOf(name, { which, invocation }, platform) {
	const found = invocation ? await invocation(name) : await which(name).then((command) => (command ? { command, prefix: [] } : null));
	if (!found || (platform === "win32" && /\.(?:cmd|bat)$/i.test(found.command))) return null;
	return found;
}

async function npmGlobalRoot(npm, run, fs) {
	if (!npm) return null;
	const result = await run(npm.command, [...npm.prefix, "root", "-g"], { deadlineMs: deadlines.version });
	const reported = succeeded(result) ? String(result.stdout ?? "").trim().split(/\r?\n/).at(-1) : "";
	return isAbsolute(reported) ? fs.realpath(reported).catch(() => null) : null;
}

const OWNER_ADVICE = Object.freeze({ upgrade: "update it the way you installed it", uninstall: "remove it the way you installed it" });

/**
 * The package manager that owns this installation, as { name, command, prefix },
 * or a typed refusal whose code names the `command` that asked (`upgrade` or
 * `uninstall`). adapters: { fs, run, which, invocation? }, as runUpgrade takes them.
 */
export async function ownerManager({ ctx, platform, packageRoot, adapters, command: purpose = "upgrade" }) {
	const { fs, run } = adapters;
	const bin = pnpmGlobalBin({ platform, env: { HOME: ctx.home, ...ctx.env } });
	const npm = await invocationOf("npm", adapters, platform);
	const [pnpmHome, root, npmRoot] = await Promise.all([
		bin ? fs.realpath(bin.pnpmHome).catch(() => null) : null,
		fs.realpath(packageRoot).catch(() => null),
		npmGlobalRoot(npm, run, fs),
	]);
	const name = installOwner({ packageRoot: root, pnpmHome, npmRoot, platform });
	if (!name) {
		throw new MainChannelError(`${purpose}-owner-unknown`, `neither pnpm nor npm owns ${root ?? packageRoot} (a linked source checkout, for example); ${OWNER_ADVICE[purpose]}`);
	}
	const manager = name === "npm" ? npm : await invocationOf("pnpm", adapters, platform);
	if (!manager) {
		throw new MainChannelError(`${purpose}-manager-missing`, `${name}, which owns this ${BRAND_DISPLAY_NAME} installation, is not on PATH as a command this ${purpose} can run`);
	}
	return { name, ...manager };
}

async function installGlobal(manager, spec, run) {
	const argv = manager.name === "pnpm" ? ["add", "-g", spec, "--allow-build=tomidev"] : ["install", "-g", spec];
	if (!succeeded(await run(manager.command, [...manager.prefix, ...argv], { deadlineMs: INSTALL_DEADLINE }))) {
		throw new MainChannelError("upgrade-install-failed", `${manager.name} could not install ${spec}`);
	}
}

// The retired gentle-pi package: only the migration removes it (removeGlobalShell).
const REMOVE_GLOBAL = Object.freeze({ pnpm: Object.freeze(["remove", "-g", "gentle-pi"]), npm: Object.freeze(["uninstall", "-g", "gentle-pi"]) });

/** The command that removes the global gentle-pi with `name` (pnpm or npm), as a user types it. */
export function removeGlobalCommand(name) {
	return `${name} ${REMOVE_GLOBAL[name].join(" ")}`;
}

/** Removes the global gentle-pi with the manager ownerManager resolved (its
 * verified invocation); true when it succeeded. Nothing else is removed.
 */
export async function removeGlobalShell(manager, run) {
	return succeeded(await run(manager.command, [...manager.prefix, ...REMOVE_GLOBAL[manager.name]], { deadlineMs: INSTALL_DEADLINE }));
}

/** Retired main installs may have registered an override. Release migration
 * removes only that owned override, never a user's independent binary.
 * No installation or main upgrade creates a registration anymore. */
async function removeLegacyMainOverride(ctx, fs) {
	try {
		const devBinaryPath = join(configHome(ctx), "dev-binary.json");
		const text = await fs.readFile(devBinaryPath, "utf8");
		const registration = JSON.parse(text);
		const legacyPrefix = join(configHome(ctx), "main", "gentle-ai");
		if (typeof registration?.path === "string" && registration.path.startsWith(legacyPrefix)) {
			await fs.unlink(devBinaryPath);
		}
	} catch {
		// No registration, or one that is not ours: leave it alone.
	}
}

/**
 * Updates tomidev along its recorded channel (or the one `--channel` selects):
 * release uses the fork's latest stable Git release tag; main packs the latest fork SHA. Returns the exit code;
 * failures throw MainChannelError (`upgrade-usage` is a usage error).
 * adapters: { fetch, run, fs, which, invocation?, migrate? }; npm and pnpm run as
 * invocationOf resolves them (Windows hosts pass `invocation`). On release,
 * `migrate({ latest, owner })` (S4) may move this installation to the bundled
 * one first: null (no migration, or one that failed and left this package
 * untouched) keeps the path below for this run, otherwise { code, installed }.
 * `owner` is called only when a migration can happen.
 */
export async function runUpgrade({ args, ctx, platform, arch = process.arch, packageRoot, currentVersion, adapters, out }) {
	const { fetch, run, fs, which } = adapters;
	const requested = parseUpgradeArgs(args);
	const state = await readChannel(ctx, fs);
	const channel = requested ?? state.channel;
	if (channel === "release") {
		const latest = await latestRelease(fetch);
		const migrated = adapters.migrate ? await adapters.migrate({ latest, owner: () => ownerManager({ ctx, platform, packageRoot, adapters }) }) : null;
		if (migrated) {
			// The old package may stay: it follows the release channel, without a main override.
			if (migrated.installed) {
				await removeLegacyMainOverride(ctx, fs);
				await writeChannel(ctx, { channel: "release" }, fs);
			}
			return migrated.code;
		}
		if (state.channel === "release" && !older(currentVersion, latest)) {
			out(`tomidev ${currentVersion} is already the latest release.`);
			return 0;
		}
		await installGlobal(await ownerManager({ ctx, platform, packageRoot, adapters }), `${GIT_SOURCE}#v${latest}`, run);
		await removeLegacyMainOverride(ctx, fs);
		await writeChannel(ctx, { channel: "release" }, fs);
		out(`Updated tomidev ${currentVersion} to ${latest} (release).`);
		return 0;
	}
	const pnpm = await invocationOf("pnpm", adapters, platform);
	if (!pnpm) throw new MainChannelError("main-requires-tools", "the main channel packs tomidev with pnpm; put it on PATH");
	const shellCommit = await resolveMainCommit(SHELL_REPOSITORY, { fetch });
	const shellCurrent = state.channel === "main" && state.shellCommit === shellCommit && currentVersion.endsWith(`-main.${shellCommit.slice(0, 12)}`);
	const summary = `tomidev ${shellCommit.slice(0, 12)}`;
	if (shellCurrent) {
		out(`tomidev is already at the latest main: ${summary}.`);
		return 0;
	}
	const manager = await ownerManager({ ctx, platform, packageRoot, adapters });
	const tgz = await packMainShell({ commit: shellCommit, ctx, fetch, run, pnpm, fs, platform });
	await installGlobal(manager, tgz, run);
	await writeChannel(ctx, { channel: "main", shellCommit }, fs);
	out(`Updated to the latest main: ${summary}.`);
	return 0;
}
