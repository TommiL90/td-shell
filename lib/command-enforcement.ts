import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { dataArgumentRanges } from "./destructive-command-guard.ts";

// Tomidev Shell command enforcement, applied to every shell tool call in order:
//   1. DESTRUCTIVE_COMMAND_DENYLIST refuses catastrophic forms without a dialog.
//   2. A git commit or push (detectGitOperations) runs only after the human confirms
//      the exact command and repository in the primary session. Child sessions and
//      headless sessions cannot confirm, so they are blocked.
//   3. private_harness_guard.py runs in the commit's repository before an approved commit.
//
// Detection is a small shell model, not a sandbox. It follows sh/bash/zsh/dash/ksh/fish
// -c payloads, eval, command substitution, subshells, groups, control keywords, && || ; |
// & chains, heredocs fed to a shell, env/sudo/xargs/nohup/timeout/time wrappers, absolute
// paths and find -exec. It does not follow text that is only data (echo, grep, quoted
// messages, a quoted heredoc, comments) and does not treat `git show <commit>` or
// `git log --grep commit` as operations.
//
// Not prevented here, and left to git hooks (the real safety for commits and pushes):
// scripts and programs in other languages that run git (python, make, npm version,
// lefthook or husky hooks, a script file such as `sh ./release.sh`), a stdin-fed shell
// (`printf ... | sh`), git aliases (`git ci`) and `git -c alias.x=...`, commits made by
// cherry-pick, revert, merge, am or update-ref, command names or subcommands built at run
// time (`$G commit`, `git${IFS}commit`, brace, glob, ANSI-C and `$'...'` forms), a `cd`
// into a non-literal path, and directory options that are not literal paths. Wrapper
// directory options such as `env -C` and `sudo -D` are applied; the others are reported.

export interface EnforcementResult {
	block: true;
	reason: string;
}

/** The command may run. `gitConfirmed` is true when the human approved its commit or push in this call. */
export interface EnforcementAllowance {
	block: false;
	gitConfirmed: boolean;
}

export type EnforcementDecision = EnforcementResult | EnforcementAllowance;

// Git global options that take their value as the next word (`git -C <dir> ...`).
export const GIT_GLOBAL_FLAGS_SRC = String.raw`(?:\s+--?\S+(?:\s+[^-\s]\S*)?)*\s+`;

// Root-like targets of a recursive removal: /, /*, ~ and ~/x, $HOME and $HOME/x, *, ., ..,
// ./*, ../*, ../.., .git, optionally quoted. `./dist`, `dist` and `*.log` are not matched.
const RM_TARGET = String.raw`["']?(?:\/\*?|~(?:\/[^\s;&|]*)?|\$\{?HOME\}?(?:\/[^\s;&|]*)?|\*|\.{1,2}(?:\/(?:\*|\.\.?)?)?|\.git\/?)["']?`;
const RECURSIVE_REMOVAL = new RegExp(
	String.raw`\brm\s+(?=(?:[^\r\n;&|]*\s)?-(?:-recursive\b|[a-zA-Z]*[rR]))(?:[^\r\n;&|]*\s)?${RM_TARGET}(?=\s|$|[;&|)])`,
	"i",
);

/**
 * The single destructive denylist: raw-text patterns refused without a dialog. The
 * data-argument exemption of the runtime guard is applied on top of this list by its caller.
 */
export const DESTRUCTIVE_COMMAND_DENYLIST: readonly RegExp[] = [
	RECURSIVE_REMOVAL,
	/\bgit\s+reset\s+--hard\b/i,
	/\bgit\s+clean\b(?=[^\n]*(?:-[^\n]*f|--force))(?=[^\n]*(?:-[^\n]*d|--directories))/i,
	// Force pushes to any remote: --force, --force-with-lease, --force-if-includes, -f (also
	// bundled, as in -uf), or a +refspec.
	new RegExp(String.raw`\bgit${GIT_GLOBAL_FLAGS_SRC}push\b(?=[^\r\n;&|]*(?:\s--force(?:-with-lease|-if-includes)?\b|\s-[^\s-]*f|\s\+\S))`, "i"),
	/\bchmod\s+-R\s+777\b/,
	/\bchown\s+-R\b/,
	/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\};\s*:/,
	/\bDROP\s+DATABASE\b/i,
	/\bmkfs(?:\.[a-z0-9_-]+)?(?=\s|$)/i,
	/\bdd\s[^\r\n;&|]*\bof=\/dev\//i,
];

/**
 * Refuses a denylisted form that is an operation. Text that a data command only
 * prints or searches (`echo "rm -rf /"`, `grep "DROP DATABASE" docs`) is not an
 * operation: the same data-argument exemption the runtime guard applies decides it.
 */
export function evaluateGateGuardDenylist(command: string): EnforcementResult | undefined {
	const dataRanges = dataArgumentRanges(command);
	for (const pattern of DESTRUCTIVE_COMMAND_DENYLIST) {
		const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
		const operation = [...command.matchAll(global)].find((match) => !dataRanges.some(([start, end]) => (match.index ?? 0) >= start && (match.index ?? 0) < end));
		if (operation === undefined) continue;
		return {
			block: true,
			reason: `Tomidev Shell gate-guard blocked dangerous/destructive command matching pattern: ${pattern}`,
		};
	}
	return undefined;
}

export type GitAction = "commit" | "push";

export interface GitOperation {
	action: GitAction;
	/** The repository directory the operation runs in; undefined when a `cd` target is not a literal path. */
	repo: string | undefined;
}

// `commit-tree` creates a commit object too, so it counts as a commit.
const GIT_ACTIONS: ReadonlyMap<string, GitAction> = new Map<string, GitAction>([
	["commit", "commit"],
	["commit-tree", "commit"],
	["push", "push"],
]);
// Git global options whose value is the next word; `-C` is handled separately.
const GIT_VALUE_FLAGS: ReadonlySet<string> = new Set(["-c", "--git-dir", "--work-tree", "--namespace"]);
const SHELLS: ReadonlySet<string> = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const FIND_EXEC: ReadonlySet<string> = new Set(["-exec", "-execdir", "-ok", "-okdir"]);
// Keywords that precede a command in command position (`if git …`, `then git …`).
const RESERVED_WORDS: ReadonlySet<string> = new Set(["!", "{", "}", "if", "then", "else", "elif", "fi", "do", "done", "while", "until", "case", "esac", "for", "select", "function"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// Nested payloads (`sh -c`, `eval`, `$(…)`) are strictly shorter than their parent, so
// recursion ends; the cap only bounds adversarial nesting.
const MAX_NESTING = 16;

interface Wrapper {
	/** Options whose value is the next word. */
	valued: readonly string[];
	/** Options that replace the command with a split string (`env -S`). */
	split?: readonly string[];
	/** Options that change the directory the wrapped command runs in. */
	chdir?: readonly string[];
	/** Options that mean the command is only looked up, never run (`command -v`). */
	noExec?: readonly string[];
	/** Operands before the wrapped command (`timeout <duration>`). */
	positionals?: number;
}

const WRAPPERS: ReadonlyMap<string, Wrapper> = new Map<string, Wrapper>([
	["command", { valued: [], noExec: ["-v", "-V"] }],
	["exec", { valued: ["-a"] }],
	["env", { valued: ["-u", "--unset"], chdir: ["-C", "--chdir"], split: ["-S", "--split-string"] }],
	["sudo", { valued: ["-u", "-g", "-h", "-p", "-r", "-t", "-T", "-U", "--user", "--group", "--host", "--prompt", "--role", "--type", "--command-timeout", "--other-user"], chdir: ["-D", "--chdir"] }],
	["doas", { valued: ["-u"] }],
	["xargs", { valued: ["-a", "-d", "-E", "-I", "-L", "-n", "-P", "-s", "--arg-file", "--delimiter", "--eof", "--max-args", "--max-chars", "--max-lines", "--max-procs"] }],
	["nice", { valued: ["-n", "--adjustment"] }],
	["nohup", { valued: [] }],
	["builtin", { valued: [] }],
	["time", { valued: ["-f", "-o", "--format", "--output"] }],
	["timeout", { valued: ["-s", "-k", "--signal", "--kill-after"], positionals: 1 }],
]);

// ---------------------------------------------------------------------------
// Lexing: words, operators, quoting, substitutions and heredocs.
// ---------------------------------------------------------------------------

interface Word {
	/** The word after quote and backslash removal. */
	value: string;
	raw: string;
	quoted: boolean;
	/** Contains a command or process substitution, so its value is not known. */
	dynamic: boolean;
}

interface CommandItem {
	kind: "command";
	words: string[];
	/** Bodies of `$(…)`, backticks, `<(…)` and unquoted-heredoc substitutions; these always run. */
	substitutions: string[];
	/** Heredoc and here-string bodies: data unless a shell reads them as its script. */
	stdin: string[];
}

type ShellItem = CommandItem | { kind: "open" } | { kind: "close" };

interface PendingHeredoc {
	delimiter: string;
	stripTabs: boolean;
	quoted: boolean;
	target: CommandItem;
}

type RedirectKind = "file" | "heredoc" | "herestring";

const REDIRECTION = /<<<|<<-|<<|<>|<&|<|>>|>&|>\||>/y;
const AMPERSAND_REDIRECTION = /&>>|&>/y;

/** Index of the `)` that closes a `$(` or `(` whose body starts at `start`, or the text length. */
function scanBalanced(text: string, start: number): number {
	let depth = 0;
	let index = start;
	while (index < text.length) {
		const char = text[index];
		if (char === "\\") index += 2;
		else if (char === "'") index = closeOf(text, "'", index + 1) + 1;
		else if (char === '"') index = scanDoubleQuoted(text, index + 1);
		else if (char === "`") index = scanBacktick(text, index + 1) + 1;
		else if (char === "(") {
			depth++;
			index++;
		} else if (char === ")") {
			if (depth === 0) return index;
			depth--;
			index++;
		} else index++;
	}
	return text.length;
}

function closeOf(text: string, quote: string, from: number): number {
	const close = text.indexOf(quote, from);
	return close < 0 ? text.length : close;
}

/** Index after the closing double quote; `$(` and backticks inside still nest. */
function scanDoubleQuoted(text: string, start: number): number {
	let index = start;
	while (index < text.length) {
		const char = text[index];
		if (char === "\\") index += 2;
		else if (char === '"') return index + 1;
		else if (char === "`") index = scanBacktick(text, index + 1) + 1;
		else if (char === "$" && text[index + 1] === "(") index = scanBalanced(text, index + 2) + 1;
		else index++;
	}
	return text.length;
}

/** Index of the closing backtick, or the text length. */
function scanBacktick(text: string, start: number): number {
	let index = start;
	while (index < text.length && text[index] !== "`") index += text[index] === "\\" ? 2 : 1;
	return Math.min(index, text.length);
}

function unescapeBacktick(body: string): string {
	return body.replace(/\\([$`\\])/g, "$1");
}

/** Substitution bodies that an unquoted heredoc body expands; quotes in the body are literal. */
function substitutionBodies(text: string): string[] {
	const bodies: string[] = [];
	for (let index = 0; index < text.length; index++) {
		if (text[index] === "\\") index++;
		else if (text[index] === "$" && text[index + 1] === "(") {
			const end = scanBalanced(text, index + 2);
			bodies.push(text.slice(index + 2, end));
			index = end;
		} else if (text[index] === "`") {
			const end = scanBacktick(text, index + 1);
			bodies.push(unescapeBacktick(text.slice(index + 1, end)));
			index = end;
		}
	}
	return bodies;
}

/** Reads each pending heredoc body in order and returns the index after the last terminator. */
function readHeredocBodies(text: string, start: number, pending: PendingHeredoc[]): number {
	let index = start;
	for (const heredoc of pending.splice(0)) {
		const lines: string[] = [];
		while (index < text.length) {
			const lineEnd = text.indexOf("\n", index);
			const end = lineEnd < 0 ? text.length : lineEnd;
			const line = text.slice(index, end);
			index = end + 1;
			if ((heredoc.stripTabs ? line.replace(/^\t+/, "") : line) === heredoc.delimiter) break;
			lines.push(line);
		}
		const body = lines.join("\n");
		heredoc.target.stdin.push(body);
		if (!heredoc.quoted) heredoc.target.substitutions.push(...substitutionBodies(body));
	}
	return Math.min(index, text.length);
}

function isWordEnd(char: string | undefined): boolean {
	return char === undefined || /[\s;&|()]/.test(char);
}

/** Splits one shell string into simple commands and subshell boundaries, in source order. */
function lex(text: string): ShellItem[] {
	const items: ShellItem[] = [];
	const heredocs: PendingHeredoc[] = [];
	let command: CommandItem | undefined;
	let word: Word | undefined;
	let redirect: RedirectKind | undefined;
	let redirectStripTabs = false;
	let index = 0;

	const current = (): CommandItem => {
		if (command === undefined) {
			command = { kind: "command", words: [], substitutions: [], stdin: [] };
			items.push(command);
		}
		return command;
	};
	const append = (value: string, raw: string, quoted: boolean, dynamic = false): void => {
		const target: Word = word ?? { value: "", raw: "", quoted: false, dynamic: false };
		target.value += value;
		target.raw += raw;
		target.quoted ||= quoted;
		target.dynamic ||= dynamic;
		word = target;
	};
	const substitute = (body: string, raw: string): void => {
		current().substitutions.push(body);
		append("", raw, false, true);
	};
	const finishRedirect = (target: Word): void => {
		const kind = redirect;
		redirect = undefined;
		if (kind === "heredoc") heredocs.push({ delimiter: target.value, stripTabs: redirectStripTabs, quoted: target.quoted, target: current() });
		else if (kind === "herestring") current().stdin.push(target.value);
	};
	const endWord = (): void => {
		const done = word;
		word = undefined;
		if (done === undefined) return;
		if (redirect !== undefined) {
			finishRedirect(done);
			return;
		}
		// An unquoted expansion that yields nothing disappears from the command line.
		if (done.value === "" && !done.quoted) return;
		current().words.push(done.value);
	};
	const endCommand = (): void => {
		endWord();
		redirect = undefined;
		command = undefined;
	};
	const startRedirect = (kind: RedirectKind, length: number, stripTabs = false): void => {
		// A bare descriptor number right before a redirection (`2>/dev/null`) is not an argument.
		if (word !== undefined && /^\d+$/.test(word.raw)) word = undefined;
		else endWord();
		redirect = kind;
		redirectStripTabs = stripTabs;
		index += length;
	};
	/** Double quotes: \ escapes only $ ` " \ and newline; $( and backticks still run. */
	const readDoubleQuoted = (start: number): void => {
		let value = "";
		let i = start + 1;
		while (i < text.length && text[i] !== '"') {
			const char = text[i];
			if (char === "\\" && "$`\"\\\n".includes(text[i + 1] ?? "")) {
				if (text[i + 1] !== "\n") value += text[i + 1];
				i += 2;
			} else if (char === "$" && text[i + 1] === "(") {
				const end = scanBalanced(text, i + 2);
				current().substitutions.push(text.slice(i + 2, end));
				append("", "", true, true);
				i = end + 1;
			} else if (char === "`") {
				const end = scanBacktick(text, i + 1);
				current().substitutions.push(unescapeBacktick(text.slice(i + 1, end)));
				append("", "", true, true);
				i = end + 1;
			} else {
				value += char;
				i++;
			}
		}
		append(value, text.slice(start, i + 1), true);
		index = i + 1;
	};

	while (index < text.length) {
		const char = text[index];
		if (char === " " || char === "\t" || char === "\r") {
			endWord();
			index++;
		} else if (char === "\n") {
			endCommand();
			index = readHeredocBodies(text, index + 1, heredocs);
		} else if (char === "#" && word === undefined && redirect === undefined) {
			const end = text.indexOf("\n", index);
			index = end < 0 ? text.length : end;
		} else if (char === ";" || char === "|") {
			endCommand();
			index++;
		} else if (char === "&") {
			if (text[index + 1] === ">") {
				AMPERSAND_REDIRECTION.lastIndex = index;
				startRedirect("file", AMPERSAND_REDIRECTION.exec(text)?.[0].length ?? 2);
			} else {
				endCommand();
				index++;
			}
		} else if (char === "(" || char === ")") {
			endCommand();
			items.push({ kind: char === "(" ? "open" : "close" });
			index++;
		} else if ((char === "{" || char === "}") && word === undefined && isWordEnd(text[index + 1])) {
			// Group braces are keywords only as standalone words; `{}` and `x{` are words.
			endCommand();
			index++;
		} else if (char === "<" || char === ">") {
			if (text[index + 1] === "(") {
				const end = scanBalanced(text, index + 2);
				current().substitutions.push(text.slice(index + 2, end));
				append("", text.slice(index, end + 1), false, true);
				index = end + 1;
			} else {
				REDIRECTION.lastIndex = index;
				const operator = REDIRECTION.exec(text)?.[0] ?? char;
				if (operator === "<<<") startRedirect("herestring", operator.length);
				else if (operator === "<<-") startRedirect("heredoc", operator.length, true);
				else if (operator === "<<") startRedirect("heredoc", operator.length);
				else startRedirect("file", operator.length);
			}
		} else if (char === "'") {
			const close = closeOf(text, "'", index + 1);
			append(text.slice(index + 1, close), text.slice(index, close + 1), true);
			index = close + 1;
		} else if (char === '"') {
			readDoubleQuoted(index);
		} else if (char === "`") {
			const end = scanBacktick(text, index + 1);
			substitute(unescapeBacktick(text.slice(index + 1, end)), text.slice(index, end + 1));
			index = end + 1;
		} else if (char === "$" && text[index + 1] === "(") {
			const end = scanBalanced(text, index + 2);
			substitute(text.slice(index + 2, end), text.slice(index, end + 1));
			index = end + 1;
		} else if (char === "\\") {
			const next = text[index + 1];
			if (next !== "\n") append(next ?? "", text.slice(index, index + 2), true);
			index += 2;
		} else {
			append(char, char, false);
			index++;
		}
	}
	endCommand();
	return items;
}

// ---------------------------------------------------------------------------
// Interpretation: wrappers, shells, eval, git, cd.
// ---------------------------------------------------------------------------

function executableName(word: string): string {
	return word.split(/[\\/]/).at(-1)?.replace(/\.exe$/i, "") ?? word;
}

function splitWords(value: string): string[] {
	return value.split(/\s+/).filter((part) => part.length > 0);
}

interface Unwrapped {
	argv: string[];
	chdirs: string[];
	noExec: boolean;
}

function unwrapWrapper(name: string, wrapper: Wrapper, args: readonly string[]): Unwrapped {
	const chdirs: string[] = [];
	let index = 0;
	while (index < args.length) {
		const arg = args[index];
		if (arg === "--") {
			index++;
			break;
		}
		if (wrapper.split?.includes(arg)) return { argv: [...splitWords(args[index + 1] ?? ""), ...args.slice(index + 2)], chdirs, noExec: false };
		if (arg.startsWith("-") && arg.length > 1) {
			if (wrapper.noExec?.includes(arg)) return { argv: [], chdirs, noExec: true };
			if (wrapper.chdir?.includes(arg)) {
				chdirs.push(args[index + 1] ?? "");
				index += 2;
			} else if (wrapper.chdir?.some((flag) => arg.startsWith(`${flag}=`))) {
				chdirs.push(arg.slice(arg.indexOf("=") + 1));
				index++;
			} else index += wrapper.valued.includes(arg) ? 2 : 1;
			continue;
		}
		if (name === "env" && ASSIGNMENT.test(arg)) {
			index++;
			continue;
		}
		break;
	}
	index += wrapper.positionals ?? 0;
	return { argv: args.slice(index), chdirs, noExec: false };
}

/** The argument vector after assignments, reserved words and wrapper prefixes are removed. */
function unwrap(words: readonly string[]): Unwrapped {
	let argv = [...words];
	const chdirs: string[] = [];
	for (;;) {
		if (argv.length === 0) return { argv, chdirs, noExec: false };
		const head = argv[0];
		if (RESERVED_WORDS.has(head) || ASSIGNMENT.test(head)) {
			argv = argv.slice(1);
			continue;
		}
		const name = executableName(head);
		const wrapper = WRAPPERS.get(name);
		if (wrapper === undefined) return { argv, chdirs, noExec: false };
		const step = unwrapWrapper(name, wrapper, argv.slice(1));
		if (step.noExec) return { argv: [], chdirs, noExec: true };
		chdirs.push(...step.chdirs);
		argv = step.argv;
	}
}

/** A directory named by a literal path, resolved against `base`; undefined when shell expansion decides it. */
function literalDirectory(value: string, base: string): string | undefined {
	if (value === "" || value === "-" || /[$`*?[\]{}]/.test(value)) return undefined;
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return join(homedir(), value.slice(2));
	return resolve(base, value);
}

function changeDirectory(args: readonly string[], dir: string | undefined): string | undefined {
	if (dir === undefined) return undefined;
	const operand = args.find((arg) => arg !== "--" && !/^-[LPe@]+$/.test(arg));
	return operand === undefined ? homedir() : literalDirectory(operand, dir);
}

function gitInvocation(name: string, args: readonly string[]): { action: GitAction; directories: string[] } | undefined {
	if (name.startsWith("git-")) {
		const action = GIT_ACTIONS.get(name.slice("git-".length));
		return action === undefined ? undefined : { action, directories: [] };
	}
	if (name !== "git") return undefined;
	const directories: string[] = [];
	let index = 0;
	while (index < args.length && args[index].startsWith("-")) {
		const flag = args[index++];
		if (flag === "-C") directories.push(args[index++] ?? "");
		else if (GIT_VALUE_FLAGS.has(flag)) index++;
	}
	const action = GIT_ACTIONS.get(args[index] ?? "");
	return action === undefined ? undefined : { action, directories };
}

function resolveRepo(dir: string | undefined, directories: readonly string[]): string | undefined {
	return directories.reduce<string | undefined>((base, directory) => (base === undefined ? undefined : literalDirectory(directory, base)), dir);
}

type ShellInput = { kind: "command"; text: string } | { kind: "file" } | { kind: "stdin" };

/** What a shell reads: a -c payload, a script file operand, or its standard input. */
function shellInput(args: readonly string[]): ShellInput {
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--") return index + 1 < args.length ? { kind: "file" } : { kind: "stdin" };
		if (arg === "-o" || arg === "+o") {
			index++;
			continue;
		}
		if (arg === "-") return { kind: "stdin" };
		if (!/^[-+]/.test(arg)) return { kind: "file" };
		if (/^[-+][a-zA-Z]*c[a-zA-Z]*$/.test(arg)) return { kind: "command", text: args[index + 1] ?? "" };
	}
	return { kind: "stdin" };
}

/** The argument lists of `find -exec … ;`, `-execdir`, `-ok` and `-okdir` invocations. */
function findInvocations(args: readonly string[]): string[][] {
	const invocations: string[][] = [];
	args.forEach((arg, index) => {
		if (!FIND_EXEC.has(arg)) return;
		const end = args.findIndex((candidate, at) => at > index && (candidate === ";" || candidate === "+"));
		invocations.push(args.slice(index + 1, end < 0 ? undefined : end));
	});
	return invocations;
}

function analyzeScript(script: string, dir: string | undefined, depth: number, out: GitOperation[]): void {
	if (depth > MAX_NESTING) return;
	const stack: Array<string | undefined> = [];
	let current = dir;
	for (const item of lex(script)) {
		if (item.kind === "open") stack.push(current);
		else if (item.kind === "close") current = stack.length > 0 ? stack.pop() : current;
		else current = analyzeCommand(item, current, depth, out);
	}
}

function analyzeCommand(item: CommandItem, dir: string | undefined, depth: number, out: GitOperation[]): string | undefined {
	for (const substitution of item.substitutions) analyzeScript(substitution, dir, depth + 1, out);
	return analyzeWords(item.words, item.stdin, dir, depth, out);
}

/** Runs one simple command's words; returns the directory the shell is in afterwards. */
function analyzeWords(words: readonly string[], stdin: readonly string[], dir: string | undefined, depth: number, out: GitOperation[]): string | undefined {
	const unwrapped = unwrap(words);
	if (unwrapped.noExec || unwrapped.argv.length === 0) return dir;
	const [head, ...args] = unwrapped.argv;
	const name = executableName(head);
	// Wrapper directory options (`env -C`, `sudo -D`) apply to this command only.
	const runDir = unwrapped.chdirs.reduce<string | undefined>((base, chdir) => (base === undefined ? undefined : literalDirectory(chdir, base)), dir);

	if (SHELLS.has(name)) {
		const input = shellInput(args);
		if (input.kind === "command") analyzeScript(input.text, runDir, depth + 1, out);
		else if (input.kind === "stdin") for (const body of stdin) analyzeScript(body, runDir, depth + 1, out);
		return dir;
	}
	if (name === "eval") {
		const payload = args[0] === "--" ? args.slice(1) : args;
		analyzeScript(payload.join(" "), runDir, depth + 1, out);
		return dir;
	}
	if (name === "cd" || name === "pushd") return changeDirectory(args, dir);
	if (name === "popd") return undefined;
	if (name === "find") {
		for (const invocation of findInvocations(args)) analyzeWords(invocation, [], runDir, depth + 1, out);
		return dir;
	}
	const git = gitInvocation(name, args);
	if (git !== undefined) out.push({ action: git.action, repo: resolveRepo(runDir, git.directories) });
	return dir;
}

/**
 * The git commits and pushes a shell command line would run, in order, each with the
 * repository it runs in. `cwd` is the session directory the command starts in.
 */
export function detectGitOperations(command: string, cwd: string): GitOperation[] {
	const operations: GitOperation[] = [];
	analyzeScript(command, cwd, 0, operations);
	return operations;
}

// ---------------------------------------------------------------------------
// private_harness_guard.py.
// ---------------------------------------------------------------------------

export type PrivateHarnessGuardOutcome =
	| { status: "absent" }
	| { status: "passed"; output: string }
	| { status: "failed"; output: string }
	| { status: "unavailable"; reason: string };

export interface GuardProcess {
	status: number | null;
	signal?: NodeJS.Signals | null;
	stdout?: string;
	stderr?: string;
	error?: NodeJS.ErrnoException;
}

export type GuardSpawn = (command: string, args: readonly string[], options: { cwd: string; encoding: "utf8"; timeout: number }) => GuardProcess;

const GUARD_SCRIPT = join(".agents", "scripts", "private_harness_guard.py");
const GUARD_TIMEOUT_MS = 15_000;
const PYTHON_INTERPRETERS = ["python3", "python"] as const;

const defaultGuardSpawn: GuardSpawn = (command, args, options) => spawnSync(command, [...args], options);

function guardOutcome(process: GuardProcess): PrivateHarnessGuardOutcome {
	if (process.error?.code === "ETIMEDOUT") return { status: "unavailable", reason: `timed out after ${GUARD_TIMEOUT_MS / 1000} seconds` };
	if (process.error !== undefined) return { status: "unavailable", reason: process.error.message };
	if (process.status === null) return { status: "unavailable", reason: `terminated by signal ${process.signal ?? "unknown"}` };
	const output = `${process.stdout ?? ""}${process.stderr ?? ""}`.trim();
	if (process.status === 0) return { status: "passed", output };
	return { status: "failed", output: output === "" ? `exit status ${process.status}` : output };
}

/**
 * Runs the repository's commit guard. `python3` is tried first and `python` only when
 * `python3` cannot be started, so a guard that ran and failed is never retried.
 */
export function runPrivateHarnessGuard(repo: string, spawn: GuardSpawn = defaultGuardSpawn): PrivateHarnessGuardOutcome {
	if (!existsSync(join(repo, GUARD_SCRIPT))) return { status: "absent" };
	for (const interpreter of PYTHON_INTERPRETERS) {
		const process = spawn(interpreter, [GUARD_SCRIPT, "--root", "."], { cwd: repo, encoding: "utf8", timeout: GUARD_TIMEOUT_MS });
		if (process.error?.code === "ENOENT") continue;
		return guardOutcome(process);
	}
	return { status: "unavailable", reason: "neither python3 nor python is on PATH; install Python 3 so the guard can run" };
}

// ---------------------------------------------------------------------------
// Decision.
// ---------------------------------------------------------------------------

export interface CommandEnforcementOptions {
	/** True in a delegated child session, which can never approve a commit or push. */
	childSession: boolean;
	/** The human's confirmation dialog; absent when no interactive UI exists. */
	confirm?: (title: string, message: string) => Promise<boolean>;
	/** Runs the commit guard for one repository; defaults to runPrivateHarnessGuard. */
	guard?: (repo: string) => PrivateHarnessGuardOutcome;
}

const CHILD_REASON = "Tomidev Shell enforcement: commits and pushes need explicit confirmation from the human in the primary session; this child session cannot ask, so the git command was not run.";
const HEADLESS_REASON = "Tomidev Shell enforcement: commits and pushes need explicit confirmation from the human in the primary session; no interactive UI is available, so the git command was not run.";
const NOT_CONFIRMED_REASON = "Tomidev Shell enforcement: the git commit or push was not confirmed by the human, so it was not run.";
const GIT_LABEL: Readonly<Record<GitAction, string>> = { commit: "git commit", push: "git push" };

function block(reason: string): EnforcementResult {
	return { block: true, reason };
}

function describeRepo(repo: string | undefined, cwd: string): string {
	return repo ?? `${cwd} (a cd target in this command is not a literal path, so the session directory is shown)`;
}

async function askHuman(command: string, operations: readonly GitOperation[], cwd: string, confirm: (title: string, message: string) => Promise<boolean>): Promise<boolean> {
	const repos = [...new Set(operations.map((operation) => describeRepo(operation.repo, cwd)))];
	const labels = [...new Set(operations.map((operation) => GIT_LABEL[operation.action]))];
	const message = `Command: ${command}\nRepository: ${repos.join(", ")}\n\nApprove only if you asked for this commit or push.`;
	try {
		return (await confirm(`Allow ${labels.join(" and ")}?`, message)) === true;
	} catch {
		// A dialog that fails to open confirms nothing.
		return false;
	}
}

function guardVerdict(outcome: PrivateHarnessGuardOutcome, repo: string): EnforcementResult | undefined {
	if (outcome.status === "absent" || outcome.status === "passed") return undefined;
	if (outcome.status === "failed") return block(`Tomidev Shell enforcement: .agents/scripts/private_harness_guard.py failed in ${repo}; the commit was not run:\n${outcome.output}`);
	return block(`Tomidev Shell enforcement: could not run .agents/scripts/private_harness_guard.py in ${repo} (${outcome.reason}); the commit was not run. Make Python 3 available as python3 or python, then retry.`);
}

/**
 * Decides one shell command. Denylisted forms are refused first and never reach the
 * dialog. A commit or push is blocked in child and headless sessions and otherwise runs
 * only after the human confirms it, in every permission mode; an approved commit then
 * passes the repository guard. `gitConfirmed` tells the guard path that this dialog
 * already answered for the command's push.
 */
export async function evaluateTomidevCommandEnforcement(command: string, cwd: string, options: CommandEnforcementOptions): Promise<EnforcementDecision> {
	const denied = evaluateGateGuardDenylist(command);
	if (denied !== undefined) return denied;
	const operations = detectGitOperations(command, cwd);
	if (operations.length === 0) return { block: false, gitConfirmed: false };
	if (options.childSession) return block(CHILD_REASON);
	if (options.confirm === undefined) return block(HEADLESS_REASON);
	if (!(await askHuman(command, operations, cwd, options.confirm))) return block(NOT_CONFIRMED_REASON);
	const guard = options.guard ?? ((repo: string) => runPrivateHarnessGuard(repo));
	const commitRepos = new Set(operations.filter((operation) => operation.action === "commit").map((operation) => operation.repo ?? cwd));
	for (const repo of commitRepos) {
		const verdict = guardVerdict(guard(repo), repo);
		if (verdict !== undefined) return verdict;
	}
	return { block: false, gitConfirmed: true };
}
