---
name: testing
description: Agnostic software testing rules and discipline. 19 core testing rules covering RED/GREEN cycles, deterministic verification, boundary mocking, assertion rigor, preservation tests, and mutation probes.
license: Apache-2.0
metadata:
  author: tomidev
  version: "1.0"
---

# Testing Discipline & 19 Agnostic Rules

Apply these 19 rules across all test creation, execution, and verification. Stack mechanics (runner commands, directory layout, assertion libraries) are delegated to repository conventions; these rules govern testing rigor.

## The 19 Agnostic Testing Rules

1. **Deterministic runnable cycle only**: Apply RED-GREEN-REFACTOR cycles only for runnable, deterministic behavior. Do not force synthetic cycles for passive docs or untestable configuration.
2. **Observed RED for the intended reason**: When running test-first, ensure the test fails specifically because the target behavior is missing, not due to compilation errors, bad imports, or typos.
3. **One RED per spec/check rule**: Map each observable obligation or `checks.md` `C#` item to a focused test case.
4. **Contrasting cases catch plausible errors**: Add contrasting negative or alternative cases only when they guard against plausible incorrect implementations (e.g. hardcoded returns).
5. **Every observable effect**: Verify all observable outcomes of an operation (return values, state changes, emitted events, database records, side effects).
6. **Public interface only**: Test through public contracts, APIs, or user interactions. Never assert against private fields, internal functions, or ephemeral implementation state.
7. **Named examples, boundaries, and errors**: Test nominal paths, boundaries, and error conditions. Provide at least one explicit test case per enumerated member or status variant.
8. **Cheapest sufficient level**: Test at the lowest/fastest layer that completely verifies the requirement (unit > integration > e2e).
9. **Mock external boundaries only; no call-counts**: Mock only external network calls, hardware boundaries, and third-party services. Never mock internal domain objects. Avoid fragile call-count assertions (`toHaveBeenCalledTimes`) unless frequency is an explicit business requirement.
10. **Absolute determinism**: Tests must never be flaky. Control time, timers, unseeded randomness, and asynchronous ordering explicitly.
11. **One PRESERVE test per touched behavior**: Before modifying existing behavior, write or verify a PRESERVE test to prove existing invariants are maintained; run differential checks when shared code changes.
12. **Never weaken assertions**: Never loosen assertion thresholds, delete existing checks, or ignore assertions to make a test pass. Ask the user when the contract is ambiguous.
13. **Cite title/selector; skipped never counts**: Always report the exact test title, file path, or runner selector. Skipped, disabled, or timed-out tests never count as proof.
14. **Focused first, widen on shared impact**: Run targeted tests first during development. Widen to the full suite only when shared contracts or global infrastructure change.
15. **Report verifiable evidence**: Always report the exact command run, exit code, passing/failing test count, and duration.
16. **Lane-gated mutation probes (default 3)**: On sensitive or Full Lean features, verify test quality by introducing at least 3 mutation probes to confirm tests fail when logic is altered.
17. **Clean environment and isolation**: Every test must leave the environment clean. Isolate database changes, roll back transactions, clear file artifacts, and restore mocks.
18. **Linear, obvious test logic**: Test code must be straightforward and readable. Avoid conditionals, loops, or complex helpers inside test bodies.
19. **Repo stack skills own runner mechanics**: Runner flags, test file locations, snapshot conventions, and UI testing libraries are dictated by the target repository's stack skills.
