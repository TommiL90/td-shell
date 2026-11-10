#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));

// Browser installation wizard: bootstrap scripts, entry, host and static assets.
export const installerPaths = Object.freeze([
  "bin/tomidev-install.mjs",
  "scripts/installer-server.mjs",
  "scripts/installer-runner.mjs",
  "scripts/installer-preflight.mjs",
  "scripts/installer-probes.mjs",
  "scripts/installer-downloads.mjs",
  "scripts/main-channel.mjs",
  "scripts/installer-windows.mjs",
  "scripts/installer-windows-artifacts.json",
  "scripts/bundled-wizard.mjs",
  "scripts/bundled-install.mjs",
  "scripts/bootstrap.sh",
  "scripts/bootstrap.cmd",
  "assets/install-wizard/index.html",
  "assets/install-wizard/wizard.js",
  "assets/install-wizard/wizard.css",
]);

export const requiredPaths = [
  "bin/tomidev.mjs",
  ...installerPaths,
  "extensions/gentle-notifications.ts",
  "lib/notification-audio.ts",
  "lib/notification-audio-native.ts",
  "lib/notification-audio-windows.ts",
  "lib/notification-pulse-protocol.ts",
  "lib/notification-pulse-client.ts",
  "lib/notification-pulse-stream.ts",
  "lib/notification-pulse-worker.ts",
  "lib/notification-customize.ts",
  "lib/notification-events.ts",
  "lib/notification-policy.ts",
  "lib/notification-scheduler.ts",
  "lib/notification-service.ts",
  "lib/notification-ui.ts",
  "assets/sounds/success.wav",
  "assets/sounds/error.wav",
  "assets/sounds/attention.wav",
  "assets/sounds/LICENSE.md",
  "docs/sound-notifications.md",
  "docs/sound-notifications-proposal.md",
  "extensions/gentle-voice.ts",
  "lib/voice-artifacts.ts",
  "lib/voice-command.ts",
  "lib/voice-install.ts",
  "lib/voice-platform.ts",
  "lib/voice-session.ts",
  "lib/voice-ui.ts",
  // The dictation worker is spawned by path, never imported, so nothing else
  // would notice it missing from the packed tarball.
  "scripts/voice-worker.cjs",
  "docs/voice.md",
  "extensions/gentle-design.ts",
  "lib/gentle-design.ts",
  // The design canvas server reads its page and scripts from assets/ by path.
  "lib/design-canvas-server.ts",
  "lib/design-open-browser.ts",
  "lib/design-comments.ts",
  "lib/design-handoffs.ts",
  "lib/design-sources.ts",
  "assets/design-canvas/index.html",
  "assets/design-canvas/canvas.js",
  "assets/design-canvas/canvas.css",
  "assets/design-canvas/inspector.js",
  "scripts/npm-pack-result.mjs",
  "assets/orchestrator.md",
  "assets/orchestrator-delegation.md",
  "assets/orchestrator-full-delegation.md",
  "assets/orchestrator-full-delegation-card.md",
  "assets/orchestrator-delegation-reference.md",
  "assets/orchestrator-tracking.md",
  "assets/orchestrator-verification.md",
  "assets/orchestrator-writer.md",
  "assets/orchestrator-prompts.md",
  "assets/orchestrator-memory.md",
  "assets/orchestrator-skills.md",
  "assets/agents/gentle-ai-explore.md",
  "assets/agents/gentle-ai-verify.md",
  "assets/agents/gentle-ai-worker.md",
  "assets/agents/jd-judge-a.md",
  "assets/agents/jd-judge-b.md",
  "assets/agents/review-readability.md",
  "assets/agents/review-reliability.md",
  "assets/agents/review-resilience.md",
  "assets/agents/review-risk.md",
  "assets/migrations/managed-assets-v0.10.7.json",
  "assets/migrations/managed-assets-v0.13.json",
  "assets/migrations/managed-assets-v0.14.json",
  "assets/support/strict-tdd.md",
  "assets/support/strict-tdd-verify.md",
  "docs/delegated-verification.md",
  "docs/skill-style-guide.md",
  "extensions/gentle-ai.ts",
  "extensions/resume-hint.ts",
  "extensions/session-scratch.ts",
  "extensions/skill-registry.ts",
  "lib/brand.ts",
  "lib/context-breakdown.ts",
  "lib/child-package-injection.ts",
  "lib/gentle-shell-launcher.ts",
  "lib/gentle-shell-bundled.ts",
  "lib/gentle-shell-resume-hint.ts",
  "lib/gentle-shell-import-pi.ts",
  "lib/agent-assets.ts",
  "lib/telemetry-trigger.ts",
  "lib/session-scratch.ts",
	"runtime/brand.mjs",
	"runtime/child-package-injection.mjs",
	"runtime/gentle-shell-launcher.mjs",
	"runtime/gentle-shell-bundled.mjs",
	"runtime/gentle-shell-resume-hint.mjs",
	"runtime/gentle-shell-uninstall.mjs",
	"runtime/gentle-shell-import-pi.mjs",
	"runtime/telemetry-trigger.mjs",
  "scripts/download-progress.mjs",
  "scripts/install-gentle-ai.mjs",
  "scripts/install-tui-mode-setting.mjs",
  "prompts/skill-creation.md",
  "skills/clean-code/SKILL.md",
  "skills/comment-writer/SKILL.md",
  "skills/consensus/SKILL.md",
  "skills/delivery/SKILL.md",
  "skills/design/SKILL.md",
  "skills/gentle-ui-design/SKILL.md",
  "skills/gentle-ui-design/references/task-and-content.md",
  "skills/gentle-ui-design/references/browse-and-compare.md",
  "skills/gentle-ui-design/references/composition-and-feedback.md",
  "skills/gentle-ui-design/references/adaptive-interfaces.md",
  "skills/requesting-code-review/SKILL.md",
  "skills/testing/SKILL.md",
  "skills/tlc-spec-lean/SKILL.md",
  "skills/tomidev/SKILL.md",
];

const contractHashes = {
  "contracts/telemetry/runtime-aggregate-v1.schema.json": "eb0f2993d9271f55cb42eca343e6fbb601a733fb90bd40daeebc92ee60ae1ba9",
};

requiredPaths.push(...Object.keys(contractHashes));

// Required package-relative paths that are missing or are not regular files.
export function missingRequiredPaths(packageRoot, paths) {
  return paths.filter((relativePath) => {
    const absolutePath = join(packageRoot, relativePath);
    return !existsSync(absolutePath) || !statSync(absolutePath).isFile();
  });
}

function listFilesRecursively(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) return listFilesRecursively(absolutePath);
    return entry.isFile() ? [absolutePath] : [];
  });
}

// Reconcile the packaged contracts tree against its byte pins. Report both
// directions so a new unlisted file and a stale hash-map entry are visible.
//
// `contracts/review-provider-contract-mirror/**` is deliberately excluded:
// that subtree has exactly one byte authority — the mirror's own lock record,
// enforced by scripts/check-provider-contract.mjs in the same pnpm test flow —
// so listing it here would create a second, drift-prone pin for the same bytes.
const PROVIDER_CONTRACT_MIRROR_PREFIX = "contracts/review-provider-contract-mirror/";

export function reconcileContractsOnDisk(packageRoot, hashes) {
  const contractsRoot = join(packageRoot, "contracts");
  const walked = existsSync(contractsRoot)
    ? listFilesRecursively(contractsRoot)
        .map((absolutePath) => relative(packageRoot, absolutePath).split(sep).join("/"))
        .filter((relativePath) => !relativePath.startsWith(PROVIDER_CONTRACT_MIRROR_PREFIX))
    : [];
  const listed = Object.keys(hashes).filter((relativePath) => relativePath.startsWith("contracts/"));
  const walkedSet = new Set(walked);
  const listedSet = new Set(listed);

  return {
    unlistedOnDisk: walked.filter((relativePath) => !listedSet.has(relativePath)).sort(),
    listedButMissing: listed.filter((relativePath) => !walkedSet.has(relativePath)).sort(),
  };
}

// Reads the generator's `sources` array by regex rather than importing it,
// so this script never needs the generator to export anything it doesn't
// already export for its own `--write`/`--check` CLI use.
export function extractGeneratedRuntimeSources(packageRoot) {
  const generatorPath = join(packageRoot, "scripts/build-runtime-modules.mjs");
  const generatorSource = readFileSync(generatorPath, "utf8");
  const sourcesMatch = generatorSource.match(/const sources = \[([\s\S]*?)\];/);
  if (!sourcesMatch) {
    throw new Error(`${generatorPath} does not declare a "sources" array`);
  }
  return [...sourcesMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

// Three-way reconciliation: the generator's `sources` names must equal the
// `.mjs` basenames on disk in `runtime/`, which must equal the `runtime/`
// entries in `requiredPaths`. Deliberately not a `lib/`-driven walk: most
// `lib/` modules are intentionally unpaired with a generated runtime file.
export function reconcileGeneratedRuntimeSources(packageRoot, sources, paths) {
  const runtimeRoot = join(packageRoot, "runtime");
  const runtimeBasenames = existsSync(runtimeRoot)
    ? readdirSync(runtimeRoot)
        .filter((name) => name.endsWith(".mjs"))
        .map((name) => name.slice(0, -".mjs".length))
    : [];
  const requiredRuntimeBasenames = paths
    .filter((relativePath) => relativePath.startsWith("runtime/") && relativePath.endsWith(".mjs"))
    .map((relativePath) => relativePath.slice("runtime/".length, -".mjs".length));

  const sourceSet = new Set(sources);
  const runtimeSet = new Set(runtimeBasenames);
  const requiredSet = new Set(requiredRuntimeBasenames);
  const names = new Set([...sourceSet, ...runtimeSet, ...requiredSet]);

  const drifted = [...names]
    .filter((name) => !(sourceSet.has(name) && runtimeSet.has(name) && requiredSet.has(name)))
    .sort()
    .map((name) => ({
      name,
      inSources: sourceSet.has(name),
      inRuntimeDir: runtimeSet.has(name),
      inRequiredPaths: requiredSet.has(name),
    }));

  return { drifted };
}

async function main() {
  if (existsSync(join(root, "extensions/sdd-init.ts"))) {
    console.error("tomidev package must not restore the retired SDD init extension");
    process.exit(1);
  }

  const missing = missingRequiredPaths(root, requiredPaths);

  if (missing.length > 0) {
    console.error("tomidev package is missing required Pi resources:");
    for (const relativePath of missing) {
      console.error(`- ${relativePath}`);
    }
    console.error("\nRefusing to pack/publish an incomplete npm package.");
    process.exit(1);
  }

  const { unlistedOnDisk, listedButMissing } = reconcileContractsOnDisk(root, contractHashes);
  if (unlistedOnDisk.length > 0 || listedButMissing.length > 0) {
    console.error("tomidev packaged contracts/ tree has drifted from contractHashes:");
    for (const relativePath of unlistedOnDisk) console.error(`- unlisted-on-disk: ${relativePath}`);
    for (const relativePath of listedButMissing) console.error(`- listed-but-missing: ${relativePath}`);
    console.error("\nRefusing to pack/publish an unreconciled contracts/ tree.");
    process.exit(1);
  }

  const generatedRuntimeSources = extractGeneratedRuntimeSources(root);
  const { drifted } = reconcileGeneratedRuntimeSources(root, generatedRuntimeSources, requiredPaths);
  if (drifted.length > 0) {
    console.error("tomidev generated runtime sources, runtime/*.mjs, and requiredPaths have drifted apart:");
    for (const entry of drifted) {
      const where = [];
      if (!entry.inSources) where.push("missing from generator sources");
      if (!entry.inRuntimeDir) where.push("missing from runtime/*.mjs");
      if (!entry.inRequiredPaths) where.push("missing from requiredPaths");
      console.error(`- ${entry.name}: ${where.join(", ")}`);
    }
    console.error("\nRefusing to pack/publish an unreconciled generated runtime.");
    process.exit(1);
  }

  const driftedContracts = Object.entries(contractHashes).flatMap(([relativePath, expected]) => {
    const actual = createHash("sha256").update(readFileSync(join(root, relativePath))).digest("hex");
    return actual === expected ? [] : [{ relativePath, expected, actual }];
  });

  if (driftedContracts.length > 0) {
    console.error("tomidev packaged contract bytes drifted from expected SHA-256:");
    for (const drift of driftedContracts) console.error(`- ${drift.relativePath}: expected ${drift.expected}, got ${drift.actual}`);
    process.exit(1);
  }

  const generatedRuntimeCheck = spawnSync(process.execPath, [join(root, "scripts/build-runtime-modules.mjs"), "--check"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  if (generatedRuntimeCheck.status !== 0) {
    console.error("tomidev generated runtime does not match its TypeScript sources:");
    console.error((generatedRuntimeCheck.stderr || generatedRuntimeCheck.stdout || "unknown generator failure").trim());
    process.exit(1);
  }

  console.log(`tomidev package resource check passed (${requiredPaths.length} files; ${Object.keys(contractHashes).length} exact byte-pinned contract artifacts for the v4.4.0 runtime).`);
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  await main();
}
