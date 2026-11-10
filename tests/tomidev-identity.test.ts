import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";

// S4: one fixed persona and the Tomidev Shell identity. The rendered primary
// prompt names no persona mode and no Gentle Shell label, and describes the
// adapted ODD workflow (three lanes, orchestrator plus subagents) instead of a
// plain "I run Organic Driven Development" self-description.
// S2: the authorized-work continuity block keeps only its essentials.

const REPO_ROOT = join(import.meta.dirname, "..");
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), "utf8");

const prompt = __testing.buildGentlePrompt();

const SELF_DESCRIPTION = 'I am Tomidev Shell: a Pi-specific coding-agent harness for controlled development, with a senior architect persona. I compose my builtin development mechanisms with the project\'s harness as orchestrator: I coordinate subagents, track substantial work using project conventions, run commands, and edit files. Where undefined, I use Organic Driven Development with Direct, Checks-only, or Full Lean defaults. I am not a generic chatbot.';

test("S4: the rendered prompt has one fixed persona and no persona mode line", () => {
	assert.equal(prompt.includes("Current persona mode"), false);
	assert.equal(prompt.includes("Gentle Shell prompt label"), false);
	assert.ok(prompt.includes("Tomidev Shell prompt label"), "phase reporting names the Tomidev Shell label");
});

test("S4: the self-description names the adapted lanes, orchestrator and subagents, not plain ODD", () => {
	assert.ok(prompt.includes(SELF_DESCRIPTION), "the identity bullet carries the adapted self-description");
	assert.equal(prompt.includes("I run Organic Driven Development, coordinate subagents"), false, "the plain ODD self-description is gone");
});

test("S4: package description and README identity read as Tomidev Shell with the MIT attribution kept", () => {
	const manifest = JSON.parse(read("package.json")) as { description?: string };
	assert.match(manifest.description ?? "", /Tomidev Shell/);
	assert.doesNotMatch(manifest.description ?? "", /el Gentleman/);
	assert.match(manifest.description ?? "", /ODD|Organic Driven Development/);
	assert.doesNotMatch(manifest.description ?? "", /native review/i);
	const readme = read("README.md");
	assert.doesNotMatch(readme, /el Gentleman/, "README must not call the product el Gentleman");
	assert.match(readme, /Forked from \[gentle-shell\]/, "the gentle-shell fork attribution stays");
	assert.match(readme, /MIT License/, "the MIT license attribution stays");
});

test("S2: the continuity block keeps its essentials and drops native-review and consent weight", () => {
	const start = prompt.indexOf("## Authorized work continuity");
	const end = prompt.indexOf("## Project harness composition", start);
	assert.ok(start >= 0 && end > start, "continuity block is delivered before the ODD steps");
	const block = prompt.slice(start, end);
	for (const clause of [
		"Continue authorized in-scope implementation, documentation, and verification steps without asking the human to approve each transition.",
		"A progress update is not a request for permission.",
		"Stop only for an unresolved consequential scope or product decision, required consent, a denied action, missing required proof (it blocks completion and delivery), or the human's explicit stop.",
		"Do not infer permission for publishing (push, pull request, release), commits, destructive actions, or unrelated scope",
	]) assert.ok(block.includes(clause), `continuity block is missing: ${clause}`);
	assert.doesNotMatch(block, /native|provider|review|verifier|RDD|gentle_review/i, "continuity block carries no review or native-authority weight");
	assert.ok(Buffer.byteLength(block, "utf8") <= 1_400, `continuity block is ${Buffer.byteLength(block, "utf8")} B, over its 1,400 B essentials budget`);
});
