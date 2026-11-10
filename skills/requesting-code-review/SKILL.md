---
name: requesting-code-review
description: Review an in-scope diff for correctness, security, regressions, maintainability, and simplification. Findings grouped by Critical/Important/Minor with file:line, mechanism, impact, and fix, accompanied by simplification tags and a clear readiness verdict.
license: Apache-2.0
metadata:
  author: tomidev
  version: "1.0"
---

# Code Review Protocol

Own defects, regressions, security risks, maintainability issues, and unnecessary complexity in changed code.

## Review Responsibility and Scope

- Review the actual diff against the base/target branch (committed, staged, and working tree changes).
- Reviewers are strictly read-only: inspect, evaluate, and report. Never edit code, stage files, or run commits.
- Base review on approved requirements/plan/checks, changed files, and existing verification evidence.
- Do not repeat acceptance testing or run full test suites unless investigating a specific defect.

## Specialist Review Lenses

The orchestrator or developer selects relevant review lenses according to the touched surface:
- **review-risk**: Authorization, tenant boundaries, data loss, regression risk, security implications.
- **review-readability**: Cognitive load, naming, structure, adherence to `clean-code` guard clauses and shallow control flow.
- **review-reliability**: Error handling, resource lifecycle, async race conditions, concurrency, state synchronization.
- **review-resilience**: Network failures, timeout handling, retries, degradation paths, operational observability.

## Simplification Review

Examine in-scope code for opportunities to reduce unnecessary complexity using standard tags:
- `delete`: Dead code or obsolete configuration.
- `stdlib`: Custom code duplicating standard library capabilities.
- `native`: Unnecessary dependencies or wrappers where platform native features suffice.
- `reuse`: Duplication of existing repo utilities (must cite path).
- `yagni`: Premature generalizations and speculative abstractions.
- `shrink`: Clearer, more concise expressions of identical logic.

## Output Format

Every review must output structured findings grouped by severity, followed by the simplification tags line and the readiness verdict:

```markdown
### Critical
- `path/to/file.ext:42`: [Mechanism] Unhandled null dereference in payment callback. [Impact] Process crashes on missing optional receipt. [Fix] Add guard clause `if (!receipt) return fallbackReceipt;`.

### Important
- `path/to/file.ext:105`: [Mechanism] Missing tenant scope in cache key. [Impact] Cross-tenant cache pollution on multi-tenant reads. [Fix] Prefix key with `tenantId`.

### Minor
- `path/to/file.ext:15`: [Mechanism] Redundant type assertion. [Impact] Bypasses compiler type narrowing. [Fix] Use TypeScript type guard.

### Simplifications
- `path/to/file.ext:60` — `stdlib`: Custom debounce helper duplicates runtime timer utility → replace with native runtime helper; non-blocking.

Tags: [none | delete | stdlib | native | reuse | yagni | shrink]
Ready: Yes | Ready: With fixes | Ready: No
```

- **Ready: Yes**: No Critical or Important findings. Minor or non-blocking simplification suggestions may exist.
- **Ready: With fixes**: Important findings present that should be addressed before landing, but architectural approach is sound.
- **Ready: No**: Critical defects, security vulnerabilities, or fundamental architectural flaws.
