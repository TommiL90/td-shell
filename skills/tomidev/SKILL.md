---
name: tomidev
description: Tomidev Shell development workflow. On-demand reference for lanes (Direct, Checks-only, Full Lean), feature contract in .agents/designs/features/<feature>/, Engram state tracking, consensus loop, and agent roles.
license: Apache-2.0
metadata:
  author: tomidev
  version: "1.0"
---

# Tomidev Shell Workflow

Personal development harness built around high signal, zero noise, senior-architect rigor, and explicit verification.

## Compose with the project

Project instructions own workflow/lane names, artifact paths and formats, tracking, acceptance and delivery. Use these defaults for undefined aspects and gaps, not as a parallel process. Do not create duplicate artifacts, task lists or Engram indexes. Keep useful builtin mechanisms, and respect explicit incompatible project rules; ask only about unresolved conflicts. No adapter file is needed. Trivial/direct work needs no new plan.

## 3 Delivery Lanes (fallback)

When project routing is undefined, select lane by risk and uncertainty:

1. **Direct**: Surgical fixes, copy/docs edits, or trivial changes with one obvious proof.
   - Run focused checks inline.
   - No feature directory, plan, or mutation quota needed.
2. **Checks-only**: Bounded behavior with known contracts and multiple observable obligations.
   - Author `.agents/designs/features/<feature>/checks.md` with Intent and frozen `C#` criteria.
   - Implement test-first and verify independently against obligations.
3. **Full Lean**: Complex logic, architecture changes, schema/persistence, auth/security, or destructive operations.
   - Four phases: Plan → Checks → Build → Independent Verify.
   - Artifacts stored in `.agents/designs/features/<feature>/` (`plan.md`, `checks.md`, `proofs.md`, `state.json`).
   - Track state in Engram under `features/<feature>/state`.

## Feature Contract & Engram

Reuse the project's tracking authority and identifiers. Only when tracking is undefined, features with explicit obligations track artifacts in `.agents/designs/features/<feature>/`:
- `plan.md`: Problem, proposed architecture, scope, and technical strategy.
- `checks.md`: Frozen observable criteria (`C1`, `C2`, ...), proof commands, and mutation targets.
- `proofs.md`: Execution output and verification evidence.
- `state.json`: Cryptographic identity of inputs, tools, and hashes.

Engram topic key: `features/<feature>/state`.

## Consensus Loop

For substantial planned work, even when the project does not define plan judges, review the same project plan before execution. Use its existing criteria and format; incorporate findings there, without a duplicate plan. Respect explicit incompatible project review procedures. In fallback routing this applies to Full Lean (optional for sensitive Checks-only), never trivial/direct work.
1. **Blind Critique**: Before implementation, dispatch `jd-judge-a` and `jd-judge-b` concurrently against that artifact (and on sensitive diffs).
2. **Orchestrator Adjudication**: Orchestrator answers every finding: `accept` (adjust artifacts) or `reject + evidence`.
3. **Consensus or Escalation**: Loop continues until all judges find no open severe defects, up to a maximum of 3 rounds. If consensus is not reached after round 3, stop and ask the user with the debate summary.
4. Orchestrator refines plan/checks before delegating implementation to `gentle-ai-worker`.

## Builtin Agents Roster

- **Primary Orchestrator**: Plans, adjudicates consensus, coordinates delegation, and answers user questions.
- **gentle-ai-explore**: Read-only repo scout for gathering context within tight budgets.
- **gentle-ai-worker**: Scoped writer restricted to allowed surfaces and `.agents/designs/features/`. Uses test-first on the project's acceptance criteria (`checks.md` in the fallback). Never commits or pushes.
- **gentle-ai-verify**: Read-only independent verification against project criteria (`checks.md` in the fallback), running proof commands and mutation probes (default 3).
- **jd-judge-a & jd-judge-b**: Independent blind judges critiquing design, obligations, and sensitive diffs.
- **review-risk, review-readability, review-reliability, review-resilience**: Specialized review lenses dispatched for code reviews.

## Strict Safety Constraints

- **Never commit or push automatically**: Commit or push only when the user asked for it in the current turn. The shell also asks the human to confirm each commit or push in a dialog, in every mode; headless and child sessions cannot approve one. A blocked commit or push means asking the human, never retrying around the block.
- **Never push to upstream**: Keep personal work contained.
- **No speculative scaffolding**: Write only code needed to satisfy the verified obligations.
