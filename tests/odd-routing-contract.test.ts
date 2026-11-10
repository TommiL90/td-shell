import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";
import { readDelegationDetail } from "./support/orchestrator-modules.ts";

// These are instruction-delivery contracts, not proof of autonomous model adherence.
const read = (path: string) => readFileSync(join(import.meta.dirname, "..", path), "utf8");
const core = read("assets/orchestrator.md");
const delegation = readDelegationDetail();
const memory = read("assets/orchestrator-memory.md");
// The harness as rendered by extensions/gentle-ai.ts, including the ODD steps
// it takes from the mirrored provider bundle's routing/pi.md.
const wrapper = __testing.buildGentlePrompt();

function containsAll(text: string, clauses: readonly string[]): void {
	for (const clause of clauses) assert.ok(text.includes(clause), `missing contract: ${clause}`);
}

test("organic entry stays read-only without authorization and loads detail before work", () => {
	containsAll(core, [
		"large tasks get ODD tracking and workers only by the Writer rule, else inline",
		"orchestrator-delegation.md",
		"orchestrator-memory.md",
	]);
	// S11 T3: deduplicated. The core's "ODD (Default Workflow, harness section
	// above) is mandatory on every request" pointer restated the harness; the
	// mandatory workflow and its detail pointers are stated once in the harness.
	containsAll(wrapper, [
		"Default workflow: Organic Driven Development (fallback)",
		"Use these useful defaults only for aspects the project leaves undefined",
		"Detail for steps 3–7: `orchestrator-delegation.md` and `orchestrator-memory.md`.",
	]);
	containsAll(delegation, [
		"Investigation, explanation, review, comparison, and proposal-only requests remain read-only",
		"without a task or storage permission prompt",
		"small work creates no durable task artifacts",
	]);
	assert.doesNotMatch(core + wrapper, /Prefer SDD\/OpenSpec artifacts|Substantial feature: suggest SDD organically/);
	assert.doesNotMatch(core + delegation, /Suggest it when proposal\/spec\/design\/tasks|propose SDD only when durable proposal\/spec\/design\/tasks/);
});

test("research uses adaptive evidence gathering and existing general workers only", () => {
	containsAll(delegation, [
		"problem, intended outcome, constraints, and current evidence",
		"no fixed questionnaire or mandatory rounds",
		"one focused user question",
		"stop and wait",
		"workers return gaps to the parent",
		"available authorized documentation/web tools",
		"prefer primary sources",
		"URLs or code locations",
		"verified facts, assumptions, contradictions, freshness, and gaps",
		"recommendation, tradeoffs, open questions, and implementation implications",
		"Forward these research instructions",
		"existing fresh general exploration/research worker",
		"do not create a specialized agent or create a new workflow",
		"no new persistence or readiness machinery",
	]);
});

test("task sizing is explicitly advisory and forwarded without cosmetic savings", () => {
	containsAll(delegation, [
		"about 400 authored changed lines",
		"additions plus deletions",
		"not a task acceptance criterion, hard cap, counter-trigger, automatic stop, or forced split",
		"Forward this same advisory-only instruction",
		"Never delete spaces, blank lines, or comments",
		"never omit tests, minify, add gratuitous abstractions, or split artificially",
		"Existing PR size gates remain unchanged",
	]);
});

test("organic progress preserves both complete feature copies and reconciles actual evidence", () => {
	containsAll(memory, [
		".agents/designs/features/<feature-name>/",
		"features/<feature-name>/state",
		"stable task IDs",
		"full current document",
		"repository-relative file locator",
		"preserve valid completed and unrelated work",
		"reopen invalidated items",
		"Check off only observed outcomes",
		"Read back both writes",
		"not atomic",
		"mirror pending",
		"Preserve both versions",
		"mem_context",
		"mem_search",
		"mem_get_observation",
		"read the actual task file",
		"not a third authority",
		"create or rebuild the visible `todo` list",
		"before the first source write",
		"after every task transition and material plan change",
	]);
	assert.doesNotMatch(memory, /`todo` tool is an optional session\/UI projection/);
});

test("assumption challenge and task checks do not activate or duplicate code review", () => {
	containsAll(delegation, [
		"at most one scoped independent read-only assumption challenge",
		"high-consequence unproven premise",
		"Deterministic failures need fixes",
		"Run applicable functional checks per task; a TODO checkbox never triggers a review or verifier run.",
		"Code review (`requesting-code-review`) runs only on explicit request or at the final checkpoint",
		"Checklists grant no approval and never skip an existing delivery gate.",
	]);
});

// S2/S11: never commit without an explicit ask in the turn.
const S2_COMMIT_SENTENCE =
	"Never stage, commit, or push unless explicitly requested by the user in the current turn. When commit is explicitly requested, run `.agents/scripts/private_harness_guard.py --root .` before committing if the script is present.";

test("S2/S11: the rendered parent prompt enforces no commits without explicit request", () => {
	for (const persona of ["gentleman", "neutral"] as const) {
		const prompt = __testing.buildGentlePrompt();
		assert.ok(prompt.includes(S2_COMMIT_SENTENCE), `[${persona}] the parent prompt must carry the S2 commit sentence`);
	}
});

test("ODD enforces no commits without explicit request in core Safety", () => {
	assert.ok(
		core.includes("- Never stage, commit, or push unless explicitly requested by the user in the current turn."),
		"core Safety must block commits without an explicit ask",
	);
});

test("delivery instructions defer to the delivery skill without a strategy menu", () => {
	for (const text of [delegation, read("docs/readme-reference.md")]) {
		containsAll(text, ["`delivery` skill", "only when asked, usually after code review", "`diff_budget` reports >400 production lines and >=2 independent units"]);
		assert.doesNotMatch(text, /delivery_strategy=|chain_strategy=/);
	}
});

test("user documentation shows recovery and independent verification without claiming model proof", () => {
	const docs = read("docs/readme-reference.md");
	containsAll(docs, [
		"## Organic Driven Development",
		"```mermaid",
		"Full feature memory and actual task file",
		"Independent verification by lane and named risk",
		"advisory",
		"Static prompt tests",
		"autonomous",
	]);
	assert.ok(read("README.md").includes("#organic-driven-development"));
});


test("one feature document carries intent, accepted rationale and worker context", () => {
	containsAll(memory, [
		"one feature directory, not a separate plan file or topic",
		"verification evidence, progress, and next step",
		"rationale for meaningful accepted changes",
		"Routine corrections stay brief; no exhaustive decision journal",
		"Accepted user, review, or verification changes",
		"automatically update affected intent and TODOs",
		"add genuinely new tasks or reopen invalidated items with a reason",
		"Findings alone never authorize scope expansion or automatic acceptance",
		"Before implementation or resume, the parent reads both the actual file and full observation",
	]);
	containsAll(read("assets/agents/gentle-ai-worker.md"), [
		".agents/designs/features/<feature>/",
		"Preserve every unrelated tracked or untracked file",
	]);
});

// gentle-shell#1713: handoffs paraphrased the user's request, the feature
// document summarized it, and verify never saw it. The document is now the
// specification subagents read by reference, in a fixed token-cheap order.
test("feature document is the verbatim specification subagents read by reference", () => {
	const always = [
		"`## Specs`",
		"`## Tasks`",
		"`## Log`",
		"exact strings, error messages, and examples verbatim",
		"`L1` is the user's original request verbatim",
		"rewrites only the affected `S#`, and reopens only its task",
		"Hand off by reference, never by paraphrase",
		"read until `## Log`",
		"Without a feature document, include the user's request verbatim",
		"a verdict per `S#`",
		"reproduce it before deciding it already works",
	];
	for (const persona of ["gentleman", "neutral"] as const) {
		const prompt = __testing.buildGentlePrompt();
		containsAll(prompt, [...always,
			// Parity with the gentle-ai canon (gentle-ai#5215).
			"tell workers to read until `## Log`",
			"runs the spec's examples the parent authorized, against isolated state when they mutate data",
		]);
		assert.doesNotMatch(prompt, /\(read until \\?`## Log\\?`\)\. Do T#/, "inline code spans cannot nest backticks");
	}
	containsAll(memory, [
		"specification subagents read by reference",
		"stable content first and the growing log last",
		"never summarize or reword those fragments",
		"Do not add requirements the user never asked for",
		"`L1` holds the user's original request verbatim",
		"rewrites only the affected `S#`, and reopens only its linked task",
	]);
	assert.doesNotMatch(delegation, /Translate the user's request into concise English/);
	containsAll(delegation, [
		"never translate, condense, or paraphrase the user's requirements",
		"Reproduce a user-reported failure",
	]);
	containsAll(read("assets/agents/gentle-ai-worker.md"), [".agents/designs/features/", "plan.md", "checks.md", "which check items the change covers"]);
	containsAll(read("assets/agents/gentle-ai-verify.md"), [
		"execute only exact test, build, lint, or spec example commands explicitly authorized by the parent",
		"project-owned artifacts in their existing formats and paths",
		"return a verdict per project acceptance ID with evidence",
		"Project workflow, criteria and delivery gates are authoritative",
		"do not require builtin lanes, duplicate plans/checks or Engram tracking",
		"When the builtin feature contract is selected, read all of its `plan.md`/`checks.md` or feature document, including verbatim entries in `## Log`, and use `S#`/`C#` IDs",
		"compare the exact output and error text",
		"isolated state",
	]);
	containsAll(read("assets/agents/gentle-ai-explore.md"), [
		"project-owned artifacts in their existing formats and paths",
		"Use the project's acceptance IDs and workflow",
		"do not require builtin lanes, `plan.md`, `checks.md`, or Engram tracking",
		"When the builtin feature contract is selected or the project leaves artifact conventions undefined, read the supplied `.agents/designs/features/<feature>/` artifacts (`plan.md`, `checks.md`) for requirements and context",
	]);
});

test("ODD defaults to applicable test-first without chat or TUI activation", () => {
	const worker = read("assets/agents/gentle-ai-worker.md");
	const verify = read("assets/agents/gentle-ai-verify.md");
	const support = read("assets/support/strict-tdd.md") + read("assets/support/strict-tdd-verify.md");
	// S11 T3: deduplicated. The core sits after the harness in the same system
	// prompt; its pointer sentence restated the harness test-first policy, so the
	// rendered parent prompt (harness + core) now carries that policy exactly
	// once, from the harness, instead of the core carrying its own copy.
	const rendered = __testing.buildGentlePrompt();
	for (const text of [rendered, delegation, worker, verify, support, wrapper]) {
		containsAll(text, ["applicable", "RED", "GREEN"]);
		assert.doesNotMatch(text, /(?:configured TDD mode|Strict TDD Mode is enabled|explicit user choice|test presence does not enable it|tests existing does not activate it)/i);
	}
	assert.equal(rendered.split("use test-first by default").length - 1, 1, "the parent prompt states the test-first policy once");
	assert.ok(!core.includes("GREEN"), "core restates the harness test-first policy");
	for (const [actor, text] of [["delegation", delegation], ["extension", wrapper]] as const) {
		assert.match(text, /behavior changes with applicable runnable deterministic tests and a clear expected outcome/i, `${actor} must require applicability, not test presence`);
		assert.match(text, /passive documentation/i, `${actor} must handle passive docs`);
		assert.match(text, /unavailable runner/i, `${actor} must handle unavailable runners`);
		assert.match(text, /ordinary functional or structural verification/i, `${actor} must specify fallback checks`);
	}
	containsAll(delegation, ["by default", "Forward this policy"]);
	containsAll(worker, ["before implementation", "ordinary functional or structural verification", "no meaningful RED"]);
	containsAll(verify, ["observed RED", "observed GREEN", "exception"]);
	assert.doesNotMatch(core + delegation + worker + support + wrapper, /If tests exist, use strict TDD/i);
});

// S9 canon change (gentle-ai 87a3b2eb): "These triggers are mandatory, not
// advisory." read as a default to delegate (L8). A trigger is mandatory only
// once its condition truly holds; none holds by default, inline when in doubt.
test("delegation triggers are behavioral in the lazy canonical port and the always-on ODD step", () => {
	for (const clause of [
		"Each trigger holds only when its condition truly holds; none holds by default. Inline stays within the evidence budget.",
		"stop and delegate through the runtime's subagent mechanism before continuing",
		"executing past a fired trigger inline is a routing defect even if the work succeeds",
		"**Mapping trigger",
		"**Writer trigger",
		"**Preparation trigger:**",
		"**Context backstop:**",
		"pause and delegate the next bounded unit of work",
		"**Route declaration:**",
		"record the chosen route per task",
		"so skipped delegation is observable instead of silent",
		"These triggers only choose between direct inline and delegated direct inside ODD",
	]) {
		assert.ok(delegation.includes(clause), `lazy canonical port is missing delegation clause: ${clause}`);
	}
	assert.ok(!delegation.includes("These triggers are mandatory, not advisory"), "the lazy port must not read the triggers as mandatory by default");
	assert.ok(
		wrapper.includes("honoring its delegation triggers when their conditions truly hold"),
		"the always-on ODD step 6 must honor its delegation triggers only when their conditions truly hold",
	);
	assert.ok(wrapper.includes("No trigger holds by default and, when in doubt, work inline"), "the always-on ODD step 6 must default to inline");
	assert.ok(!wrapper.includes("These triggers are mandatory, not advisory"), "the always-on ODD step 6 must not read the triggers as mandatory by default");
	assert.ok(
		wrapper.includes("executing past a fired trigger inline is a routing defect"),
		"the always-on ODD protocol must state that skipping a fired trigger is a routing defect",
	);
});

test("core and lazy canonical trigger lists agree in numbering and semantics", () => {
	for (const entry of [
		"1. **Ask**",
		"2. **Evidence-budget rule**",
		"3. **Verification rule**",
		"4. **Track**",
		"5. **Writer rule**",
		"6. **Incident rule**",
		"7. **Context backstop**",
	]) {
		assert.ok(core.includes(entry), `always-on core trigger list is missing: ${entry}`);
	}
	for (const entry of [
		"1. **Ask:**",
		"2. **Mapping trigger (Evidence-budget rule):**",
		"3. **Verification rule**",
		"4. **Track:**",
		"5. **Writer trigger (Writer rule):**",
		"6. **Incident rule:**",
		"7. **Context backstop:**",
	]) {
		assert.ok(delegation.includes(entry), `lazy canonical trigger list is missing: ${entry}`);
	}
	for (const stale of [
		"**Bounded read rule**",
		"**Write rule**",
		"**Context rule**",
		"**Per-action rule**",
	]) {
		assert.ok(!delegation.includes(stale), `reconciled canonical list retains stale trigger framing: ${stale}`);
	}
});

// Evidence-budget rule (gentle-shell#1587, measured in gentle-ai#5139): every
// routing surface states the same numbers, and the retired file-count and
// tool-call triggers are gone from all of them.
test("evidence-budget numbers agree across routing surfaces and retired triggers are gone", () => {
	const surfaces: Record<string, string> = {
		"assets/orchestrator.md": core,
		"assets/orchestrator-delegation.md": delegation,
	};
	for (const [path, text] of Object.entries(surfaces)) {
		containsAll(text, [
			"**Evidence-budget rule**",
			"at most 3 calls",
			"~10k tokens",
			"at most ~2k tokens",
			"`path:line`",
			"Context backstop",
		]);
		assert.doesNotMatch(text, /4-file rule|20 tool calls|5 exploratory (?:file )?reads/, `${path} keeps a retired trigger`);
	}
	for (const agent of ["assets/agents/gentle-ai-explore.md", "assets/agents/gentle-ai-verify.md"]) {
		containsAll(read(agent), ["at most ~2k tokens", "`path:line`"]);
	}
});

// Harness roadmap R1: the backstop is a measured runtime signal (min(absolute cap, fraction x window)), so the
// prompt modules stop stating a fixed token count and only a unit needing several steps is worth delegating.
test("context backstop prompt text defers to the runtime signal instead of a fixed token count", () => {
	const reference = read("assets/orchestrator-delegation-reference.md");
	for (const [path, text] of Object.entries({ "assets/orchestrator.md": core, "assets/orchestrator-delegation.md": read("assets/orchestrator-delegation.md"), "assets/orchestrator-delegation-reference.md": reference })) {
		assert.doesNotMatch(text, /~?150k tokens/, `${path} still states a fixed backstop`);
		assert.match(text, /\*\*Context backstop(?::\*\*|\*\*:?)[^\n]*when the runtime signals/, `${path} must defer to the runtime signal`);
		assert.ok(text.includes("several steps"), `${path} must say only a unit needing several steps is delegated`);
	}
	const docs = read("docs/readme-reference.md");
	containsAll(docs, ["TOMIDEV_CONTEXT_BACKSTOP_TOKENS", "TOMIDEV_CONTEXT_BACKSTOP_FRACTION", "min(", "`getContextUsage()`", "re-armed"]);
	assert.doesNotMatch(docs, /~150k tokens|150,000-token context backstop/, "docs still describe the fixed backstop");
});

test("ODD fallback remains delivered after project composition without a mandatory second workflow", () => {
	const orderedClauses = [
		"## Project harness composition",
		"Project owns workflow and lane names",
		"Default workflow: Organic Driven Development (fallback)",
		"1. **Authorize.**",
		"2. **Explore.**",
		"3. **Resolve uncertainty.**",
		"4. **Classify.**",
		"Size the task by the orchestrator's Task Size section",
		"5. **Track before the first write.**",
		"create or rebuild the visible `todo` list from the reconciled feature tasks",
		"Tell the user in one line which feature directory was created and how many tasks it holds",
		"6. **Implement task by task.**",
		"7. **Close.**",
		"call `gentle_odd_phase` only when the primary session's ODD phase actually changes",
		"Harness principles:",
		"# Tomidev Shell Orchestrator",
	];
	for (const persona of ["gentleman", "neutral"] as const) {
		const prompt = __testing.buildGentlePrompt();
		let cursor = -1;
		for (const clause of orderedClauses) {
			const index = prompt.indexOf(clause);
			assert.ok(index !== -1, `[${persona}] missing contract: ${clause}`);
			assert.ok(
				index > cursor,
				`[${persona}] clause out of order (must appear after the previous one): ${clause}`,
			);
			cursor = index;
		}
	}

	// S11 T3: deduplicated. The harness principle and the core pointer sentence
	// both restated the mandatory workflow; the steps' own header (asserted in
	// order above as "predefined workflow of this orchestrator") is the one statement.
	for (const persona of ["gentleman", "neutral"] as const) {
		const prompt = __testing.buildGentlePrompt();
		assert.equal(prompt.split("Default workflow: Organic Driven Development (fallback)").length - 1, 1, `[${persona}] the fallback is declared once`);
		assert.doesNotMatch(prompt, /Every request enters it|is the predefined workflow/);
		assert.ok(!prompt.includes("ODD (Default Workflow, harness section above)"), `[${persona}] the core restates the ODD workflow`);
	}
	containsAll(core, ["orchestrator-delegation.md", "orchestrator-memory.md"]);
	assert.doesNotMatch(core + delegation + memory, /SDD|sdd-|OpenSpec|openspec/i);
});

// Delivery follows work units: the chaining text points at the delivery skill, never at the retired skills.
test("delivery guidance names the delivery skill and no retired chaining skill", () => {
	const tracking = readFileSync(join(import.meta.dirname, "..", "assets", "orchestrator-tracking.md"), "utf8");
	assert.ok(tracking.includes("Resolve the `delivery` skill by registry name"), "tracking must resolve the delivery skill by name");
	assert.doesNotMatch(tracking, /work-unit-commits|chained-pr|native review|RDD/, "tracking must not name retired skills or review mechanics");
});
