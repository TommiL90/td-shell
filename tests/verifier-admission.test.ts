import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createGentleAiExtension } from "../extensions/gentle-ai.ts";
import { rejectUnriskedVerifierLaunch } from "../lib/verifier-admission.ts";

// odd/tasks/verifier-admission.md S2: a bench gate run launched `gentle-ai-verify` on a small, not high-risk task
// although the prompt's Verification rule reserves the independent verifier for a named high-risk item. The runtime
// now admits a primary-session verifier launch only with a `Risk: item N` line, a feature-document task, or a
// measured context at the backstop.

const quiet = { tokens: 20_000, contextWindow: 400_000 };

function workspace(withDocument: boolean): string {
	const root = mkdtempSync(join(tmpdir(), "verifier-admission-"));
	if (withDocument) {
		mkdirSync(join(root, "odd", "tasks"), { recursive: true });
		writeFileSync(join(root, "odd", "tasks", "ledger.md"), "# Ledger\n");
	}
	return root;
}

// gentle-shell#2478: the rejection must name the accepted declaration placement, so a caller whose risk sentence
// follows a separator like `; ` (the Andiveli report) learns the conforming form instead of guessing.
test("S5: the rejection names the accepted declaration placement", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	// The reported nonconforming envelope: the declaration follows `; `, which the grammar does not accept.
	const denied = rejectUnriskedVerifierLaunch(
		{ agent: "gentle-ai-verify", task: "Independent verification, read-only repository; Risk: item 2 (authorization tokens). Spec: odd/tasks/example.md, T2, S1-S3." },
		{ root, contextUsage: quiet },
	);
	assert.ok(denied?.block, "the `; `-separated declaration is not recognized");
	assert.match(denied.reason, /A supported `Risk: item N` declaration starts a line/);
	assert.match(denied.reason, /or a sentence \(after `\.`, `!` or `\?` and a space\)/);
	assert.match(denied.reason, /for example `Risk: item 2 \(authorization tokens\)`/);
	assert.match(denied.reason, /after another separator such as `; ` or `,` is not recognized/);
	assert.doesNotMatch(denied.reason, /claude|gpt|openai|anthropic|gemini|sonnet|opus/i, "the message stays generic");
});

test("S3/S4: a verifier launch without a high-risk line is rejected with an inline instruction", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const task of ["Verify the annual budget change.", "Verify it.\nRisk: none", "Verify it.\nRisk: none (local rename)"]) {
		const denied = rejectUnriskedVerifierLaunch({ agent: "gentle-ai-verify", task }, { root, contextUsage: quiet });
		assert.ok(denied?.block, `${JSON.stringify(task)} must be blocked`);
		assert.match(denied.reason, /independent verifier runs only for a change that declares a named high-risk item/);
		assert.match(denied.reason, /focused test and suite inline/);
		assert.match(denied.reason, /do not retry the launch/);
		assert.match(denied.reason, /never add a Risk line or create a feature document only to get a verifier admitted/);
		assert.doesNotMatch(denied.reason, /claude|gpt|openai|anthropic|gemini|sonnet|opus/i, "the message stays generic");
	}
});

test("S3: a Risk line naming a Task Size high-risk item admits the verifier", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const line of ["Risk: item 3 (shared parser)", "- Risk: item 2, item 3 (auth and parser)", "Risk: item 6", "  Risk:item 1"]) {
		assert.equal(rejectUnriskedVerifierLaunch({ agent: "gentle-ai-verify", task: `Verify the change.\n${line}\n` }, { root, contextUsage: quiet }), undefined, line);
	}
	const viaContext = { agent: "gentle-ai-verify", task: "Verify the change.", context: "Risk: item 4 (migration)" };
	assert.equal(rejectUnriskedVerifierLaunch(viaContext, { root, contextUsage: quiet }), undefined, "the context carries the line");
});

// gentle-shell-bench model-economy L9: a DeepSeek verifier launch was refused twice because its valid declaration
// opened a sentence mid-paragraph ("... on top of commit ebf3f35). Risk: item 1 (...)"), not a line.
test("S3: a Risk declaration that opens a sentence admits the verifier", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const task of [
		"Independently verify an ODD change on top of commit ebf3f35. Risk: item 1 (schema migration of stored data).",
		"Verify the parser change! Risk: item 3 (shared parser)",
		"Is the guard still sound? Risk: item 2",
	]) {
		assert.equal(rejectUnriskedVerifierLaunch({ agent: "gentle-ai-verify", task }, { root, contextUsage: quiet }), undefined, task);
	}
	for (const task of ["Verify it. Risk: none (local rename)", "Verify it. Do not write Risk: item 3 here.", "Verify it.Risk: item 3"]) {
		assert.ok(rejectUnriskedVerifierLaunch({ agent: "gentle-ai-verify", task }, { root, contextUsage: quiet })?.block, task);
	}
});

test("S3: an item outside 1-6, a Risk mention inside prose, or none first is rejected", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const line of ["Risk: item 7", "Risk: item 0", "Risk: item 12", "Do not write Risk: item 3 here.", "Risk: none; item 3 does not apply", "Risk: items"]) {
		assert.ok(rejectUnriskedVerifierLaunch({ agent: "gentle-ai-verify", task: `Verify it.\n${line}` }, { root, contextUsage: quiet })?.block, line);
	}
});

test("S3: a task of an existing feature document admits the verifier; a missing document does not", (t) => {
	const documented = workspace(true);
	const bare = workspace(false);
	t.after(() => { rmSync(documented, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true }); });
	const input = { agent: "gentle-ai-verify", task: 'Spec: odd/tasks/ledger.md (read until "## Log"). Verify T2; S3.' };
	assert.equal(rejectUnriskedVerifierLaunch(input, { root: documented, contextUsage: quiet }), undefined);
	assert.ok(rejectUnriskedVerifierLaunch(input, { root: bare, contextUsage: quiet })?.block, "a missing document does not admit");
});

test("S3: the measured context backstop admits the verifier", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const input = { agent: "gentle-ai-verify", task: "Verify the change." };
	assert.equal(rejectUnriskedVerifierLaunch(input, { root, contextUsage: { tokens: 150_000, contextWindow: 1_000_000 } }), undefined);
	assert.equal(rejectUnriskedVerifierLaunch(input, { root, contextUsage: { tokens: 19_200, contextWindow: 128_000 } }), undefined, "15% of a small window admits");
	assert.ok(rejectUnriskedVerifierLaunch(input, { root, contextUsage: { tokens: 149_999, contextWindow: 1_000_000 } })?.block);
	assert.ok(rejectUnriskedVerifierLaunch(input, { root, contextUsage: undefined })?.block, "missing context usage does not admit");
});

test("S5: other agents are not gated by the verifier admission", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const agent of ["gentle-ai-worker", "worker", "gentle-ai-explore", "jd-fix-agent", "jd-judge-a", "jd-judge-b", "review-risk", "verify"]) {
		assert.equal(rejectUnriskedVerifierLaunch({ agent, task: "Check src/budget.ts" }, { root, contextUsage: quiet }), undefined, agent);
	}
	for (const input of [undefined, null, "gentle-ai-verify", ["gentle-ai-verify"], { task: "Verify it." }]) {
		assert.equal(rejectUnriskedVerifierLaunch(input, { root, contextUsage: quiet }), undefined, JSON.stringify(input));
	}
});

type ToolCallHandler = (event: { toolName: string; input: unknown }, ctx: ExtensionContext) => Promise<{ block?: boolean; reason?: string } | undefined>;

function toolCallThroughHook(toolName: string, input: Record<string, unknown>, cwd: string, tokens: number, processEnv: NodeJS.ProcessEnv = {}) {
	const handlers = new Map<string, ToolCallHandler>();
	const pi = { on(name: string, handler: ToolCallHandler) { handlers.set(name, handler); }, events: { emit() {} }, registerCommand() {}, registerTool() {} } as unknown as ExtensionAPI;
	createGentleAiExtension({ nativeReviewCli: null, processEnv })(pi);
	return handlers.get("tool_call")!({ toolName, input }, {
		cwd, hasUI: false, ui: { confirm: async () => true },
		getContextUsage: () => ({ tokens, contextWindow: 272_000, percent: Math.round((tokens / 272_000) * 100) }),
	} as unknown as ExtensionContext);
}


test("S6: reference docs distinguish workflow verification from retired admission gates", () => {
	const docs = readFileSync(new URL("../docs/readme-reference.md", import.meta.url), "utf8");
	assert.match(docs, /Verifier handoffs identify the actual named risk and C# obligations/);
	assert.match(docs, /not legacy document-path or risk-declaration admission gates/);
	assert.match(docs, /Full Lean closure requires a fresh independent `gentle-ai-verify` PASS/);
});

// gentle-shell#2478: the strict placement grammar is unchanged by the diagnostics wording — a declaration after
// `; ` or `,` blocks, a line-start and a sentence-start declaration admit. Covers S2, S5.
test("S2/S5: placement grammar admits line/sentence starts and blocks other separators", (t) => {
	const root = workspace(false);
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const verdict = (task: string) => rejectUnriskedVerifierLaunch({ agent: "gentle-ai-verify", task }, { root, contextUsage: quiet })?.block === true;
	assert.equal(verdict("Independent verification, read-only repository; Risk: item 2 (authorization tokens)."), true, "`; ` is not a declaration start");
	assert.equal(verdict("Verification of the parser, Risk: item 2 (reason)."), true, "`,` is not a declaration start");
	assert.equal(verdict("Risk: item 2 (authorization tokens)\nVerify."), false, "line start admits");
	assert.equal(verdict("- Risk: item 2\nVerify."), false, "list marker admits");
	assert.equal(verdict("Deployed on top of ebf3f35. Risk: item 1 (migration)"), false, "sentence start admits");
	assert.equal(verdict("Risk: none\nVerify."), true, "`Risk: none` blocks");
	assert.equal(verdict("Spec: odd/tasks/missing.md"), true, "a missing feature document does not admit");
});

// gentle-shell#2478 S2-S4: the docs section states the strict grammar, the assessment≠admission split, and that the
// post-denial disposition is launch-scoped with no gate-level retry. Covers S2, S3, S4.
test("S2/S3/S4: delegated verification keeps actual risk, independent proof and human-controlled recovery", () => {
	const docs = readFileSync(new URL("../docs/delegated-verification.md", import.meta.url), "utf8");
	assert.match(docs, /Never invent a risk declaration just to obtain a verifier/);
	assert.match(docs, /writer's summary and the user's visual approval/);
	assert.match(docs, /Report missing proof, do not substitute another role or silently waive it/);
	assert.match(docs, /human can explicitly request one new bounded attempt/);
	assert.match(docs, /does not permit automatic retries, override a denial, bypass consent/);
});
