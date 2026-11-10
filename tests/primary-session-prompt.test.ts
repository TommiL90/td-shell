import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";

// gentle-ai R3 (odd/tasks/pi-routing-from-bundle.md): the harness ODD step
// lines 1-7, the phase-reporting line, and the resume line come from the
// mirrored provider contract bundle's routing/pi.md instead of a hand-copied
// literal, and the rendered primary-session prompt stays byte-identical.
//
// The golden was captured from the base commit (main 4372ff2d, after R1) before the steps moved into the
// bundle, with the inputs below and the package assets root normalized. When a
// prompt change is intended, regenerate it with
// UPDATE_PRIMARY_SESSION_PROMPT_GOLDEN=1 and review the golden diff.

const REPO_ROOT = join(import.meta.dirname, "..");
const GOLDEN_PATH = join(REPO_ROOT, "tests", "fixtures", "primary-session-prompt", "gentleman.golden.md");
const ACTIVE_TOOLS = ["read", "bash", "edit", "write", "subagent_run"] as const;
const MIRROR_ROOT = join(REPO_ROOT, "contracts", "review-provider-contract-mirror");

let scratch: string;
const previousEnvironment = new Map<string, string | undefined>();
before(() => {
	scratch = mkdtempSync(join(tmpdir(), "gentle-pi-primary-prompt-"));
	for (const key of ["TOMIDEV_CONFIG_HOME", "TOMIDEV_BACKGROUND_SUBAGENTS"]) previousEnvironment.set(key, process.env[key]);
	process.env.TOMIDEV_CONFIG_HOME = join(scratch, "config");
	delete process.env.TOMIDEV_BACKGROUND_SUBAGENTS;
});
after(() => {
	for (const [key, value] of previousEnvironment) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

function renderPrimaryPrompt(): string {
	const prompt = __testing.buildGentlePrompt(join(scratch, "project"), ACTIVE_TOOLS);
	return prompt.replaceAll(join(REPO_ROOT, "assets"), "{{TOMIDEV_ASSETS_ROOT}}");
}

test("the rendered primary-session prompt is byte-identical to the golden captured from the base", () => {
	const rendered = renderPrimaryPrompt();
	if (process.env.UPDATE_PRIMARY_SESSION_PROMPT_GOLDEN === "1") writeFileSync(GOLDEN_PATH, rendered, "utf8");
	assert.equal(rendered, readFileSync(GOLDEN_PATH, "utf8"));
});

test("T14: composition reaches both delivered workflow modes without competing tracking", () => {
	for (const mode of ["organic", "full-delegation"] as const) {
		const prompt = __testing.buildGentlePrompt(join(scratch, "project"), ACTIVE_TOOLS, undefined, mode);
		for (const clause of [
			"Project owns workflow and lane names, plan/check formats and paths, tracking, acceptance criteria, and delivery",
			"Do not create duplicate artifacts, parallel tracking, or a competing lane or delivery policy",
			"same project plan before execution, even when the project does not define plan judges",
			"After at most 3 rounds without consensus, stop and ask the user",
			"trivial/direct work needs no new plan or judge loop",
			"Respect explicit incompatible project rules; clarify only unresolved conflicts",
		]) assert.ok(prompt.includes(clause), `${mode}: ${clause}`);
		assert.doesNotMatch(prompt, /Every request enters it|Run these steps in this order on every request/);
	}
});

// Issue #2935: the confinement clause must deliver the resolved-skill-read
// exception in every mode without loosening the rest of the boundary.
test("Safety clause allows the task's exact resolved skill reads in every mode without new write rights", () => {
	const line = renderPrimaryPrompt().split("\n").find(candidate => candidate.startsWith("- Keep session work inside the project root"));
	assert.ok(line, "confinement clause is delivered");
	for (const clause of [
		"reading the task's exact resolved skill files needs no per-file question in any mode",
		"Grants are per-target, per-session, never blanket: in-project scripts naming outside paths are not standing consent",
		"ask before any read or write outside it, naming the absolute path",
		"registered same-clone worktrees",
	]) assert.ok(line.includes(clause), `missing delivered clause: ${clause}`);
});
