import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readDelegationDetail } from "./support/orchestrator-modules.ts";

// The Gentle AI provider defect handoff (the review-integration consent envelope,
// its GitHub reporting, and its decline invocation) belonged to the gentle-ai
// binary that the RDD removal retired. The orchestrator assets must not carry it,
// and the generic blocking-prompt contract that other prompts rely on must remain.

const REPO_ROOT = join(import.meta.dirname, "..");
const PROMPTS = readFileSync(join(REPO_ROOT, "assets", "orchestrator-prompts.md"), "utf8");
const DELEGATION = readDelegationDetail();

const RETIRED_HANDOFF_CLAUSES = [
	"Provider Defect Handoff",
	"review-integration",
	"consent/v3",
	"review mode disable",
	"decline invocation",
	"Gentleman-Programming/gentle-ai",
];

test("the Gentle AI provider defect handoff and its consent envelope are retired", () => {
	for (const [label, text] of [["orchestrator-prompts.md", PROMPTS], ["delegation detail", DELEGATION]] as const) {
		for (const retired of RETIRED_HANDOFF_CLAUSES) assert.equal(text.includes(retired), false, `${label} still carries: ${retired}`);
	}
});

test("blocking prompts keep the lossless envelope, closed-answer, and fallback contract", () => {
	assert.match(PROMPTS, /### Lossless Blocking Prompts \(MANDATORY\)/);
	assert.match(PROMPTS, /Fallback: If a native UI is unavailable/);
	assert.match(PROMPTS, /Answer validation: Accept an answer only when each response belongs to the exact allowed-answer domain/);
});
