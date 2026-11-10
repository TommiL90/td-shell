import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	installerPaths,
	missingRequiredPaths,
	reconcileContractsOnDisk,
	reconcileGeneratedRuntimeSources,
	requiredPaths,
} from "../scripts/verify-package-files.mjs";

test("package resource CLI reconciles the STATUS diagnostic runtime with the generated inventory", () => {
	const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/verify-package-files.mjs")], {
		cwd: process.cwd(), encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" },
	});
	assert.equal(result.status, 0, result.stderr || result.stdout);
	assert.equal(result.stderr, "");
	assert.match(result.stdout, /^tomidev package resource check passed \(/);
});

function makeFixtureRoot(): string {
	return mkdtempSync(join(tmpdir(), "gentle-pi-verify-package-files-"));
}

test("contracts/ walk fails on a file that exists on disk but is unlisted in contractHashes", () => {
	const fixtureRoot = makeFixtureRoot();
	try {
		const knownRelativePath = "contracts/review-integration/v2/schemas/known.schema.json";
		const unlistedRelativePath = "contracts/review-integration/v2/schemas/unlisted.schema.json";
		mkdirSync(join(fixtureRoot, "contracts/review-integration/v2/schemas"), { recursive: true });
		writeFileSync(join(fixtureRoot, knownRelativePath), "{}\n");
		writeFileSync(join(fixtureRoot, unlistedRelativePath), "{}\n");

		const { unlistedOnDisk, listedButMissing } = reconcileContractsOnDisk(fixtureRoot, {
			[knownRelativePath]: "irrelevant-for-this-walk",
		});

		assert.deepEqual(unlistedOnDisk, [unlistedRelativePath]);
		assert.deepEqual(listedButMissing, []);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test("contracts/ walk fails on a contractHashes entry that is missing from disk", () => {
	const fixtureRoot = makeFixtureRoot();
	try {
		const missingRelativePath = "contracts/review-integration/v2/schemas/missing.schema.json";
		mkdirSync(join(fixtureRoot, "contracts/review-integration/v2/schemas"), { recursive: true });

		const { unlistedOnDisk, listedButMissing } = reconcileContractsOnDisk(fixtureRoot, {
			[missingRelativePath]: "irrelevant-for-this-walk",
		});

		assert.deepEqual(unlistedOnDisk, []);
		assert.deepEqual(listedButMissing, [missingRelativePath]);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test("contracts/ walk excludes the provider contract mirror subtree, whose bytes are pinned by its own lock", () => {
	const fixtureRoot = makeFixtureRoot();
	try {
		mkdirSync(join(fixtureRoot, "contracts/review-provider-contract-mirror/v1.1.0/bundle"), { recursive: true });
		writeFileSync(join(fixtureRoot, "contracts/review-provider-contract-mirror/provider-contract.lock.json"), "{}\n");
		writeFileSync(join(fixtureRoot, "contracts/review-provider-contract-mirror/v1.1.0/bundle/README.md"), "mirror\n");

		const { unlistedOnDisk, listedButMissing } = reconcileContractsOnDisk(fixtureRoot, {});

		assert.deepEqual(unlistedOnDisk, []);
		assert.deepEqual(listedButMissing, []);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test("sources <-> runtime/*.mjs walk fails when a generated runtime file is absent from the generator's sources array", () => {
	const fixtureRoot = makeFixtureRoot();
	try {
		mkdirSync(join(fixtureRoot, "runtime"), { recursive: true });
		writeFileSync(join(fixtureRoot, "runtime/known.mjs"), "// generated\n");
		writeFileSync(join(fixtureRoot, "runtime/orphan.mjs"), "// generated\n");

		const { drifted } = reconcileGeneratedRuntimeSources(
			fixtureRoot,
			["known"],
			["runtime/known.mjs", "runtime/orphan.mjs"],
		);

		assert.deepEqual(drifted, [
			{ name: "orphan", inSources: false, inRuntimeDir: true, inRequiredPaths: true },
		]);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test("sources <-> runtime/*.mjs walk fails when a sources entry is absent from requiredPaths", () => {
	const fixtureRoot = makeFixtureRoot();
	try {
		mkdirSync(join(fixtureRoot, "runtime"), { recursive: true });
		writeFileSync(join(fixtureRoot, "runtime/known.mjs"), "// generated\n");
		writeFileSync(join(fixtureRoot, "runtime/unrequired.mjs"), "// generated\n");

		const { drifted } = reconcileGeneratedRuntimeSources(
			fixtureRoot,
			["known", "unrequired"],
			["runtime/known.mjs"],
		);

		assert.deepEqual(drifted, [
			{ name: "unrequired", inSources: true, inRuntimeDir: true, inRequiredPaths: false },
		]);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test("both walks report no drift when sources, runtime/*.mjs, requiredPaths, and contractHashes fully agree", () => {
	const fixtureRoot = makeFixtureRoot();
	try {
		mkdirSync(join(fixtureRoot, "contracts/review-integration/v2/schemas"), { recursive: true });
		mkdirSync(join(fixtureRoot, "runtime"), { recursive: true });
		writeFileSync(
			join(fixtureRoot, "contracts/review-integration/v2/schemas/status.schema.json"),
			"{}\n",
		);
		writeFileSync(join(fixtureRoot, "runtime/known.mjs"), "// generated\n");

		const contractsResult = reconcileContractsOnDisk(fixtureRoot, {
			"contracts/review-integration/v2/schemas/status.schema.json": "irrelevant-for-this-walk",
		});
		const sourcesResult = reconcileGeneratedRuntimeSources(
			fixtureRoot,
			["known"],
			["runtime/known.mjs"],
		);

		assert.deepEqual(contractsResult, { unlistedOnDisk: [], listedButMissing: [] });
		assert.deepEqual(sourcesResult, { drifted: [] });
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test("required package paths include every browser installation wizard file", () => {
	const expected = [
		"bin/tomidev-install.mjs",
		"scripts/installer-server.mjs",
		"scripts/installer-runner.mjs",
		"scripts/installer-preflight.mjs",
		"scripts/installer-probes.mjs",
		"scripts/installer-downloads.mjs",
		"scripts/main-channel.mjs",
		"scripts/installer-windows.mjs",
		"scripts/installer-windows-artifacts.json",
		// The bundled install the wizard runs for a new release installation (T1c).
		"scripts/bundled-wizard.mjs",
		"scripts/bundled-install.mjs",
		"scripts/bootstrap.sh",
		"scripts/bootstrap.cmd",
		"assets/install-wizard/index.html",
		"assets/install-wizard/wizard.js",
		"assets/install-wizard/wizard.css",
	];
	assert.deepEqual([...installerPaths].sort(), [...expected].sort());
	for (const relativePath of expected) assert.ok(requiredPaths.includes(relativePath), relativePath);
	const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
	assert.deepEqual(missingRequiredPaths(repositoryRoot, installerPaths), []);
});

test("missing required paths are reported, including directories in place of files", () => {
	const fixtureRoot = makeFixtureRoot();
	try {
		mkdirSync(join(fixtureRoot, "bin"), { recursive: true });
		mkdirSync(join(fixtureRoot, "assets/install-wizard/index.html"), { recursive: true });
		writeFileSync(join(fixtureRoot, "bin/tomidev-install.mjs"), "// entry\n");

		assert.deepEqual(
			missingRequiredPaths(fixtureRoot, ["bin/tomidev-install.mjs", "assets/install-wizard/index.html", "scripts/installer-server.mjs"]),
			["assets/install-wizard/index.html", "scripts/installer-server.mjs"],
		);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});
