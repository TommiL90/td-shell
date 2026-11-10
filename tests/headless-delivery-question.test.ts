import assert from "node:assert/strict";
import test from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";
import { readFileSync } from "node:fs";

for (const mode of ["tui", "rpc", "print", "json", undefined]) {
	test(`S2/T11: ${String(mode)} never selects a delivery strategy or authorizes commits`, () => {
		const prompt = __testing.buildGentlePrompt(process.cwd(), undefined, mode);
		assert.doesNotMatch(prompt, /ask-on-risk|auto-chain|\bsingle-pr\b|exception-ok|feature-branch-chain|stacked-to-main|size:exception/);
		assert.match(prompt, /Never stage, commit, or push unless explicitly requested by the user in the current turn/);
	});
}

test("S2/T11: delivery guidance recommends a split only from the measured budget and independent units", () => {
	for (const path of ["assets/orchestrator-tracking.md", "docs/readme-reference.md"]) {
		const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
		assert.doesNotMatch(source, /ask-on-risk|auto-chain|\bsingle-pr\b|exception-ok|size:exception/);
		assert.match(source, /diff_budget/);
		assert.match(source, />400 production lines/);
		assert.match(source, />=2 independent units/);
		assert.match(source, /only when asked, usually after code review/);
	}
});
