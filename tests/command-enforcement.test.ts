import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";
import {
	detectGitOperations,
	evaluateGateGuardDenylist,
	evaluateTomidevCommandEnforcement,
	runPrivateHarnessGuard,
	type EnforcementAllowance,
	type EnforcementDecision,
	type EnforcementResult,
} from "../lib/command-enforcement.ts";

// Tomidev Shell commit/push enforcement and the destructive denylist. A commit or
// push runs only after the human confirms it in the primary session, in every
// permission mode; the guard script runs before an approved commit. Checks go
// through the exported decision functions and the tool_call hook, never through
// internal state.

const root = realpathSync(mkdtempSync(join(tmpdir(), "tomidev-enforcement-")));
after(() => rmSync(root, { recursive: true, force: true }));

const CWD = "/work/app";
const CHILD_REASON = "commits and pushes need explicit confirmation from the human in the primary session";
const HEADLESS_REASON = /commits and pushes need explicit confirmation from the human in the primary session; no interactive UI/;

function repo(name: string, guard?: string): string {
	const dir = join(root, name);
	mkdirSync(dir, { recursive: true });
	if (guard !== undefined) {
		mkdirSync(join(dir, ".agents", "scripts"), { recursive: true });
		writeFileSync(join(dir, ".agents", "scripts", "private_harness_guard.py"), guard);
	}
	return dir;
}

const PASSING_GUARD = 'import sys\nprint("guard passed")\nsys.exit(0)\n';
const FAILING_GUARD = 'import os, sys\nprint("secret pattern found in " + os.getcwd())\nsys.exit(1)\n';

interface Prompt { title: string; message: string }

/** A confirmation dialog that records each prompt and answers with a fixed result. */
function dialog(answer: boolean | Error) {
	const prompts: Prompt[] = [];
	const confirm = async (title: string, message: string): Promise<boolean> => {
		prompts.push({ title, message });
		if (answer instanceof Error) throw answer;
		return answer;
	};
	return { prompts, confirm };
}

/** The decision for an allowed command, asserted so its fields can be read. */
function allowance(decision: EnforcementDecision): EnforcementAllowance {
	assert.equal(decision.block, false, decision.block ? decision.reason : "expected the command to be allowed");
	return decision as EnforcementAllowance;
}

function reasonOf(decision: EnforcementDecision): string {
	assert.equal(decision.block, true, "expected the command to be blocked");
	return (decision as EnforcementResult).reason;
}

const WRAPPED_OPERATIONS = [
	"bash -c 'git commit -m x'",
	'sh -lc "git push origin main"',
	"zsh -c 'git commit -m x && git push'",
	"eval 'git push origin main'",
	"eval git commit -m x",
	"env GIT_TRACE=1 git push",
	"/usr/bin/git commit -m x",
	"command git push",
	"exec git commit -m x",
	"sudo git push",
	"xargs git commit -m x",
	"(git commit -m x)",
	"{ git push; }",
	"if true; then git commit -m x; fi",
	"git add -A && git commit -m x",
	"true || git push",
	"echo $(git commit -m x)",
	"git commit-tree HEAD -m x",
	"bash <<'EOF'\ngit commit -m x\nEOF",
];

test("denylist blocks catastrophic removal, force pushes, resets, database drops and disk tools", () => {
	const dangerous = [
		"rm -rf /", "rm -rf /*", "sudo rm -rf /*", "rm -r -f ./*", "rm -fr ./*", "rm -R -f ~", "rm -rf ~/projects",
		"rm -rf $HOME", 'rm -rf "$HOME"', "rm -rf .", "rm -rf ..", "rm -rf ../..", "rm -rf *", "rm --recursive --force .",
		"rm -rf .git", "git push origin main --force", "git push -f", "git push --force-with-lease origin feat",
		"git push origin +main", "git push upstream --force", "git reset --hard origin/main", "git reset --hard origin/master",
		"git reset --hard HEAD~2", "git clean -fd", "chmod -R 777 build", "chown -R root /x", ":(){ :|:& };:",
		"DROP DATABASE production;", "mkfs.ext4 /dev/sdb1", "mkfs /dev/sdb1", "dd if=/dev/zero of=/dev/sda",
	];
	for (const command of dangerous) {
		const result = evaluateGateGuardDenylist(command);
		assert.ok(result?.block, `expected ${command} to be blocked`);
		assert.match(result.reason, /gate-guard blocked/);
	}
});

test("denylist keeps ordinary cleanup, non-force pushes, read-only git and DROP TABLE allowed", () => {
	for (const command of [
		"rm temp.txt", "rm -rf ./dist", "rm -rf ./dist/*", "rm -rf dist", "rm -rf node_modules", "rm -rf /tmp/build-cache",
		"git status", "git diff", "git log --oneline", "npm test", "git push origin main", "git push -u origin feature",
		"git reset --soft HEAD~1",
		// DROP TABLE is a recognized data-loss confirmation (runtime guard), not a denylist form.
		"psql -c 'DROP TABLE users'",
	]) {
		assert.equal(evaluateGateGuardDenylist(command), undefined, `expected ${command} to stay allowed`);
	}
});

test("denylist leaves data arguments alone, but a real operation next to them is still blocked", () => {
	for (const command of [
		'echo "rm -rf /"', "printf '%s\\n' 'git reset --hard'", 'grep -rn "DROP DATABASE" docs', "echo 'git push --force'",
	]) {
		assert.equal(evaluateGateGuardDenylist(command), undefined, `expected data argument ${command} to stay allowed`);
	}
	for (const command of [
		'echo ok; rm -rf /', "sh -c 'rm -rf /'", 'echo "ok" && rm -rf "$HOME"', "grep x docs && git push -f",
	]) {
		assert.ok(evaluateGateGuardDenylist(command)?.block, `expected ${command} to be blocked`);
	}
});

test("detectGitOperations finds commit, commit-tree and push behind wrappers, shells, eval and chains", () => {
	const expectations: Array<[string, string[]]> = [
		["git commit -m 'feat: x'", ["commit"]],
		["git push origin main", ["push"]],
		["git commit-tree HEAD^{tree} -m x", ["commit"]],
		["git add . && git commit -m done && git push", ["commit", "push"]],
		["git status; git push", ["push"]],
		["false || git commit -m x", ["commit"]],
		["git -C ../other commit -m x", ["commit"]],
		["git -c user.name=x -c user.email=y commit -m x", ["commit"]],
		["git --no-pager push", ["push"]],
		["git --git-dir=.git --work-tree=. commit -m x", ["commit"]],
		["git --git-dir .git commit -m x", ["commit"]],
		["/usr/bin/git commit -m x", ["commit"]],
		["GIT_AUTHOR_NAME=x git commit -m y", ["commit"]],
		["env GIT_TRACE=1 git push", ["push"]],
		["env -i PATH=/usr/bin git commit -m x", ["commit"]],
		["env -S 'git commit -m x'", ["commit"]],
		["command git commit -m x", ["commit"]],
		["exec git push", ["push"]],
		["sudo git push", ["push"]],
		["sudo -u root git commit -m x", ["commit"]],
		["nohup git push origin main &", ["push"]],
		["timeout 30 git push", ["push"]],
		["time git commit -m x", ["commit"]],
		["echo a | xargs git commit", ["commit"]],
		["xargs -I{} git push {}", ["push"]],
		["(git commit -m x)", ["commit"]],
		["( cd sub && git push )", ["push"]],
		["{ git commit -m x; }", ["commit"]],
		["if git diff --quiet; then git commit -m x; fi", ["commit"]],
		["while true; do git push; done", ["push"]],
		["! git push", ["push"]],
		["bash -c 'git commit -m x'", ["commit"]],
		['sh -lc "git push origin main"', ["push"]],
		["zsh -c 'git commit -m x && git push'", ["commit", "push"]],
		["bash -c 'bash -c \"git commit\"'", ["commit"]],
		["eval 'git push origin main'", ["push"]],
		["eval git commit -m x", ["commit"]],
		["sh -c \"eval 'git commit -m x'\"", ["commit"]],
		["echo $(git commit -m x)", ["commit"]],
		["echo `git push`", ["push"]],
		["bash <<'EOF'\ngit commit -m x\nEOF", ["commit"]],
		["bash <<< 'git push'", ["push"]],
		["git-commit -m x", ["commit"]],
		["find . -name '*.md' -exec git commit -am x \\;", ["commit"]],
	];
	for (const [command, actions] of expectations) {
		assert.deepEqual(detectGitOperations(command, CWD).map((operation) => operation.action), actions, command);
	}
});

test("detectGitOperations ignores text that only mentions git, and git subcommands that take a commit as an argument", () => {
	for (const command of [
		'echo "git commit"', "echo 'git push origin main'", "printf '%s\\n' 'git commit'", "grep commit CHANGELOG.md",
		"git log --grep commit", "git log --oneline --grep='git push'", "git show 1a2b3c", "git show HEAD --stat",
		"git stash push -m 'commit later'", "git tag -m 'commit' v1", "git commit-graph write", "npm run commit",
		"pnpm run push-check", "cat <<'EOF'\ngit push origin main\nEOF", "cat <<EOF > notes.md\ngit commit -m x\nEOF",
		"# git commit", "echo ok # git push", "sh script.sh", "bash ./ci/push.sh", "git status", "git diff HEAD",
		"sh -c 'echo \"git commit\"'", "git -C repo log --grep push", "echo git && echo commit", "grep -r 'git push' docs",
	]) {
		assert.deepEqual(detectGitOperations(command, CWD), [], command);
	}
});

test("detectGitOperations reports the repository each operation runs in", () => {
	const repoOf = (command: string): Array<string | undefined> => detectGitOperations(command, "/w").map((operation) => operation.repo);
	assert.deepEqual(repoOf("git commit -m x"), ["/w"]);
	assert.deepEqual(repoOf("git -C ../other commit -m x"), ["/other"]);
	assert.deepEqual(repoOf("git -C a -C b push"), ["/w/a/b"]);
	assert.deepEqual(repoOf("cd sub && git commit -m x"), ["/w/sub"]);
	assert.deepEqual(repoOf("(cd sub && git commit -m x); git push"), ["/w/sub", "/w"]);
	assert.deepEqual(repoOf('cd "$DIR" && git commit -m x'), [undefined]);
	assert.deepEqual(repoOf("sh -c 'cd /x && git push'"), ["/x"]);
});

test("a commit or push in any supported form is blocked unless the human confirms it, and the prompt names the command and repo", async () => {
	const target = repo("declined");
	for (const command of WRAPPED_OPERATIONS) {
		const prompt = dialog(false);
		const decision = await evaluateTomidevCommandEnforcement(command, target, { childSession: false, confirm: prompt.confirm });
		assert.match(reasonOf(decision), /not confirmed by the human/, command);
		assert.equal(prompt.prompts.length, 1, `${command} must ask exactly once`);
		assert.ok(prompt.prompts[0].message.includes(command), `prompt must show the exact command: ${command}`);
		assert.ok(prompt.prompts[0].message.includes(target), `prompt must show the repository: ${command}`);
	}
});

test("an approved commit or push is allowed and reports that the human confirmed the git operation", async () => {
	const target = repo("approved");
	for (const command of WRAPPED_OPERATIONS) {
		const prompt = dialog(true);
		assert.equal(allowance(await evaluateTomidevCommandEnforcement(command, target, { childSession: false, confirm: prompt.confirm })).gitConfirmed, true, command);
		assert.equal(prompt.prompts.length, 1, command);
	}
});

test("headless and child sessions cannot approve a commit or push, and the child never asks", async () => {
	const target = repo("headless");
	const headless = await evaluateTomidevCommandEnforcement("git commit -m x", target, { childSession: false });
	assert.match(reasonOf(headless), HEADLESS_REASON);

	const prompt = dialog(true);
	const child = await evaluateTomidevCommandEnforcement("bash -c 'git push origin main'", target, { childSession: true, confirm: prompt.confirm });
	assert.ok(reasonOf(child).includes(CHILD_REASON));
	assert.equal(prompt.prompts.length, 0, "a child session must not reach the dialog");

	assert.equal(allowance(await evaluateTomidevCommandEnforcement("git status", target, { childSession: true })).gitConfirmed, false);
	assert.equal(allowance(await evaluateTomidevCommandEnforcement("git status", target, { childSession: false })).gitConfirmed, false);
});

test("false positives stay allowed without asking the human", async () => {
	const target = repo("false-positives");
	for (const command of ['echo "git commit"', "grep commit x", "git log --grep commit", "git show abc123", "cat <<'EOF'\ngit push\nEOF"]) {
		const prompt = dialog(false);
		assert.equal(allowance(await evaluateTomidevCommandEnforcement(command, target, { childSession: false, confirm: prompt.confirm })).gitConfirmed, false, command);
		assert.equal(prompt.prompts.length, 0, `${command} must not ask`);
	}
});

test("confirmation never waives the denylist, and a failed dialog blocks the command", async () => {
	const target = repo("denylist-precedence");
	const approved = dialog(true);
	const denied = await evaluateTomidevCommandEnforcement("rm -rf /", target, { childSession: false, confirm: approved.confirm });
	assert.match(reasonOf(denied), /gate-guard blocked/);
	assert.equal(approved.prompts.length, 0, "a denylisted command must not reach the dialog");

	const broken = dialog(new Error("dialog closed"));
	const failed = await evaluateTomidevCommandEnforcement("git commit -m x", target, { childSession: false, confirm: broken.confirm });
	assert.match(reasonOf(failed), /not confirmed by the human/);
});

test("the commit guard runs only for an approved commit: absent, passing and failing guards decide it", async () => {
	const absent = repo("guard-absent");
	allowance(await evaluateTomidevCommandEnforcement("git commit -m x", absent, { childSession: false, confirm: dialog(true).confirm }));

	const passing = repo("guard-passing", PASSING_GUARD);
	allowance(await evaluateTomidevCommandEnforcement("git commit -m x", passing, { childSession: false, confirm: dialog(true).confirm }));

	const failing = repo("guard-failing", FAILING_GUARD);
	const blocked = reasonOf(await evaluateTomidevCommandEnforcement("git commit -m x", failing, { childSession: false, confirm: dialog(true).confirm }));
	assert.match(blocked, /private_harness_guard\.py failed/);
	assert.ok(blocked.includes(`secret pattern found in ${failing}`), blocked);
	assert.doesNotMatch(blocked, /could not run/);

	allowance(await evaluateTomidevCommandEnforcement("git push origin main", failing, { childSession: false, confirm: dialog(true).confirm }));
});

test("the guard runs against the git -C target when present, otherwise the session cwd", async () => {
	const sessionRepo = repo("session-failing", FAILING_GUARD);
	const clean = repo("target-clean");
	allowance(await evaluateTomidevCommandEnforcement("git -C ../target-clean commit -m x", sessionRepo, { childSession: false, confirm: dialog(true).confirm }));

	const targetFailing = repo("target-failing", FAILING_GUARD);
	const blocked = reasonOf(await evaluateTomidevCommandEnforcement("git -C ../target-failing commit -m x", clean, { childSession: false, confirm: dialog(true).confirm }));
	assert.ok(blocked.includes(`secret pattern found in ${targetFailing}`), blocked);
});

test("a missing python interpreter blocks an approved commit and names the cause", async () => {
	const target = repo("no-python", PASSING_GUARD);
	const emptyPath = join(root, "empty-path");
	mkdirSync(emptyPath, { recursive: true });
	const previous = process.env.PATH;
	process.env.PATH = emptyPath;
	try {
		const reason = reasonOf(await evaluateTomidevCommandEnforcement("git commit -m x", target, { childSession: false, confirm: dialog(true).confirm }));
		assert.match(reason, /could not run \.agents\/scripts\/private_harness_guard\.py/);
		assert.match(reason, /neither python3 nor python is on PATH/);
	} finally {
		process.env.PATH = previous;
	}
});

test("runPrivateHarnessGuard falls back from python3 to python only when python3 is missing", () => {
	const guarded = repo("fallback", PASSING_GUARD);
	const calls: Array<{ command: string; args: readonly string[]; cwd: string | undefined }> = [];
	const enoent = Object.assign(new Error("spawnSync python3 ENOENT"), { code: "ENOENT" });
	const missingPython3 = (command: string, args: readonly string[], options: { cwd: string }) => {
		calls.push({ command, args, cwd: options.cwd });
		return command === "python3" ? { status: null, error: enoent } : { status: 0, stdout: "guard passed\n", stderr: "" };
	};
	assert.deepEqual(runPrivateHarnessGuard(guarded, missingPython3), { status: "passed", output: "guard passed" });
	assert.deepEqual(calls.map((call) => call.command), ["python3", "python"]);
	assert.deepEqual(calls[0].args, [join(".agents", "scripts", "private_harness_guard.py"), "--root", "."]);
	assert.equal(calls[0].cwd, guarded);

	calls.length = 0;
	const failed = runPrivateHarnessGuard(guarded, (command, args, options) => {
		calls.push({ command, args, cwd: options.cwd });
		return { status: 1, stdout: "", stderr: "dirty tree\n" };
	});
	assert.deepEqual(failed, { status: "failed", output: "dirty tree" });
	assert.deepEqual(calls.map((call) => call.command), ["python3"], "a guard that ran and failed must not be retried with python");

	const neither = runPrivateHarnessGuard(guarded, () => ({ status: null, error: enoent }));
	assert.equal(neither.status, "unavailable");
	assert.match(neither.status === "unavailable" ? neither.reason : "", /neither python3 nor python is on PATH/);

	const absent = repo("fallback-absent");
	let spawned = false;
	assert.deepEqual(runPrivateHarnessGuard(absent, () => { spawned = true; return { status: 0 }; }), { status: "absent" });
	assert.equal(spawned, false);
});

test("runPrivateHarnessGuard reports a timeout or a signal kill as unavailable, not as a failed guard", () => {
	const guarded = repo("timeout", PASSING_GUARD);
	const timedOut = Object.assign(new Error("spawnSync python3 ETIMEDOUT"), { code: "ETIMEDOUT" });
	const outcome = runPrivateHarnessGuard(guarded, () => ({ status: null, signal: "SIGTERM", error: timedOut }));
	assert.equal(outcome.status, "unavailable");
	assert.match(outcome.status === "unavailable" ? outcome.reason : "", /timed out/);

	const killed = runPrivateHarnessGuard(guarded, () => ({ status: null, signal: "SIGKILL" }));
	assert.equal(killed.status, "unavailable");
	assert.match(killed.status === "unavailable" ? killed.reason : "", /SIGKILL/);
});

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

/** The real tool_call chain for a primary, child or headless session. `answers` decides each dialog by its title. */
function toolCallChain(options: { child?: boolean; hasUI?: boolean; answers?: (title: string) => boolean }) {
	const handlers: Handler[] = [];
	const pi = {
		on: (name: string, handler: Handler) => { if (name === "tool_call") handlers.push(handler); },
		events: { on() {}, emit() {} },
		registerTool() {}, registerCommand() {}, registerShortcut() {}, registerMessageRenderer() {},
	} as unknown as ExtensionAPI;
	const home = mkdtempSync(join(root, "config-"));
	createGentleAiExtension({ processEnv: { TOMIDEV_AGENTS_CHILD: options.child === true ? "1" : "0", TOMIDEV_CONFIG_HOME: home, GENTLE_AI_TELEMETRY: "0" }, nativeReviewCli: null })(pi);
	const prompts: Prompt[] = [];
	const answers = options.answers ?? (() => false);
	const cwd = repo(`hook-${Math.random().toString(36).slice(2)}`);
	const sessionManager = { getSessionId: () => "enforcement-session", getBranch: () => [], getEntries: () => [] };
	const ctx = {
		cwd,
		hasUI: options.hasUI ?? true,
		sessionManager,
		ui: {
			confirm: async (title: string, message: string) => {
				prompts.push({ title, message });
				return answers(title);
			},
			notify() {},
		},
	} as unknown as ExtensionContext;
	const bash = async (command: string) => {
		for (const handler of handlers) {
			const result = await handler({ toolName: "bash", toolCallId: "probe", input: { command } }, ctx);
			if (result !== undefined) return result as { block?: boolean; reason?: string };
		}
		return undefined;
	};
	return { bash, prompts };
}

const APPROVE_GIT = (title: string) => title.startsWith("Allow git");

test("tool_call asks the human before a commit or push, even before any human input", async () => {
	const declined = toolCallChain({ answers: () => false });
	const blockedCommit = await declined.bash("git commit -m 'test'");
	assert.ok(blockedCommit?.block);
	assert.match(blockedCommit.reason ?? "", /not confirmed by the human/);
	assert.equal(declined.prompts.length, 1);
	assert.ok(declined.prompts[0].message.includes("git commit -m 'test'"));

	const approved = toolCallChain({ answers: APPROVE_GIT });
	assert.equal(await approved.bash("git commit -m 'test'"), undefined);
	assert.equal(approved.prompts.length, 1);
});

test("an approved push shows one dialog: the guard's own push confirmation is folded into it", async () => {
	const approved = toolCallChain({ answers: APPROVE_GIT });
	assert.equal(await approved.bash("git push origin main"), undefined);
	assert.equal(approved.prompts.length, 1, "one commit/push dialog, no second push prompt");
	assert.equal(approved.prompts[0].title, "Allow git push?");

	const pushAndPublish = toolCallChain({ answers: APPROVE_GIT });
	const blocked = await pushAndPublish.bash("git push origin main && npm publish");
	assert.ok(blocked?.block, "a second confirmation the push does not cover still asks");
	assert.equal(pushAndPublish.prompts.length, 2);
	assert.match(pushAndPublish.prompts[1].title, /^Allow guarded actions/);
});

test("tool_call blocks commits and pushes in headless and child sessions with the stated reason", async () => {
	const headless = toolCallChain({ hasUI: false, answers: () => true });
	const headlessCommit = await headless.bash("git commit -m 'test'");
	assert.ok(headlessCommit?.block);
	assert.match(headlessCommit.reason ?? "", HEADLESS_REASON);
	assert.equal(headless.prompts.length, 0);

	const child = toolCallChain({ child: true, answers: () => true });
	const childPush = await child.bash("git push origin main");
	assert.ok(childPush?.block);
	assert.ok((childPush.reason ?? "").includes(CHILD_REASON));
	assert.equal(child.prompts.length, 0);
});

test("tool_call keeps the denylist and existing bash guards, and leaves plain text, cleanup and data arguments alone", async () => {
	const chain = toolCallChain({ answers: () => false });
	const catastrophic = await chain.bash("rm -rf /");
	assert.ok(catastrophic?.block);
	assert.match(catastrophic.reason ?? "", /gate-guard blocked/);
	const chmod = await chain.bash("chmod -R 777 build");
	assert.ok(chmod?.block);
	assert.equal(chain.prompts.length, 0, "the denylist answers without asking");

	assert.equal(await chain.bash('echo "git commit"'), undefined);
	assert.equal(await chain.bash('echo "rm -rf /"'), undefined, "quoted data is not a removal");
	assert.equal(await chain.bash("git status"), undefined);
	assert.equal(chain.prompts.length, 0);
	const cleanup = await chain.bash("rm -rf ./dist");
	assert.doesNotMatch(cleanup?.block ? cleanup.reason ?? "" : "", /gate-guard/, "rm -rf ./dist is not a denylisted form");
});

test("DROP TABLE reaches the data-loss confirmation, while DROP DATABASE stays denied", async () => {
	assert.equal(evaluateGateGuardDenylist("DROP TABLE users;"), undefined);
	assert.ok(evaluateGateGuardDenylist("DROP DATABASE prod;")?.block);
	const chain = toolCallChain({ answers: () => false });
	const dropTable = await chain.bash("psql -c 'DROP TABLE users'");
	assert.ok(dropTable?.block);
	assert.match(dropTable.reason ?? "", /not confirmed/);
	assert.equal(chain.prompts.length, 1);
	assert.equal(chain.prompts[0].title, "Allow recognized data-loss command?");
});
