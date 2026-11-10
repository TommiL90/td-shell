import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// S3: the review tools, RDD and Judgment Day were retired end to end. Shipped
// assets, skills, extensions and library code never name them again, so the
// retired vocabulary cannot reach a prompt, a card or a tool registration.

const REPO_ROOT = join(import.meta.dirname, "..");
const read = (relative: string): string => readFileSync(join(REPO_ROOT, relative), "utf8");

const SCANNED_ROOTS = ["assets", "skills", "extensions", "lib"] as const;
// Retired documents that described only the removed review machinery. They are
// deleted; the scan below fails if any of them comes back or is linked again.
const RETIRED_DOCS = new Set([
	"docs/review-coordinator.md",
	"docs/review-integration.md",
	"docs/review-request-context.md",
	"docs/review-windows-acl.md",
	"docs/native-authority-architecture.md",
	"docs/rdd-odd-friction-triage-2026-11-07.md",
]);
const RETIRED_TERMS: readonly RegExp[] = [/gentle_review/, /\bRDD\b/, /Judgment Day/];
const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|mp3|wav|ogg|woff2?|ttf|zip|gz)$/i;

function shippedTextFiles(dir: string): string[] {
	return readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return shippedTextFiles(path);
		return entry.isFile() && !BINARY_EXTENSIONS.test(entry.name) ? [path] : [];
	});
}

test("S3: no shipped asset, skill, extension or library file names gentle_review, RDD or Judgment Day", () => {
	const violations: string[] = [];
	for (const root of SCANNED_ROOTS) {
		for (const file of shippedTextFiles(root)) {
			readFileSync(join(REPO_ROOT, file), "utf8").split("\n").forEach((line, index) => {
				for (const term of RETIRED_TERMS) {
					if (term.test(line)) violations.push(`${file}:${index + 1} ${term.source}`);
				}
			});
		}
	}
	assert.deepEqual(violations, [], "retired review/RDD/Judgment Day vocabulary is still shipped");
});

test("S3/T10: retired review docs are gone and README/docs contain no retired review vocabulary or links to them", () => {
	const files = ["README.md", ...readdirSync(join(REPO_ROOT, "docs")).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`)];
	const violations: string[] = [];
	for (const retired of RETIRED_DOCS) if (files.includes(retired)) violations.push(`${retired} still exists`);
	for (const file of files) {
		read(file).split("\n").forEach((line, index) => {
			for (const term of RETIRED_TERMS) if (term.test(line)) violations.push(`${file}:${index + 1} ${term.source}`);
			for (const retired of RETIRED_DOCS) if (line.includes(retired.slice(5))) violations.push(`${file}:${index + 1} links ${retired}`);
		});
	}
	assert.deepEqual(violations, []);
});

test("S3: the packed-runner and package-file inventories assert no retired review surface", () => {
	for (const file of ["scripts/test-packed-runner.mjs", "scripts/verify-package-files.mjs"]) {
		const source = read(file);
		for (const retired of ["gentle_review", "td:review-mode", "gentle-ai-binary"]) {
			assert.equal(source.includes(retired), false, `${file} still names ${retired}`);
		}
	}
});

test("S3: the tlc-spec-lean upstream note names no RDD install and no missing OpenClick reference", () => {
	const upstream = read("skills/tlc-spec-lean/UPSTREAM.md");
	assert.doesNotMatch(upstream, /RDD|openclick/i, "UPSTREAM.md must stay agnostic to any project or review runtime");
	assert.equal(upstream.includes("references/openclick-project.md"), false, "the referenced file does not ship with the skill");
});

test("S3 hygiene: generated Python caches are ignored by git", () => {
	const lines = read(".gitignore").split("\n").map((line) => line.trim());
	assert.ok(lines.includes("__pycache__/"), ".gitignore must ignore __pycache__/ directories");
});
