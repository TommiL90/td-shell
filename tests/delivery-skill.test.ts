import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const skill = readFileSync(join(import.meta.dirname, "..", "skills/delivery/SKILL.md"), "utf8");

test("delivery skill strictly forbids automatic commit and push", () => {
	assert.match(skill, /(?:Never|do not).*commit.*push.*automatically/i);
	assert.match(skill, /explicitly requests it in the current turn/i);
	assert.match(skill, /Never push to upstream/i);
});

test("delivery skill requires work-unit commit slicing and Conventional Commits", () => {
	assert.match(skill, /deliverable work unit/i);
	assert.match(skill, /tests and docs.*with code/i);
	assert.match(skill, /Conventional Commits/i);
});

test("delivery skill defines PR format with Risk, checks and verification", () => {
	assert.match(skill, /## Risk/);
	assert.match(skill, /Risk: \[Direct \| Bounded \| Sensitive\]/);
	assert.match(skill, /## Checks & Verification/);
	assert.match(skill, /## Evidence/);
});

test("delivery skill bounds split recommendation to diffs > 400 lines and independent units", () => {
	assert.match(skill, /`diff_budget` reports >400 production lines and >=2 independent units/);
	assert.match(skill, /usually after code review/);
	assert.match(skill, /one concise recommendation line, not a strategy menu or automatic chain/);
	assert.doesNotMatch(skill, /\bSDD\b|OpenSpec/i);
});
