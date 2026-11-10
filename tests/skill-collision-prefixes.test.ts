import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { __testing } from "../extensions/skill-registry.ts";

const repoRoot = join(import.meta.dirname, "..");

function readSkillName(dir: string): string | undefined {
	const source = readFileSync(join(repoRoot, "skills", dir, "SKILL.md"), "utf8");
	return __testing.parseFrontmatter(source).name;
}

const EXPECTED_SKILL_NAMES: Record<string, string> = {
	"clean-code": "clean-code",
	"comment-writer": "comment-writer",
	consensus: "consensus",
	delivery: "delivery",
	design: "gentle-design",
	"gentle-ui-design": "gentle-ui-design",
	"requesting-code-review": "requesting-code-review",
	testing: "testing",
	"tlc-spec-lean": "tlc-spec-lean",
	tomidev: "tomidev",
};

for (const [dir, expectedName] of Object.entries(EXPECTED_SKILL_NAMES)) {
	test(`skills/${dir}/SKILL.md frontmatter name matches`, () => {
		assert.equal(readSkillName(dir), expectedName);
	});
}

test("technical reference documents legacy skill-name compatibility aliases", () => {
	const readme = readFileSync(join(repoRoot, "docs", "readme-reference.md"), "utf8");
	for (const [legacyName, prefixedName] of [
		["branch-pr", "gentle-ai-branch-pr"],
		["judgment-day", "gentle-ai-judgment-day"],
		["skill-creator", "gentle-ai-skill-creator"],
	] as const) {
		assert.match(readme, new RegExp(`former package names such as[\\s\\S]*${legacyName}`));
		assert.match(readme, new RegExp(`runtime skill selection should use[\\s\\S]*${prefixedName}`));
	}
});
