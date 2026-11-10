# tomidev-shell — fork notes

Personal fork of [gentle-shell](https://github.com/Gentleman-Programming/gentle-shell)
(MIT; keep the original `LICENSE` and copyright notice). Forked from `main` at
`d17c6f98c` (directly after the `v4.7.0` release commit `8e11f0e`). Remote `upstream` is fetch-only (push disabled).
No GitHub fork/remote of our own exists yet.

## Goal

Adapt gentle-shell's Pi infrastructure (runtime enforcement, subagents, Engram
integration) to run **my own harness** instead of ODD/RDD. For personal use only.

## Design principles (decided 2026-11-07)

1. **Rules vs. engine.** The rules stay tool-agnostic in each repo (`AGENTS.md`,
   `.agents/skills`, `tlc-spec-lean`, `.agents/scripts`). This shell only *enforces and
   reads* them; it must not redefine them. Claude Code / Codex keep working with the
   same rules, just without enforcement.
2. **Assume the shared repo layout:** `.agents/skills/`, `.agents/agents/`,
   `.agents/designs/features/<feature>/`, `.engram/config.json`,
   `.agents/scripts/private_harness_guard.py`, `diff_budget.py`.
3. **Keep the fixed prompt purposeful.** Token measurements diagnose duplication and inherited overhead;
   minimizing tokens is not the fork's objective or a release gate. The earlier ~10–15k target is advisory,
   not a reason to remove useful capabilities.
4. **Compose with the project harness.** Project instructions define the workflow, artifacts, formats,
   paths and acceptance criteria. Builtin mechanisms complement that workflow rather than replacing it:
   when a project requires a plan but does not define plan reviewers, Tomidev's judges review that same
   plan before execution. The orchestrator incorporates findings into the existing artifact; no parallel
   plan or tracking. Apply proportionately, not to trivial work. Respect explicit project prohibitions
   and incompatible procedures; ask only for unresolved conflicts. Runtime safety remains binding.
   Builtin lanes, tracking and delivery are defaults where the project leaves those aspects undefined,
   not mandatory competing policies. No new per-project adapter file.

## What conflicts today (to remove or replace)

- ODD work-unit commits (hardcoded exception) → never commit without explicit request.
- `odd/tasks/<feature>.md` hardcoded (`lib/bounded-writer-admission.ts`,
  `lib/design-handoffs.ts`, `assets/orchestrator-memory.md`) → use
  `.agents/designs/features/<feature>/`.
- ODD small/large sizing → Lean lanes Direct / Checks-only / Full Lean.
- RDD native review (default on; failed with `lens_context_budget_exceeded` on a big
  branch) → off; review is `requesting-code-review` on explicit request.
- Subagents only from `.pi/agents` and `.pi/subagents` (`lib/agents-config.ts`) →
  also load `.agents/agents/*.md`.

## MVP backlog (value/cost order)

1. Commit/publish guard: block commit/push without explicit request; run
   `private_harness_guard.py` before commit (replaces `.agents/hooks/gate.sh`, which
   does not run in Pi).
2. Subagents from `.agents/agents/` so reviewer/tester are real independent reviewers.
3. Lane router: load `tlc-spec-lean` only for Checks-only / Full Lean.
4. Engram feature index `features/<feature>/state` (already written into each
   repo `AGENTS.md`), enforced by the shell.
5. Exploration budget (reuse gentle-shell's idea; most complex).

Keep `gentle-engram` for memory (separate package; confirm it works without gentle-pi).

## Before writing code (spike)

- Read Pi docs: extensions, packages, subagents, `.pi/APPEND_SYSTEM.md`.
- Map which gentle-shell modules to keep, strip, or replace (it is large:
  `extensions/gentle-ai.ts` alone is 12k+ lines).
- Decide upstream-sync strategy (rebase vs. periodic cherry-pick).

## Strategy (decided 2026-11-08)

Work layer by layer through gentle-shell, deciding KEEP / CHANGE / REMOVE per feature
before touching code. Layer 1: the Gentle Shell launcher (`bin/gentle-shell.mjs`,
`runtime/gentle-shell-*.mjs`, `scripts/bundled-install.mjs`) + shell UI
(`extensions/gentle-shell.ts`, `lib/shell-*.ts`). Coupling to resolve first:
`gentle-agents.ts:73` imports `openInExternalEditor` from `gentle-shell.ts`;
`lib/exploration-budget.ts` depends on `lib/odd-phase-inference.ts`.

## Prompt / agents / skills analysis (2026-11-08, read-only)

Package-owned input today ≈ 78 KB ≈ 19-20k tokens (estimates): gentle prompt ~25 KB (identity
1.6K, work continuity 6K, ODD steps 5.6K, principles 2.7K, orchestrator.md 9.2K), RDD review contract
11.5K (still injected when the gentle-ai binary is missing: status "unknown" ≠ off), tool guidelines
~12.7K (gentle_review alone 6.6K), tool schemas ~27K (gentle_review* ~6.6K, subagent_* 3.9K,
orchestrator_* 5.4K, background 2.9K, ask 2.9K, design 2.1K). Removing ODD+RDD and keeping generic
tools ≈ 25 KB ≈ 6k tokens. The package explains only ~1/3 of the measured 58.5k; the rest needs a real
`before_provider_request` payload dump (skills index, context files, Pi builtins, gentle-engram).
- Agents: all 11 builtins + 4r chain are ODD/RDD/Judgment Day; generic safety guards are separate
  (child-safety, sensitive-path, destructive, writer surfaces/worktree). `.agents/agents` = one root in
  lib/agents-config.ts + Claude tool-name mapping (Glob→find) + never `model: inherit`. The model panel
  rewrites subagents.json and agent frontmatter at session start; the active profile wins.
- Skills: builtin catalog only ~1.2k tokens (not the lever). Remove RDD/ODD/persona skills, move
  generic ones to repo `.agents/skills`.

Decisions after the analysis (user, 2026-11-08):
- Keep ODD in principle, but adapt its workflow to the harness the user built in
  Openclick/Smartbase-node, Openclick/Smartbase-front, Openclick/preact and
  Agence/harpia-project/harpia-front (AGENTS.md workflow, tlc skill, requesting-code-review,
  clean-code (node) / anti-conditional-architecture (others), to be made language/framework generic).
- RDD, builtin agents and builtin skills: evaluate one by one whether each fits that harness,
  should be refactored, or removed ("vamos listando y analizando de a uno").
- Identity: minimal "Tomidev Shell" + the consolidated senior-architect persona.

## User harness map (4 repos, read-only, 2026-11-08)

Common to all AGENTS.md: lanes Direct / Checks-only / Full Lean by risk (not size); Full = Plan →
Checks → Build → Verify; artifacts `.agents/designs/features/<f>/` (plan, checks C#, state.json,
proofs, mutations, verification, handoff); Engram `features/<f>/state`; never stage/commit/push
unless asked + `private_harness_guard.py` before commit; nearest gate first; mutations default 3;
diff budget ~400 prod lines advisory; Full closure needs a fresh Verifier (+2 reviewers when
sensitive), else INCOMPLETE; `requesting-code-review` only on request/final checkpoint; close with
`Risk:` + failed/skipped/pending checks. Divergences: 3 copies of tlc-spec-lean, 3 review templates,
anti-conditional drift; harpia lacks a gate table. Only Smartbase-node has enforceable agents
(orchestrator, verifier, code-reviewer, prisma-sql-reviewer, tenant-security-reviewer). Proposed
per-repo adapter `.agents/harness.json` (project, gates, risk_paths, review skills, diff budget,
private policy). ODD ↔ harness mapping: small/large → lanes; odd/tasks doc → .agents/designs/features;
Engram odd/<f>/tasks → features/<f>/state; gentle-ai-verify → Verifier; RDD → requesting-code-review.

Decisions (user, 2026-11-08, after the harness map):
- RDD: remove entirely (gentle_review* tools, contract, UI, gentle-ai binary); review = requesting-code-review
  + independent verifier/reviewers.
- Generic shared skills and agents (tlc-spec-lean, requesting-code-review, anti-conditional/clean-code,
  verifier, reviewers) ship BUILTIN in tomidev-shell; repos keep only their adapter + stack skills.
- Adopt the harness feature contract (`.agents/designs/features/<f>/`, Engram `features/<f>/state`) as the
  ODD tracking replacement, plus a per-repo adapter `.agents/harness.json`.
- Next: audit builtin agents and skills one by one before touching code.

Agent audit round 1 (user, 2026-11-08): verifier = adapt (gentle-ai-verify + Node verifier: checks.md
C#, Proof, mutations, PASS/FAIL/INCOMPLETE, no edit); worker = adapt (allowed surfaces + worktree +
test-first on checks.md, no commits, no RDD, may write .agents/designs/features). explore/agents: "adaptar
los agentes para que funcionen ODD + mi tlc ... me gusta la idea del agente orquestador ... dependiendo del
plan creado por orquestador necesite un agente refutador, juez o verificador para analizar los planes y
checks y asi refinarlos". Proposed roster: orchestrator (primary), explore, refuter (pre-freeze attack on
plan/checks), judge x2 blind (sensitive Full Lean), worker, verifier, code-reviewer, test-reviewer; remove
jd-fix-agent, Judgment Day rounds/ledger, 4r chain; domain reviewers stay per repo via adapter risk_paths.

Corrections (user, 2026-11-08): herdr-orchestrator (~/.gemini/config/skills/herdr-orchestrator) was only an
example of a past attempt, NOT the base — "el agente explorador actual me parece correcto solo que hay que
adaptar": base = current builtin agents, adapted. Models: "debe quedar como ya esta configurado hoy en el
proyecto, que usuario elige modelo" (no role chains). Critique loop: "depende de que plan y/o checks esten en
consenso entre agente orquestador y agente revisores o jueces" (until consensus, no fixed round count).

Agent audit round 2 (user, 2026-11-08): jd-judge-a/b = adapt as blind judges of plan.md/checks.md before
freeze (and the diff on sensitive work), no JSON ledger/JD rounds; review-risk/readability/reliability/
resilience = adapt as specialized reviewers the orchestrator selects per change for requesting-code-review
(live diff, file:line, simplification tags); 4r-review chain = remove; jd-fix-agent = remove (parent decision,
user delegated it). Debate rule (user): "deben quedar en loop discutiendo y si despues de 3 rondas no llegan a
consenso me deben preguntar. y los ajustes lo hace el agente orquestador antes de delegar la ejecucion para el
worker". Parent additions: orchestrator answers each finding accept/reject+evidence; consensus = every judge
reports no open severe finding; post-build findings → orchestrator turns them into plan/checks adjustment or a
fix brief executed by the worker; loop applies to Full Lean (optional Checks-only), never Direct.

Skill audit round 1 (user, 2026-11-08): gentle-ai → replace with a short on-demand `tomidev` skill (adapted
workflow: lanes, feature contract, consensus loop, when to use each agent); rdd-defect-workflow → remove;
judgment-day → adapt as the consensus-loop protocol (blind judges, accept/reject+evidence, consensus or 3 rounds
→ ask user); skills/_shared/review-ledger-contract.md → remove.

Skill audit round 2 (2026-11-08): branch-pr → adapt (user); issue-creation → remove (user, uses Jira);
chained-pr + work-unit-commits → merged into branch-pr renamed `delivery` (parent decision; user asked to avoid
overengineering and commits once after code review): commit slicing as today (tests/docs with code,
Conventional Commits) + PR body (Risk, checks, C# coverage) + one split recommendation line only when
diff_budget.py reports >400 prod lines and ≥2 independent units; no chain machinery.

Skill audit round 3 (user, 2026-11-08): skill-creator, skill-improver, skill-registry → remove all three
("yo creo skills con claude code o codex si es necesario"); cognitive-doc-design → remove (useful PR rules
folded into `delivery`); comment-writer → adapt (drop Gentle policy); design + gentle-ui-design → decide with
the UI-extension audit; tui-design → move to tomidev-shell/.agents/skills (repo-local).

Skill audit round 4 (user, 2026-11-08): tlc-spec-lean → one builtin copy, project-agnostic ("es agnotico al
tipo de proyecto, debe mantenerse asi ... se adaptan a las otras skills especificas del repositorio"); unify the 3
divergent copies, no project layer inside. requesting-code-review → builtin, template combined (parent): findings by
Critical/Important/Minor with file:line, mechanism, impact, fix + simplification tags line + verdict Ready:
Yes/With fixes/No. clean-code → fuse anti-conditional + typescript-clean-code, language/framework agnostic, keeping
the rules, and it is the code-generation style ("evitar anidamientos de try catch, usar lookup objects etc.").
Testing → new agnostic builtin skill from the test rules of the 4 repos, adapted to gentle-shell's test rules.

Testing skill (parent, from the 4-repo test-rule map, 2026-11-08): builtin agnostic `testing` skill with 19 rules
(cycle only for runnable deterministic behavior; observed RED for the intended reason; one RED per rule from
spec/checks; contrasting case only when it catches a plausible wrong implementation; every observable effect;
public interface only; named examples/boundaries/errors, one case per enumerated member; cheapest sufficient
level; mock only external boundaries/own adapters, no call-count assertions; determinism; one PRESERVE test per
touched behavior + conditional differential check; never weaken assertions, ask on unclear contract; cite
title/selector, skipped/timeout never count; focused first, widen on shared impact; report evidence; lane-gated
mutation probes default 3). Stack mechanics (commands, layout, runner, testid/userEvent choices) stay in each repo's
stack test skill.

Adapter dropped (user, 2026-11-08): no `.agents/harness.json`; the shell follows the Codex/Claude Code principle and
reads existing repo conventions only. Implementation plan: odd/tasks/tomidev-harness.md (T1-T7).

## Design canvas decision

Keep the design canvas as an integrated, optional Tomidev capability, adapted to each project's skills
and conventions. Before starting a design workflow, ask whether the user prefers the canvas, direct
implementation in the application, or the repository-defined workflow. Do not automatically impose
canvas artifacts or the builtin design skill. Respect the selected route and existing project artifacts;
ask only when entering the workflow, not at every step. If the repo defines no design workflow, explain
that rather than inventing one. Explicit project prohibitions and runtime safety remain binding.

User: "conservarlo como una capacidad integrada de Tomidev, adaptada a las skills y convenciones de cada
 proyecto, pero opcional, se debe preguntar a usario si prefiere asi, directo o como diga el repositorio".

## Banner and Omni follow-up

Keep the startup banner. User reports that the loaded theme does not show the expected official Omni
colors. Diagnose the shipped palette, theme selection/migration, overrides and renderer before changing
colors; use official getomni/omni, visual-studio-code, alacritty, iterm and neovim sources as reference.
Do not claim actual visual fidelity from JSON values alone or change private home configuration without
permission. Track as T18 in odd/tasks/tomidev-harness.md.

## GitHub star solicitation decision

Remove the star solicitation capability: automatic notices, dedicated shortcuts/buttons and actions to
star upstream repositories. Preserve original project attribution/LICENSE and unrelated user settings/data.
User: "quitalo" (reply to removing the star prompt). No replacement solicitation for the fork.

## Voice decision

Keep the existing voice capability unchanged. User: "dejala" (reply to keep/adapt/remove voice).
This supersedes the historical spike recommendation to strip gentle-voice. No voice refactor authorized.

## Music decision

Keep the existing music capability unchanged. User: "conserva" (reply to keep/adapt/remove music).
This supersedes the historical spike recommendation to strip gentle-music. No music refactor authorized.

## Guided tour decision

Remove the interactive guided tour: `/td:guide`, its model tool, automatic suggestions and dedicated
runtime assets. Preserve shared UI components and unrelated user settings/data. Keep useful documentation
and feature explanations so the agent can answer how Tomidev works when the user forgets. Remove obsolete
tour-operation references, not product knowledge; consolidate reusable explanations in existing reference
docs rather than introducing a new knowledge system or injecting all docs into every prompt.
User: "quitala"; clarification: "pero manten el contexto para que sepas como funciona algo de tomidev si me olvido".
No commits requested.

## Spike findings (2026-11-08)

Pi core (pi-coding-agent 1.5.0 docs):
- Package = `package.json` `pi` field (extensions/skills/prompts/themes); local install
  `pi install ./path` (loaded in place); settings can filter resources (`!glob`, `-path`).
- Enforcement: `pi.on("tool_call")` → `{ block: true, reason }` (bash command string
  only; wrappers/scripts bypass it, so real git safety also needs git hooks).
  `user_bash` covers `!` commands.
- Prompt: `before_agent_start` mutates `event.systemPromptOptions` (`sections`,
  `selectedTools`, `appendSystemPrompt`, `contextFiles`, `skills`) or forces a prompt.
  `.pi/SYSTEM.md` replaces, `.pi/APPEND_SYSTEM.md` appends; AGENTS.md/CLAUDE.md load from
  cwd + parents.
- No native subagents in core (example spawns `pi` subprocesses). Context hooks:
  `context`, `before_provider_request`, `session_before_compact`, `ctx.getContextUsage()`.

This repo (gentle-pi 4.7.0):
- Prompt injected at `extensions/gentle-ai.ts:12533` (`before_agent_start`) via
  `buildGentlePrompt` (`:1602`) + `assets/orchestrator*.md` + review contract (`:1477`);
  other appenders: gentle-todo (`:374`), gentle-design, gentle-guide, skill-registry,
  gentle-agents. Big token cost also from ~9 `gentle_review*` + ~8 orchestrator tool schemas.
- Subagents: `extensions/gentle-agents.ts` (3.3k lines, imports ~68 lib modules; each
  child is `pi --mode rpc`). Loader `lib/agents-config.ts:208-236` → add
  `.agents/agents` roots there.
- Guards: `gentle-ai.ts:12776-12868` tool_call chain; `GUARDED_COMMAND_KEY` (`:1724`) has
  push but not commit; commit behavior is prompt-only. `child-safety.ts` is generic.
- ODD/RDD coupling: `odd/tasks` in bounded-writer-admission, design-handoffs,
  design-canvas-server, verifier-admission; ~40 `lib/review-*.ts`; `contracts/`.
- postinstall downloads the Go `gentle-ai` binary (needed only for RDD).
- gentle-engram is a separate package (`pi install npm:gentle-engram`), not a dependency.
- Extensions to strip: gentle-guide, gentle-music, gentle-program-identity,
  gentle-star-prompt, gentle-voice, startup-banner. Replace: gentle-ai, gentle-design,
  gentle-shell (branding). Keep the rest.

## Resume the original conversation

The design conversation happened in a gentle-shell session started in
`harpia-front` (session id `01a1b64c-ddc2-7359-a1ef-7f1e663ca50d`). From this
directory:

- Fresh, cheap start (recommended): `gentle-shell` → it loads `AGENTS.md`, this file,
  and Engram project `tomidev-shell`.
- Full history copied into this directory:
  `gentle-shell --fork 01a1b64c-ddc2-7359-a1ef-7f1e663ca50d`
  (Pi `--fork <path|id>`; the copy carries ~150k tokens of context).
