# Delegated verification

The parent follows [orchestrator verification](../assets/orchestrator-verification.md) and the `tomidev` skill. A bounded writer runs the exact parent-authorized commands under `## Verification`, in the foreground, and reports each as `<command>: <observed result>`. A command that fails forces a partial report unless its exact failure is listed under `## Known environmental failures`.

## Compose with project verification

The project owns workflow/lane names, artifact formats and paths, tracking, acceptance criteria and delivery. Review and verify the same project artifact using its existing identifiers; do not force a duplicate `checks.md`, feature directory or Engram index. Builtin lane rules below fill undefined aspects only. Respect explicit incompatible project rules and clarify unresolved conflicts; runtime safety, confinement and exact Allowed edit surfaces still apply.

For substantial planned work, builtin blind judges review the same project plan before execution even if the repository does not mention judges. The orchestrator accepts findings into that artifact or rejects with evidence, before delegating implementation. Both judges must report no open severe findings; after at most 3 rounds without consensus, stop and ask the user. Trivial/direct work needs no new plan or judge loop. This complements compatible project review rather than imposing parallel tracking or gates.

## Verification by lane and risk (fallback)

After a writer returns, the parent re-runs one reported command as a spot check.

| Lane and risk | Required evidence |
| --- | --- |
| Direct or Checks-only, `Risk: none` | Writer self-verification, applicable C# evidence, and parent spot check |
| Any lane with a named high-risk item | Self-verification plus independent `gentle-ai-verify` against the obligations |
| Full Lean | Fresh independent `gentle-ai-verify` PASS on every `checks.md` C# item before closure; otherwise INCOMPLETE |

Size and the writer's model or effort never add a verifier. Functional checks still run. Code review uses `requesting-code-review` at the final checkpoint or on request, with relevant read-only lenses selected by the orchestrator. It never replaces independent verification or authorizes delivery. See [review in Tomidev Shell](readme-reference.md#review-in-tomidev-shell) for lenses and the blind-judge consensus loop.

## Verifier preparation

Run the scratch archive pipeline in Bash with `set -o pipefail`, and chain subsequent probes to successful preparation with `&&`. An archive producer can emit extractable content and then fail: without `pipefail`, a successful extractor masks that failure. Either producer or extractor failure stops preparation; a partial copy is not valid verification state.

The independent verifier makes one isolated preparation attempt. At the first inability to prepare a required copy, environment, dependency, or helper, it stops setup and reports one concrete blocker, the exact checks left unrun as unverified, not passed, and any scratch directories created. It does not retry setup or chain helper repairs; the parent stops with one **Needs your decision** result identifying the missing prerequisite and exact unrun checks, without continuing helper repairs or automatically relaunching for the same prerequisite. Setup or infrastructure failure is distinct from a code finding, whose existing correction allowance remains; auxiliary tooling defects remain subject to the existing correction bound, which setup failure does not reset. Successful preparation continues to authorized checks and independent probes within the existing isolation and permission boundaries.

### Explicit recovery after a setup failure

A failed setup is not the same as an unavailable verifier capability. After the missing prerequisite is repaired, the human can explicitly request one new bounded attempt. Preserve the failed attempt and its zero-test result; static inspection and parent tests do not replace the missing independent runtime proof. Before dispatch, confirm the previous child has finished without uncertain status and establish the required payload, dependencies, and scratch capacity (space and inodes where relevant). A smaller system-temp copy is allowed only when it contains every input needed for the authorized probes; workspace symlinks, network access, and dependency installs remain prohibited for the verifier.

This request does not permit automatic retries, override a denial, bypass consent, or override an explicit one-run/no-retry limit. If the prerequisite is still missing, report the exact blocker rather than repeating the failed setup.

### Explicit recovery after worker correction exhaustion

A worker-local correction limit ends its automatic cycle, not necessarily the feature. The partial report must preserve the failed commands, output, remaining implementation work, and missing proof. The parent can offer a concrete continuation for explicit human authorization, naming its scope, executor, correction limit, and checks; the human can also stop. A later conversation is not a budget reset, and an active or uncertain child prevents continuation.

A read-only inspection grants no review approval or mutation authority. Missing required proof still blocks completion and delivery. Continue only within explicit authorization and the applicable correction limits.

This is prompt policy, not a runtime-enforced limit; contract tests establish instruction delivery, not agent compliance or a measured speedup.

## Verifier launch context

Name the actual risk and applicable project acceptance criteria in the handoff (`checks.md` C# items only when that format is selected). An explicit `Spec: proposals/cache.rst` can reference the existing project artifact without a builtin filename, directory or T# conversion. The live dispatch paths no longer invoke the legacy document-path/risk admission helpers; do not expand or bypass those retired gates to manufacture admission. Writer Allowed edit surfaces still apply independently: a Spec reference does not grant permission to edit that document. Never invent a risk declaration just to obtain a verifier. Keep required independent proof distinct from the writer's summary and the user's visual approval. Report missing proof, do not substitute another role or silently waive it.

## Background capability admission

An explicit agent `tools` declaration containing `bash_background` requires the background-subagents policy to resolve to `on` at dispatch, for both task and background launches. Otherwise the runner fails the task before spawn and reports the policy file, opt-in schema, and `/td:background-subagents enable|disable|status`. Fix the deciding policy explicitly; automation must not toggle it. Passing admission forwards the job capability to the child, which registers `bash_background`, `job_list`, and `job_stop` for its own session; the runner then gives a running child job one bounded drain window at settlement instead of killing it immediately. The `monitor` tool stays parent-only, child jobs are never routed through the parent, and no new persisted state is added. Ordinary missing-tool reporting remains the backstop. See the [policy contract](readme-reference.md#capability-reference).
