import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { win32 } from "node:path";

const execFileAsync = promisify(execFile);

export type ProcessTreeKiller = (pid: number) => void;

type TreeKillSpawn = (file: string, args: readonly string[], options: { cwd: string; stdio: "ignore"; windowsHide: true }) => { on(event: "error", listener: () => void): unknown };

export function windowsTaskkillPath(env: NodeJS.ProcessEnv = process.env): string {
	const systemRoot = env.SystemRoot || env.windir;
	return win32.join(systemRoot && win32.isAbsolute(systemRoot) ? systemRoot : "C:\\Windows", "System32", "taskkill.exe");
}

export function createWindowsProcessTreeKiller(env: NodeJS.ProcessEnv = process.env, spawnProcess: TreeKillSpawn = spawn): ProcessTreeKiller {
	const taskkill = windowsTaskkillPath(env);
	return (pid) => {
		try {
			spawnProcess(taskkill, ["/pid", String(pid), "/T", "/F"], { cwd: win32.dirname(taskkill), stdio: "ignore", windowsHide: true }).on("error", () => {});
		} catch { /* Best effort: the call still settles through its own child. */ }
	};
}

export const windowsProcessTreeKiller: ProcessTreeKiller = (pid) => createWindowsProcessTreeKiller()(pid);

export interface ExecFileRequest {
	readonly file: string;
	readonly arguments: readonly string[];
	readonly cwd: string;
	readonly timeoutMs?: number;
	readonly maxBufferBytes?: number;
	readonly signal?: AbortSignal;
}

export interface ExecFileResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
	readonly signal: NodeJS.Signals | null;
	readonly timedOut: boolean;
	readonly outputLimitExceeded: boolean;
}

export type ExecFileAdapter = (request: ExecFileRequest) => Promise<ExecFileResult>;

function execFileResultFromError(error: unknown, timedOut: boolean): ExecFileResult {
	const detail = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: string | number; signal?: NodeJS.Signals; killed?: boolean };
	if (detail.code === "ENOENT" || detail.code === "EACCES" || detail.name === "AbortError") throw error;
	const outputLimitExceeded = detail.code === "ENOBUFS" || detail.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
	return { stdout: detail.stdout ?? "", stderr: detail.stderr ?? "", exitCode: typeof detail.code === "number" ? detail.code : 1, signal: detail.signal ?? null, timedOut: !outputLimitExceeded && (timedOut || detail.killed === true), outputLimitExceeded };
}

export function createNodeExecFileAdapter(options: { readonly platform?: NodeJS.Platform; readonly killProcessTree?: ProcessTreeKiller } = {}): ExecFileAdapter {
	return async (request) => {
		try {
			const output = await execFileAsync(request.file, [...request.arguments], { cwd: request.cwd, encoding: "utf8", shell: false, windowsHide: true, timeout: request.timeoutMs, maxBuffer: request.maxBufferBytes, signal: request.signal });
			return { stdout: output.stdout, stderr: output.stderr, exitCode: 0, signal: null, timedOut: false, outputLimitExceeded: false };
		} catch (error) {
			return execFileResultFromError(error, false);
		}
	};
}
