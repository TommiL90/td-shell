import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const path of ["extensions/gentle-guide.ts", "lib/gentle-guide.ts", "tests/gentle-guide.test.ts"]) {
	test(`retired tour asset is absent: ${path}`, () => {
		assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must be removed; extensions are directory-discovered`);
	});
}

test("product explanations remain discoverable without tour instructions", () => {
	const shell = read("docs/gentle-shell.md");
	const reference = read("docs/readme-reference.md");
	assert.match(shell, /### Finding help/);
	assert.match(shell, /readme-reference\.md#everyday-capabilities/);
	const section = reference.split("## Everyday capabilities\n")[1]?.split("\n## ")[0] ?? "";
	for (const term of ["prompt", "/td:commands", "Keymaps", "/td:profiles", "/td:agents", "task list", "/td:jobs", "/td:changes", "/td:design", "/td:voice", "/td:music", "/td:customize", "/td:yolo", "gentle-engram", "/td:usage", "/td:stats", "/td:doctor", "/td:status"]) {
		assert.ok(section.includes(term), `everyday capabilities missing ${term}`);
	}
	for (const path of ["README.md", "docs/gentle-shell.md", "docs/readme-reference.md", "lib/command-palette-catalog.ts", "extensions/startup-banner.ts"]) {
		assert.doesNotMatch(read(path), /td:guide|gentle_guide|gentle-guide|guided tour/i, `${path} must not advertise the retired tour`);
	}
});
