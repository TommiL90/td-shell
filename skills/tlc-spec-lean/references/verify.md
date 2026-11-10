# Verify

The author runs mechanical proofs; an independent fresh Verifier judges their meaning. Read the
approved intent/checks, actual diff (including untracked input), assertions and current proofs.
Inspect test selection and negative paths, tenant/authorization boundaries, regressions and two
plausible edge examples. Do not simply repeat the author's explanation or rerun unchanged evidence.
For sensitive changes apply independent-quality-review.md in the same closure report.

Default mutation count is 3 for meaningful behavior. The Verifier selects concrete wrong-rule
replacements in mutations.json; use mutate.py --help for its schema and flags. Each baseline must
be green, each replacement occur exactly once, and the actual selected proof fail for the intended
reason. All changes occur in a scratch copy; timeout and infrastructure failures are blocked.
For documentation/mechanical changes use Mutations: 0 with a reason, not fabricated mutations.

Write verification.md with **Verifier**: agent_id=<actual-id>, **Verdict**: PASS or INCOMPLETE/FAIL,
**Reviewed state**: <current-64-character-identity>, and ## Findings.
The reviewed state is mandatory even with no findings. A changed state requires affected
independent re-review; rerunning proofs alone cannot refresh an old independent verdict. If none, write None with what was checked. Otherwise use a table with Finding,
Evidence, Severity and Closed. After a correction, rerun affected proofs and close each finding with
state:<current-64-character-identity> Cn. An old commit or a bare 'fixed' does not close a finding.
Sensitive reports also include **Test reviewer** and **Code reviewer**, each a distinct agent_id.
State identities bind files, not human/agent identity; the coordinator must verify real assignments.

Run check_proofs.py <feature> --mutations <spec> after controls/probes are final, then
validate_verification.py <feature>. A nonzero exit or pending review/runtime evidence prevents PASS.
Do not force a commit, overwrite user work or self-verify because another reviewer is unavailable.
A binding capture also needs the separate picture judgement in verify-screens.md.

## State and final verdict

Present the final validator result first, including a failing or INCOMPLETE gate. Visual review uses the protocol in verify-screens.md and binds current scoped state and image bytes, not merely a commit. An opt-in plan approval gate checks only record presence; the coordinator validates real authority and scope.
