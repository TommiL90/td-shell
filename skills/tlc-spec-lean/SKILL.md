---
name: tlc-spec-lean
description: Proportional feature delivery with approved intent, frozen observable checks, implementation and independent verification. Use for complex or sensitive work, checks-only bounded behavior, or explicit Lean invocation. Direct trivial work uses focused verification without feature artifacts.
license: CC-BY-4.0
metadata:
  author: Tech Leads Club; tomidev adaptation
  version: '2.1.0'
---

# Spec Lean

Freeze obligations, allow the implementation path to evolve, and prove the result independently.
Read the repository AGENTS.md first. Technical skills remain the authority for their
surface. When this skill is selected by the project or user, its lifecycle, artifact schema and validators below apply. Do not impose this schema or its validators on a different project workflow. Integrate proportional builtin judges over the project's same plan before execution where compatible; the orchestrator incorporates findings there using the consensus protocol. Do not create a parallel Lean plan or tracking index solely to obtain review. See [provenance](UPSTREAM.md).

## Route by risk and uncertainty

- **Direct:** clear, reversible copy/style/docs/mechanical edits or a surgical fix with one obvious
  proof. State scope, implement, run focused checks. No plan, mutation quota or feature review.
- **Checks-only:** bounded behavior with agreed contract and several observable obligations.
  Write checks.md with Intent; skip plan.md. Build and independently verify that scope.
- **Full Lean:** unclear requirements, architectural choices, new workflows, cross-repo contracts,
  auth/tenant/permissions, persistence/schema or destructive behavior. Plan → Checks → Build → Verify.
  Explicit Lean invocation follows its requested phases. File count never decides the lane.

One adequate approved design is enough. Existing user authorization carries forward; do not reopen
settled decisions. Ask only about material unresolved product/design decisions or explicit gates.
Read-only review does not authorize implementation. Never auto-commit, push, deploy or mutate data.
Record real user approvals and scope decisions in the existing plan or checks when applicable, with
date and source; quote the user only when their actual words are available. Never invent consent,
require a new approval for an already authorized action, or retrofit an exact format onto old plans.
When an explicit approval gate is required for a new plan, use `**Approval gate**: required` and
`**Authorization**: <date, real user authorization and source>` in plan.md. An existing applicable
authorization may be recorded; do not request it again. Both checks and closure validate the
record's presence only: a script cannot authenticate consent or determine its scope.

## Invariants

1. Each check states one observable claim and its decisive proof. Tests come from requirements,
   not from copying the implementation. Keep technical test-first policies where applicable.
2. Freeze checks after validation. Append discovered obligations. Changing an agreed obligation
   requires explaining the requirement change; do not weaken a test to hide a regression.
3. Proofs apply to an explicit content-addressed working-tree scope, including dirty/untracked
   code, tests, dependencies, config/schema and obligation/probe files. No clean tree or commit
   is required. Include every relevant input in state.json; hashes cannot discover omitted inputs.
4. A fresh independent Verifier reviews checks, real diff and assertions. Record actual agent_id;
   never invent a handoff. Sensitive work also needs distinct test-quality and code-quality
   reviewers. See [review responsibilities](references/independent-quality-review.md).
5. Mutations default to 3 for behavior work. Select meaningful probes where a wrong rule could
   stay green. Docs/mechanical-only work can declare 0 with a concrete N/A reason. Mutations run
   in a disposable copy, including dirty/untracked inputs; never mutate the live working tree.
   A timeout, missing test, skipped test or broken runner does not prove a mutant was killed.
6. Binding visual sources remain binding. Save actual runtime pictures at their source layout
   size and request independent picture comparison when relevant; see verify-screens.md.
   Browser access is conditional on runtime evidence needed, not part of harness installation.
7. Completion requires current passing proofs and validate_verification.py exit 0. Missing
   independent reviewers or environment evidence means INCOMPLETE, never an invented PASS.
8. Reuse unchanged current evidence; rerun affected or stale checks. No repeated clean-pass loops.
   A script validates structure/state and exits, not semantic correctness or reviewer authenticity.
9. Persist delegated roles, exact assigned scope, state and dispatched/returned status in feature
   `handoff.md` before dispatch and after return. It is a mutable report, excluded from input hashes;
   keep frozen checks and proofs in their existing files. After compaction re-read this skill and the
   active phase reference, then resume from artifacts and current state, not inferred chat history.
10. When a visual reference binds, capture at its actual viewport and scale, without resizing a
    larger screenshot afterward. A fresh independent reviewer judges the actual images; typography
    unexpectedly smaller can indicate a resized capture and warrants retaking or investigation.
    Bind review before/after to the scoped working tree and image bytes; screenshots alone cannot
    prove their viewport or detect resizing automatically. See verify-screens.md.

## Local artifacts

Use .agents/designs/features/<feature>/ for plan.md (full lane), checks.md, state.json,
proof-state.json, proofs.md, mutations.json and verification.md. Captures and screens.md are
conditional. Keep STATE.md/lessons.json/LESSONS.md at .agents/designs/ when needed. Existing
specs/plans/validations remain usable; do not mass-convert or create duplicate feature truths.
All harness, designs and memory identity files stay local and ignored; never stage or publish.

## Commands

Resolve <skill-dir> to this directory. Use Python 3.9+ and Git. Prefix shell invocations with rtk.
Append --root <repo> to each feature/script command in the table when outside that repo.
Never run Git at the workspace root. selftest.py uses its own scratch repo.

| When | Script and arguments |
| --- | --- |
| Full plan ready | validate_plan.py <feature> |
| Obligations ready | validate_checks.py <feature> |
| Before proofs | state_identity.py <feature> --base <base-ref> --file <each-relative-input> --implementer <actual-id> --risk bounded\|sensitive --context <runtime/dependency-context> |
| Run mechanical proofs | check_proofs.py <feature> [--mutations <feature>/mutations.json] |
| Before / after visual review | screen_state.py capture <feature> / screen_state.py confirm <feature> |
| Final closure | validate_verification.py <feature> |
| Only after user requests a commit | check_commit.py --message <message> |
| After script changes | selftest.py |

The state command declares scope; check_proofs captures it before/after execution. Changing HEAD,
base, scoped bytes/modes, controls or probes invalidates evidence. Scope config/lockfiles too.
Record external runtime versions/environment in context; explicitly reissue context and rerun when
those change. Generated reports are excluded to avoid circular hashes.
Lead the final report with the actual final validation result; a failed or incomplete gate is not PASS.

## References

[Plan](references/plan.md) · [Checks](references/checks.md) · [Build](references/build.md) ·
[Verify](references/verify.md) · [Screens](references/verify-screens.md) ·
[Engram and decisions](references/memory.md) · [Delivery size](references/delivery.md).

When the host lacks independent agents, request a fresh separate review session and report the
pending gate. Never silently fall back to self-verification. Ordinary direct edits do not need it.
