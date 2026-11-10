import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as runner from "../scripts/test-packed-runner.mjs";
import { assertNotRealHome, isolatedHome } from "./support/isolated-home.ts";

function disposable(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "packed-td-"));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("native artifact failure assertions remain active for hooked and unhooked installs", () => {
  for (const artifact of [".gentle-ai", "runtime/native-review-cli.mjs", "runtime/review-integration-v2.mjs", "runtime/gentle-ai-binary.mjs"]) disposable(root => {
    const packageRoot = join(root, "package");
    mkdirSync(join(packageRoot, "runtime"), { recursive: true });
    runner.assertNoNativeInstallerArtifacts(packageRoot, root, {});
    if (artifact === ".gentle-ai") mkdirSync(join(packageRoot, artifact));
    else writeFileSync(join(packageRoot, artifact), "retired");
    assert.throws(() => runner.assertNoNativeInstallerArtifacts(packageRoot, root, {}), /retired provider artifact|native Gentle AI artifact/);
    assert.ok(existsSync(join(packageRoot, artifact)), "rejection never deletes the evidence");
  });
});

test("ordinary install requires actual unmanaged postinstall output, never npm policy warnings", () => disposable(root => {
  const packageRoot = join(root, "package");
  mkdirSync(packageRoot);
  const message = `tomidev skipped enabling fullscreen in global Pi settings: ${realpathSync.native(packageRoot)} is not a pi-managed install.`;
  for (const output of ["", "npm warn allow-scripts tomidev@1.0.0 postinstall is not covered by allowScripts\n", message.replace(realpathSync.native(packageRoot), join(root, "other"))]) {
    assert.throws(() => runner.assertPackedPostinstallOutput(output, packageRoot), /postinstall execution was not observed/);
    assert.deepEqual(readdirSync(packageRoot), [], "missing hook evidence must not mutate installed data");
  }
  assert.doesNotThrow(() => runner.assertPackedPostinstallOutput(`> tomidev@1.0.0 postinstall\n${message}\n`, packageRoot));
}));

test("all packed children receive disposable homes/config/cache without inherited credentials", () => disposable(root => {
  const { env, homes } = runner.isolatedUnhookedEnvironment(root);
  for (const key of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "TOMIDEV_AGENT_HOME", "TOMIDEV_CONFIG_HOME", "PI_CODING_AGENT_DIR", "NPM_CONFIG_CACHE", "NPM_CONFIG_USERCONFIG", "TMPDIR"]) assert.ok(env[key].startsWith(root), key);
  assert.equal(env.NPM_CONFIG_UPDATE_NOTIFIER, "false");
  assert.equal(env.NPM_CONFIG_IGNORE_SCRIPTS, "true");
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(homes.length, 9);
}));

test("launch smoke runs real Tomidev and adjacent Pi offline and preserves user preferences", { timeout: 20000 }, (t) => {
  const sandbox = isolatedHome({ PATH: process.env.PATH }, "packed-td-home-");
  t.after(sandbox.remove);
  const root = sandbox.root;
  const { env } = runner.isolatedUnhookedEnvironment(root);
  Object.assign(env, sandbox.env);
  const settingsPath = join(env.TOMIDEV_AGENT_HOME, "settings.json");
  const original = '{"theme":"user-selected","tuiMode":"regular"}\n';
  writeFileSync(settingsPath, original);
  Object.assign(env, { PI_OFFLINE: "1", TOMIDEV_NO_AUTO_SETUP: "1", npm_config_offline: "true" });
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const version = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version;
  runner.runPackedLaunchSmoke(packageRoot, root, assertNotRealHome(env), version);
  assert.equal(readFileSync(settingsPath, "utf8"), original);
});

const source = readFileSync(new URL("../scripts/test-packed-runner.mjs", import.meta.url), "utf8");

test("packed asset proofs require shipped Tomidev assets, not the retired provider", () => {
  assert.ok(Array.isArray(runner.HASHED_PACKED_ASSETS));
  for (const asset of runner.HASHED_PACKED_ASSETS) assert.ok(existsSync(new URL(`../${asset.relativePath}`, import.meta.url)), asset.relativePath);
  for (const path of ["bin/tomidev.mjs", "runtime/brand.mjs", "lib/agents-config.ts"]) assert.ok(runner.HASHED_PACKED_ASSETS.some(asset => asset.relativePath === path));
  assert.doesNotMatch(source, /nativeReviewAbandonAuthorization|decodeReviewCapabilitiesV2/);
});

test("default packed E2E retains install, launch, ownership and actual SDK lifecycle proofs", () => {
  const hooked = source.slice(source.indexOf("async function testHookedPackedRunner()"), source.indexOf("function isolatedUnhookedEnvironment"));
  for (const requirement of ["isolatedUnhookedEnvironment(temporary)", '"--ignore-scripts=false"', '"--foreground-scripts"', "assertPackedPostinstallOutput(installOutput, packageRoot)", "createHookedPackedConsumerManifest", "originalSettings", "assertPackedAssets", "assertNoNativeInstallerArtifacts", "runPackedLaunchSmoke", "unhookedProbeSource", "sdkLifecycleProbeSource", "parseSdkLifecycleChildReceipt", "installTuiModeSetting"]) assert.ok(hooked.includes(requirement), requirement);
  assert.match(source, /default: install \+ launch \+ registration \+ two-session lifecycle/);
});

test("generated probes import brand constants from the installed package", () => {
  for (const name of ["unhookedProbeSource", "sdkLifecycleProbeSource"]) {
    const probe = runner[name]("/owned/tomidev", "/owned/package.json", "/owned/jiti.mjs");
    assert.ok(probe.includes('file:///owned/tomidev/runtime/brand.mjs'));
    assert.doesNotMatch(probe, /from "\.\.\/runtime\/brand.mjs"/);
    const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: probe, encoding: "utf8", timeout: 5000 });
    assert.equal(syntax.status, 0, syntax.stderr);
    assert.equal(syntax.stdout, "");
    assert.equal(syntax.stderr, "");
  }
});
