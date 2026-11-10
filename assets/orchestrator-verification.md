# Orchestrator — Verification (lazy-loaded)

Parent only: load when Verification fires or a delegated writer returns; not for small work.

## Project verification integration

Project workflow, artifact formats, acceptance criteria and delivery gates are authoritative. Use the project's existing plan/checks and identifiers for verification, not a duplicate `checks.md` or C# conversion. The lane/risk table below supplies defaults only where undefined; respect explicit incompatible procedures and clarify only unresolved conflicts. Runtime safety and exact parent-authorized command boundaries remain binding.

## Verification rule (normative)

5. **Verification rule** (normative; referenced, not restated, in the other orchestrator modules): The bounded writer always runs the exact parent-authorized commands under the delegated task's `## Verification` heading, synchronously and in the foreground, and reports each as `<command>: <observed result>` -- see `gentle-ai-worker`'s Verification contract for the exact rules, including how `## Known environmental failures` (exact pre-existing base failures) differs from any other failing required command, which still forces `status: partial`. Those foreground commands are live work, not silence: while a tool call is in flight the runner's stall watchdog uses `tool_stall_timeout_ms` (default 30 minutes) instead of the `stall_timeout_ms` idle budget. After the writer returns, the parent re-runs one reported command (the spot check) and then applies this table. The change's own focused test and suite run inline.

| Lane and risk | Verification after the writer returns |
|---|---|
| Direct, `Risk: none` | Writer self-verification and the spot check stand; no separate verifier. |
| Checks-only, `Risk: none` | Writer self-verification against the `checks.md` C# items and the spot check stand; no separate verifier. |
| Any lane with a named high-risk item (`Risk: item N`) | Writer self-verification plus one independent `gentle-ai-verify` run against `checks.md`, after the change's own checks. |
| Full Lean | Independent `gentle-ai-verify` reports PASS on every `checks.md` C# item before closure; otherwise the feature is INCOMPLETE. |

The independent verifier runs only for a named high-risk item or Full Lean closure: never for size, for the model or effort that wrote the change, or for a worker's summary alone. A named item comes from the Risk line or a feature-document task line (runtime admits its launch on a `Risk: item N` line or sentence, a feature-document task line, or past the context backstop).

## Judges and consensus loop

For substantial planned work, review the same project plan before execution, even when the project does not define plan judges. Dispatch blind judges `jd-judge-a` and `jd-judge-b` concurrently against that plan and its existing acceptance criteria; neither sees the other's findings. The orchestrator adjudicates every finding: accept it and adjust the existing artifact, or reject it with technical evidence. Loop until both judges report no open severe finding, up to 3 rounds. Without consensus after round 3, stop and ask the user with the unresolved debate. The orchestrator incorporates findings before delegating execution to the worker. Respect explicit incompatible project rules; clarify only unresolved conflicts. Trivial/direct work needs no new plan or judge loop. Where project routing is undefined, apply this on Full Lean (optional for bounded high-risk Checks-only, never Direct), and use judges on sensitive diffs. Protocol: the `consensus` skill.

## Review lenses

Code review is `requesting-code-review` and runs only on explicit request or at the final checkpoint, never per task. The orchestrator selects the review lenses that fit the touched surface, as `requesting-code-review` defines them, and dispatches each as an independent read-only reviewer. Lens findings are adjudicated like judge findings and never applied automatically. A lens never replaces the named-item verifier or a functional check.

## Frontend and in-browser verification

For web frontend code, user interfaces, and browser-facing components, prefer observed in-browser verification with `ego-browser` (Ego Lite) over simulated DOM or unit tests alone. When a local dev server can be started:
1. Ensure the dev server is active or start it in background.
2. Use `ego-browser nodejs` to open the local route (`localhost:<port>`).
3. Take snapshots/screenshots and inspect console errors to verify layout, rendering, and interactive behavior.
4. Cite observed browser state in the verification result.

## Verifier preparation failure

If setup fails, stop with one **Needs your decision** result identifying the missing prerequisite and exact unrun checks as unverified. Do not keep repairing helpers. Do not automatically relaunch the verifier for the same missing prerequisite. Distinguish setup or infrastructure failure from genuine code findings. Auxiliary tooling defects remain subject to the existing correction bound. Follow **Authorized work continuity** for stop and blocker rules; scratch: `gentle-ai-verify`.

## Verification proportionality

Before adding or retaining an auxiliary gate, name its acceptance criterion, concrete threat, or authoritative contract; otherwise it must not become a delivery blocker. Do not build a framework for a bounded capability probe; use the existing command path and retain its observed result.

On overengineering warnings, remove or collapse optional artifacts and checks. State what was removed, what remains indispensable, and the next application outcome. Keep required functional checks and security controls intact; do not pass missing proof or weaken permissions.

## Parallel review protocol (gentle-shell#1731)

1. **Self-review**, required by each writer prompt, in its own session before returning: spec sections by reference (#1713), the request's authorized examples, tests, and typecheck; it fixes and continues (one correction per failing check, a second only if the same check still fails, then `partial`), reporting requirement by requirement. Low and medium risk need nothing else.
2. **Independent verify per unit**, once, after its final self-review (never per worker cycle or retry), in parallel when several finish together, only when that unit carries a named item from the high-risk list in Task Size (its Risk line or feature-document task line), never inferred from the worker's summary alone. Inline code over several deliveries of one feature: one verify at the feature's end.
3. **Seam check**: after parallel units finish, one inline full-suite command (the parent spot check) catches seams between units.
4. **Verify handoff**: the whole feature document, the assigned unit and its linked `S#` plus affected interactions, the baseline commit, and the probe command forms (tests, CLI, typecheck) for probes on isolated state in a fresh `mktemp -d` scratch copy, never just "read-only"; the runtime removes each subagent's own TMPDIR, which holds that copy; `gentle-ai-verify` holds the checklist. Future or unrelated requirements are out of scope, not unmet; final feature verification covers every `S#`. Resolve every in-scope unmet item before closing the unit; the writer commits its probes as regression tests.
5. **One correction**: verify blockers get one correction batch that fixes every reported blocker, then one re-verify limited to those blockers, never a new full sweep. Blockers still open after that stop as one **Needs your decision**. Advisories never start a correction. A second correction runs automatically only when the recheck shows the same blocker still failing; a new finding never earns one. A `partial` or `blocked` writer report gets only this correction, never an extra verify run beyond the risk tier's verifier; partial, blocked, unavailable, or exhausted proof left after it becomes that one **Needs your decision**.
