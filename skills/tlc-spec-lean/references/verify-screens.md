# Independent visual review — local 2.1 adaptation

A visual reference binds when the request or approved plan says so. Save the reference and running
image at their actual viewport and scale; do not resize a wider capture afterward. Reviewers judge
actual pictures, not source code, the author’s assertions or a reopened application. Text unexpectedly
smaller than the reference may indicate a resized image: investigate and retake when needed. Image
dimensions alone do not prove the viewport or reliably detect resizing.

## Dispatch and evidence

1. Place the cited reference and running screenshots in the scoped feature or reference them by local
   repository/absolute image path in plan/checks. Capture the real runtime state first. Browser proofs
   retain their named `.running.png` under the feature; match each cited reference to its running twin.
2. Finalize `state.json`, checks, screenshots and code and run `check_proofs.py <feature>`. The state
   fingerprint includes explicit source scope, plan/checks, feature screenshots and cited local images
   even outside the feature. It supports dirty and untracked files without requiring a commit. Remote
   images must be saved locally as binding evidence; a URL alone cannot attest image bytes.
3. Before dispatch run `screen_state.py capture <feature>` and note its printed identity. Record the
   actual fresh visual reviewer, scope and dispatched status in `handoff.md`; it is an excluded report.
4. The independent reviewer (distinct from implementers) compares the reference and running image,
   records each relevant row as same/differs and writes `screens.md` with:

```markdown
**Verifier**: agent_id=<actual-independent-id>
**Round**: 1
**Reviewed state**: <identity printed by screen_state.py>

| Screen | Compared with | Verdict | Finding |
| --- | --- | --- | --- |
| example.running.png | example.png | matches | none |
```

5. Record the actual return in `handoff.md`, then run `screen_state.py confirm <feature>`. It refuses
   if scoped content or captures changed during review. `validate_verification.py` requires the
   confirmed state, independent declared reviewer, one round (1 or 2), and matching screen verdicts.
   The script checks identity and structure, not whether the human/model reviewer was authentic or
   whether the image actually matched.

## Corrections and second round

A finding means fix within the authorized scope and recapture at the reference viewport. If code,
inputs or images change after review, the old verdict is stale even if proof commands pass again.
Rerun affected proofs, capture a new screen state, and conduct round 2 using the previous inventory
where possible; flag regressions visible in rows previously marked same. Record the fresh state and
confirm after review. After round 2 unresolved differences go to the user; do not invent a PASS.

A screen state no reference draws needs appropriate test or runtime walk proof, not a fabricated
visual comparison. Preserve approved differences and report environment or browser limitations.
