---
name: delivery
description: Prepare clean, reviewable commits and pull requests. Merges work-unit commit slicing, Conventional Commits, PR descriptions with Risk and C# coverage, and pragmatic split recommendations.
license: Apache-2.0
metadata:
  author: tomidev
  version: "1.0"
---

# Delivery: Commits & Pull Requests

Prepare commits and pull requests with minimal cognitive load, clear risk assessment, and solid verification evidence.

## Golden Rule

**Never commit or push automatically.** Stage and commit only when the user explicitly requests it in the current turn, usually after code review. The shell also asks the human to confirm each commit or push in a dialog; before an approved commit it runs `.agents/scripts/private_harness_guard.py` when present, and a declined, unavailable or failing confirmation or guard stops the commit. Never push to upstream remotes.

## Work-Unit Commit Slicing

When committing is requested:
1. **Commit by deliverable work unit**: Each commit represents a coherent, independently verifiable behavior, fix, or migration.
2. **Keep tests and docs with code**: Tests and documentation changes belong in the same commit as the code they describe or verify.
3. **Conventional Commits**: Format commit titles as `<type>(<scope>): <summary>` (e.g. `feat(auth): add session token rotation`, `fix(cli): resolve path expansion on mac`).
4. **Clean repo state**: The repository should build and pass tests after every individual commit.

## PR Description Format

Structure the PR body to maximize reviewer empathy and progressive disclosure:

```markdown
## Summary
<One paragraph: what was done, why it was done, and what outcome it delivers.>

## Risk
Risk: [Direct | Bounded | Sensitive] — <Brief rationale>

## Checks & Verification
- `C1`: <Obligation> — Verified via <test/proof selector>
- `C2`: <Obligation> — Verified via <test/proof selector>

## Evidence
- Command: `<command>`
- Output: `<test count passed, exit code 0>`

## Split Recommendation
<!-- Include ONLY if diff_budget reports >400 production lines and >=2 independent units -->
- Recommend splitting into 2 PRs: [Unit A description] and [Unit B description].
```

## Review Budget & Split Heuristic

- Aim for PRs under ~400 lines of authored production code.
- Never compress code, remove comments, or delete tests to fit under line budgets.
- Recommend a split only when `diff_budget` reports >400 production lines and >=2 independent units. Give one concise recommendation line, not a strategy menu or automatic chain. Otherwise, keep the coherent change together. A recommendation never authorizes staging, commits, push, PR creation, or merge.
