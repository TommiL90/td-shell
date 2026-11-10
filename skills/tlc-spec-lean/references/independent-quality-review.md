# Independent quality review

Normal checks-only/full Lean closure needs one fresh Verifier, distinct from every implementer.
Sensitive auth/roles/tenant/persistence/destructive or broad cross-repo contract changes additionally
need two fresh read-only reviewers, distinct from the author, Verifier and each other:

- Test reviewer: applicable repository test skill; assertions, negative boundaries, fixtures/doubles,
  runner selection and meaningful discrimination. Reuse actual command evidence when current.
- Code reviewer: applicable repository architecture/code-quality skills; security, scope, contract,
  maintainability and regressions. Do not implement opportunistic cleanups during review.

Record actual agent IDs and scopes in verification.md, with separate acceptance/test/code outcomes.
One report is enough; requesting-code-review may contribute diff findings without a duplicate
lifecycle. Missing capacity means serial fresh contexts or an explicitly pending independent gate.
Never label an author re-read independent. Reviewers do not automatically run full suites.
