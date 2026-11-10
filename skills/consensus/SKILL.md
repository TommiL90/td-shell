---
name: consensus
description: 3-round consensus loop protocol between orchestrator and independent judges/critics for design, obligations, and code diffs before freeze or execution.
license: Apache-2.0
metadata:
  author: tomidev
  version: "1.0"
---

# Consensus Protocol

Multi-perspective alignment protocol ensuring architectural plans, observable obligations, and sensitive diffs withstand critical scrutiny before execution.

## Scope and Applicability

- For substantial planned work, judges review the same project plan before execution, even when the project does not define plan judges. Use project-owned formats, paths and acceptance IDs; incorporate accepted findings there, not in duplicate builtin artifacts.
- Project workflow and delivery remain authoritative. Respect explicit incompatible procedures; ask only about unresolved conflicts. Compatible project reviewers can fulfill the judge roles; keep independent critiques and orchestrator adjudication.
- Routing defaults fill undefined aspects and gaps: **Full Lean** requires pre-freeze plan/check critique and critique of sensitive diffs; **Checks-only** may use it for bounded high-risk contracts.
- Trivial/direct work needs no new plan or judge loop. Do not invent a plan solely to invoke judges.

## Protocol Rules

1. **Blind Judges**: Dispatch `jd-judge-a` and `jd-judge-b` concurrently. Neither judge sees the other's findings.
2. **Critique Focus**:
   - For the project's plan (`plan.md` in the fallback): Feasibility, unstated assumptions, missing alternatives, architectural debt, complexity leaks.
   - For project acceptance criteria (`checks.md` in the fallback): Unobservable criteria, missing boundary/negative tests, untestable contracts, weak assertions.
   - For diffs: Regressions, security/tenant bypasses, concurrency bugs, missing preservation tests.
3. **Orchestrator Adjudication**:
   - Orchestrator evaluates all judge findings.
   - Every finding is adjudicated explicitly:
     - `Accept`: Orchestrator updates the plan, checks, or code.
     - `Reject`: Orchestrator provides technical rationale with concrete evidence.
4. **3-Round Consensus Limit**:
   - Round 1: Initial critique and orchestrator response/refinements.
   - Round 2: Judges evaluate refinements and remaining open findings.
   - Round 3: Final critique iteration.
   - If consensus is reached (both judges confirm no open severe findings), freeze artifacts and proceed.
   - If judges and orchestrator cannot reach consensus after round 3, the orchestrator halts and presents the unresolved debate to the user for human decision.
   - Maximum 3 rounds; without consensus, stop and ask the user. Never reset the round count through a new session or renamed artifact.
5. **No Independent Actor Execution**: Judges critique only; the orchestrator refines plans/checks or directs `gentle-ai-worker`.
