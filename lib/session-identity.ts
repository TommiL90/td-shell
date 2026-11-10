import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import { ENV_AGENTS_CHILD } from "./brand.ts";

const execFileAsync = promisify(execFile);

export interface GitCommandOptions {
	encoding: "utf8";
	timeout: number;
	maxBuffer: number;
	windowsHide?: boolean;
	stdio?: ["ignore", "pipe", "pipe"];
}

export type GitAsyncRunner = (command: string, args: readonly string[], options: GitCommandOptions) => Promise<{ stdout: string }>;
export type GitSyncRunner = (command: string, args: readonly string[], options: GitCommandOptions) => string;

export interface SessionManager {
	getSessionId(): unknown;
}

export interface SessionContext {
	cwd: string;
	mode?: string;
	hasUI: boolean;
	ui?: { getAllThemes?: () => readonly unknown[] };
	sessionManager: SessionManager;
}

export interface SessionIdentity {
	readonly sessionManager: SessionManager;
	readonly sessionId: string;
	readonly worktreeRoot: string;
	readonly repositoryIdentity: string;
}

export type ReviewSessionIdentity = SessionIdentity;
export type ReviewSessionManager = SessionManager;
export type ReviewSessionContext = SessionContext;

function exactSessionId(sessionManager: SessionManager): string | undefined {
	try {
		const raw = sessionManager.getSessionId();
		return typeof raw === "string" && raw.length > 0 ? raw : undefined;
	} catch {
		return undefined;
	}
}

function canonicalRepositoryIdentity(commonDir: string): string {
	return `sha256:${createHash("sha256").update(commonDir).digest("hex")}`;
}

function validAbsoluteGitPath(value: string): boolean {
	return isAbsolute(value) && value.length > 0 && !value.includes("\n") && !value.includes("\r");
}

export async function resolveCanonicalGitWorktreeRoot(
	cwd: string,
	run: GitAsyncRunner = execFileAsync as unknown as GitAsyncRunner,
): Promise<string | undefined> {
	try {
		const result = await run("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
			timeout: 5_000,
			maxBuffer: 64 * 1024,
			windowsHide: true,
		});
		const output = result.stdout.trim();
		if (!validAbsoluteGitPath(output)) return undefined;
		return await realpath(output);
	} catch {
		return undefined;
	}
}

/** Resolves a non-secret, clone-stable identity from Git's canonical common dir. */
export async function resolveCanonicalGitRepositoryIdentity(
	cwd: string,
	run: GitAsyncRunner = execFileAsync as unknown as GitAsyncRunner,
): Promise<string | undefined> {
	try {
		const result = await run("git", ["-C", cwd, "rev-parse", "--git-common-dir"], {
			encoding: "utf8",
			timeout: 5_000,
			maxBuffer: 64 * 1024,
			windowsHide: true,
		});
		const output = result.stdout.trim();
		if (output.length === 0 || output.includes("\n") || output.includes("\r")) return undefined;
		return canonicalRepositoryIdentity(await realpath(resolve(cwd, output)));
	} catch {
		return undefined;
	}
}

export function resolveCanonicalGitRepositoryIdentitySync(
	cwd: string,
	run: GitSyncRunner = execFileSync as unknown as GitSyncRunner,
): string | undefined {
	try {
		const output = run("git", ["-C", cwd, "rev-parse", "--git-common-dir"], {
			encoding: "utf8",
			timeout: 5_000,
			maxBuffer: 64 * 1024,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		if (output.length === 0 || output.includes("\n") || output.includes("\r")) return undefined;
		return canonicalRepositoryIdentity(realpathSync(resolve(cwd, output)));
	} catch {
		return undefined;
	}
}

function hasInteractiveTui(context: SessionContext): boolean {
	if (context.mode !== undefined) return context.mode === "tui";
	try {
		return (context.ui?.getAllThemes?.().length ?? 0) > 0;
	} catch {
		return false;
	}
}

export async function captureSessionIdentity(
	context: SessionContext,
	processEnv: NodeJS.ProcessEnv = process.env,
	resolveRoot: (cwd: string) => Promise<string | undefined> = resolveCanonicalGitWorktreeRoot,
	resolveRepositoryIdentity: (cwd: string) => Promise<string | undefined> = resolveCanonicalGitRepositoryIdentity,
): Promise<SessionIdentity | undefined> {
	if (processEnv[ENV_AGENTS_CHILD] === "1" || context.hasUI !== true || !hasInteractiveTui(context)) return undefined;
	const sessionManager = context.sessionManager;
	if (typeof sessionManager !== "object" || sessionManager === null) return undefined;
	const sessionId = exactSessionId(sessionManager);
	if (sessionId === undefined) return undefined;
	const [worktreeRoot, repositoryIdentity] = await Promise.all([resolveRoot(context.cwd), resolveRepositoryIdentity(context.cwd)]);
	if (worktreeRoot === undefined || repositoryIdentity === undefined) return undefined;
	return { sessionManager, sessionId, worktreeRoot, repositoryIdentity };
}
export const captureReviewSessionIdentity = captureSessionIdentity;

export function sameSessionIdentity(left: SessionIdentity | undefined, right: SessionIdentity | undefined): boolean {
	if (!left || !right) return false;
	return left.sessionManager === right.sessionManager && left.sessionId === right.sessionId && left.repositoryIdentity === right.repositoryIdentity;
}
export const sameReviewSessionIdentity = sameSessionIdentity;

export const UNSAFE_GIT_ENVIRONMENT = new Set([
	"GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE", "GIT_QUARANTINE_PATH", "GIT_PREFIX", "GIT_SUPER_PREFIX", "GIT_CEILING_DIRECTORIES", "GIT_DISCOVERY_ACROSS_FILESYSTEM", "GIT_CONFIG", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_COUNT", "GIT_REPLACE_REF_BASE", "GIT_NO_REPLACE_OBJECTS", "GIT_SHALLOW_FILE", "GIT_GRAFT_FILE",
]);

export const UNSAFE_PUBLICATION_GIT_ENVIRONMENT = new Set([
	...UNSAFE_GIT_ENVIRONMENT,
	"GIT_EXEC_PATH", "GIT_TEMPLATE_DIR", "GIT_CONFIG_PARAMETERS", "GIT_SSH", "GIT_SSH_COMMAND", "GIT_SSH_VARIANT", "GIT_PROXY_COMMAND",
]);

export function inheritedUnsafeGitEnvironmentKeys(environment: NodeJS.ProcessEnv = process.env): string[] {
	return Object.keys(environment)
		.filter((key) => {
			const normalizedKey = key.toUpperCase();
			return UNSAFE_PUBLICATION_GIT_ENVIRONMENT.has(normalizedKey) || /^GIT_CONFIG_(?:KEY|VALUE)_/.test(normalizedKey);
		})
		.toSorted();
}
