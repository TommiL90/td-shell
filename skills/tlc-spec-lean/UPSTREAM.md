# Upstream provenance

Source: https://github.com/tech-leads-club/agent-skills/tree/65ca25bf3e068d37e108e769c481faadcf938c6b/packages/skills-catalog/skills/(development)/tlc-spec-lean/
Pinned commit: `65ca25bf3e068d37e108e769c481faadcf938c6b`

2.1 update adapted from upstream `eec04107f480ae47e5edf8f91242172917c3cc93`; local working-tree
identity and prior authorization take precedence over upstream's commit-only and exact-quote gates.

All upstream skill files were fetched from the recursive tree before adaptation.
Root license copied as LICENSE.upstream; file-level notices retained.

Adaptations: artifact paths; proportional routing; worktree-state evidence and explicit commit authorization. Repository-specific policy comes from the consuming repository (its `AGENTS.md` and `.agents/skills`), never from this skill. No external runtime or installation is required.

Local fix (2026-11-04): `scripts/mutate.py` excludes `.codegraph` when it copies the tree for mutations; its `daemon.sock` Unix socket made `shutil.copytree` fail and block every mutation run.
