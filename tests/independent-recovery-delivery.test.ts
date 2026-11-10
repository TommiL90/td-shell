import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";
import { parseAgentDefinition } from "../lib/agents-config.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const paragraph = (p: string, prefix: string) => {
  const text = p.split("\n\n").find(s => s.startsWith(prefix));
  assert.ok(text, prefix);
  return text;
};
let cwd: string;
let prior: string | undefined;
before(() => {
  cwd = mkdtempSync(join(tmpdir(), "recovery-delivery-"));
  prior = process.env.TOMIDEV_CONFIG_HOME;
  process.env.TOMIDEV_CONFIG_HOME = join(cwd, "config");
  mkdirSync(join(cwd, "project"));
});
after(() => {
  if (prior === undefined) delete process.env.TOMIDEV_CONFIG_HOME;
  else process.env.TOMIDEV_CONFIG_HOME = prior;
  rmSync(cwd, { recursive: true, force: true });
});

// Continuity uses the fixed persona and preserves host-specific behavior.
for (const mode of ["tui", "rpc", "print", "json"]) {
    test(`S2-S5 delivered continuity is bounded: ${mode}`, () => {
      const p = __testing.buildGentlePrompt(join(cwd, "project"), ["read"], mode);
      assert.equal(p.split("## Authorized work continuity").length, 2);
      const stop = paragraph(p, "Stop only for");
      assert.match(stop, /missing required proof \(it blocks completion and delivery\)/);
      assert.match(stop, /the human's explicit stop/);
      const infer = paragraph(p, "Do not infer permission");
      assert.match(infer, /publishing \(push, pull request, release\), commits, destructive actions, or unrelated scope/);
      assert.match(p, /7\. \*\*Close\.\*\*[^\n]*never more verification/);
    });
}

test("S3-S5 parsed worker and verifier contracts retain confinement and proof limits", () => {
  const agent = (name: string) => {
    const p = `assets/agents/gentle-ai-${name}.md`;
    const parsed = parseAgentDefinition(read(p), p, "global");
    assert.ok(!("error" in parsed));
    return parsed;
  };
  const worker = agent("worker");
  assert.match(worker.instructions, /handoff is not authorization to continue/);
  assert.match(worker.instructions, /Do not start a fresh correction cycle/);
  assert.match(worker.instructions, /missing proof still blocks completion and delivery/);
  const verify = agent("verify");
  assert.deepEqual(verify.tools, ["read", "grep", "find", "bash", "mcp__codegraph__codegraph_explore"]);
  assert.match(verify.instructions, /Before isolated setup[^\n]*space and inodes/);
  assert.match(verify.instructions, /smaller copy[^\n]*all source, test\/build files, baseline material, and dependencies/);
  assert.match(verify.instructions, /first inability[^\n]*stop setup/);
  assert.match(verify.instructions, /setup fails before probes[^\n]*zero tests run/);
  assert.match(verify.instructions, /Do not retry setup or enter repair-helper loops/);
  for (const guard of ["system temp directory", "a symlink into the workspace", "No network, no installs, no writes outside", "NODE_COMPILE_CACHE", "NO_UPDATE_NOTIFIER=1"]) assert.ok(verify.instructions.includes(guard), guard);
});

test("S2-S5 user recovery docs retain the independent-proof and native-authority boundaries", () => {
  const docs = read("docs/delegated-verification.md");
  assert.match(docs, /static inspection and parent tests do not replace the missing independent runtime proof/);
  assert.match(docs, /read-only inspection grants no review approval or mutation authority/);
  assert.match(docs, /Missing required proof still blocks completion and delivery/);
  assert.match(docs, /active or uncertain child prevents continuation/);
  assert.match(docs, /explicit one-run\/no-retry limit/);
});
