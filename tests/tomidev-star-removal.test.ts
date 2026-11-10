import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { requiredPaths } from "../scripts/verify-package-files.mjs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const path of ["extensions/gentle-star-prompt.ts", "lib/star-prompt.ts", "tests/star-prompt.test.ts", "docs/star-prompt.md"]) {
	test(`retired star solicitation asset is absent: ${path}`, () => {
		assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must be removed; extensions are directory-discovered`);
	});
}

test("package inventory no longer requires star solicitation resources", () => {
	assert.deepEqual(requiredPaths.filter((path: string) => /star-prompt/.test(path)), []);
	// Removing the dedicated feature must not retire unrelated integrated capabilities.
	for (const path of ["extensions/gentle-notifications.ts", "extensions/gentle-voice.ts", "extensions/gentle-design.ts"]) {
		assert.ok(requiredPaths.includes(path), `${path} remains required`);
	}
});

test("schema compatibility coverage no longer imports or exercises the retired star store", () => {
	const source = read("tests/schema-id-compat.test.ts");
	assert.doesNotMatch(source, /star-prompt|StarPrompt/);
	for (const schema of ["voice-settings", "animations", "notifications", "background-subagents"]) {
		assert.ok(source.includes(`tomidev.${schema}/v1`), `${schema} coverage remains`);
	}
});

test("current product docs do not solicit stars or advertise the retired integration", () => {
	for (const path of ["README.md", "docs/readme-reference.md", "docs/gentle-shell.md"]) {
		assert.doesNotMatch(read(path), /star-prompt|gentle-star\b|stargazers|\bstar\b[^\n]*(?:GitHub|repositor|Tomidev|gentle-shell|gentle-ai)/i, path);
	}
});

test("upstream attribution, community links and original MIT license remain", () => {
	const readme = read("README.md");
	assert.match(readme, /Forked from \[gentle-shell\]\(https:\/\/github\.com\/Gentleman-Programming\/gentle-shell\)/);
	assert.match(readme, /Upstream \*\*gentle-shell\*\* is built by \[Alan Buscaglia\]/);
	assert.match(readme, /Startup intro collaboration: thanks to \[@aporcelli\]/);
	assert.match(readme, /## 🤝 Community/);
	assert.match(readme, /tomidev-shell\/issues/);
	assert.match(readme, /tomidev-shell\/graphs\/contributors/);
	assert.match(readme, /\[LICENSE\]\(LICENSE\)/);
	const license = read("LICENSE");
	assert.match(license, /^MIT License\n/);
	assert.match(license, /Copyright \(c\) 2025 Mario Zechner/);
	assert.match(license, /The above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software\./);
	assert.equal(JSON.parse(read("package.json")).license, "MIT");
});
