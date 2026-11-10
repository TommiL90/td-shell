import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Instruction-delivery contracts, not claims that a model follows the instructions.
test("T14 S1/S12: primary instructions compose with project-owned workflow and artifacts", () => {
	const source = read("extensions/gentle-ai.ts");
	assert.match(source, /Project owns workflow and lane names, plan\/check formats and paths, tracking, acceptance criteria, and delivery/);
	assert.match(source, /Do not create duplicate artifacts, parallel tracking, or a competing lane or delivery policy/);
	assert.doesNotMatch(source, /Every request enters it|Run these steps in this order on every request/);
	assert.match(source, /Respect explicit incompatible project rules; clarify only unresolved conflicts/);
});

test("T14 S5/S6/S12: judges review the same project plan before execution even without repo judges", () => {
	for (const path of ["extensions/gentle-ai.ts", "assets/orchestrator-verification.md", "skills/consensus/SKILL.md", "skills/tomidev/SKILL.md"]) {
		const text = read(path);
		assert.match(text, /same project (?:plan|artifact)/, path);
		assert.match(text, /even (?:when|if) (?:the )?(?:repo|project).*does not (?:mention|define).*judges/, path);
		assert.match(text, /before (?:delegating )?(?:implementation|execution)/, path);
		assert.match(text, /3 rounds/, path);
		assert.match(text, /ask the user/, path);
	}
});

test("T14 S1/S13: defaults fill gaps, trivial work gets no new plan, no adapter architecture", () => {
	for (const path of ["assets/orchestrator.md", "skills/tomidev/SKILL.md", "skills/consensus/SKILL.md"]) {
		const text = read(path);
		assert.match(text, /defaults.*(?:undefined|gaps)/i, path);
		assert.match(text, /[Tt]rivial.*no (?:new )?plan/, path);
	}
	assert.match(read("extensions/gentle-ai.ts"), /No new adapter or configuration file/);
});

test("T14 S1/S12: tracking and memory do not impose a second project contract", () => {
	for (const path of ["assets/orchestrator-memory.md", "assets/orchestrator-tracking.md", "assets/orchestrator-delegation.md", "assets/orchestrator-full-delegation.md"]) {
		const text = read(path);
		assert.match(text, /[Pp]roject.*(?:tracking|workflow).*authority/, path);
		assert.match(text, /(?:Do not|Never) (?:force|create|require).*?(?:Engram|duplicate|parallel)/, path);
	}
});

test("T14 S5: builtin agents accept project formats without granting extra edit rights", () => {
	for (const role of ["gentle-ai-explore", "gentle-ai-worker", "gentle-ai-verify", "jd-judge-a", "jd-judge-b"]) {
		assert.match(read(`assets/agents/${role}.md`), /project-owned artifacts.*formats/, role);
	}
	const worker = read("assets/agents/gentle-ai-worker.md");
	assert.match(worker, /Project artifacts outside that default directory require explicit Allowed edit surfaces/);
	assert.match(worker, /Never stage, commit, push, publish, release, or delegate/);
});

test("T14 S1: Lean integration does not rewrite its selected schema or validators", () => {
	assert.match(read("skills/tlc-spec-lean/SKILL.md"), /When this skill is selected/);
	assert.match(read("skills/tlc-spec-lean/SKILL.md"), /Do not impose this schema or its validators on a different project workflow/);
});
