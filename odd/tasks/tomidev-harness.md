# tomidev-harness

Replace gentle-shell's ODD/RDD harness with the user's own harness: keep the ODD idea, adapt it to the
workflow already defined in his repos (AGENTS.md, .agents/skills, .agents/agents, tlc-spec-lean). Same branch
`rename-tomidev`, no commits until everything is done. Analysis and decisions: TOMIDEV.md (sections from
"Prompt / agents / skills analysis" on).

## Specs

- S1 Principle: "debes seguir el mismo principio, que ocurre con codex o claude code, si bien tienen su propio
  harness, se adaptan al que se pueda armar a cada repositorio en especifico". The shell reads existing repo
  conventions (AGENTS.md, .engram/config.json, .agents/skills, .agents/agents, .agents/scripts/*,
  .agents/designs/features); no new per-repo adapter file (`.agents/harness.json` dropped).
- S2 Workflow: "me gustaria mantener en principio ODD, pero adaptar el workflow al harness que cree en"
  Smartbase-node, Smartbase-front, preact(-widget) and harpia-front: lanes Direct / Checks-only / Full Lean by
  risk; feature artifacts in `.agents/designs/features/<feature>/`; Engram index `features/<feature>/state`;
  never stage/commit/push unless asked.
- S3 RDD: "Sí, eliminar (recomendado)" — remove gentle_review* tools, the review contract, RDD UI and the
  gentle-ai binary; review = requesting-code-review + independent verifier/reviewers.
- S4 Identity: "Mínima: 'Tomidev Shell' (recomendado)" + the user's consolidated senior-architect persona.
- S5 Agents: base = current builtin agents, adapted ("el agente explorador actual me parece correcto solo que
  hay que adaptar"). explore, verifier ("Adaptar como propongo"), worker ("Adaptar como propongo"), jd-judge-a/b
  as blind judges of plan/checks ("Adaptar como propongo"), review-risk/readability/reliability/resilience as
  lenses the orchestrator selects for requesting-code-review ("Adaptar las 4 lentes"); remove 4r-review chain
  ("Eliminar") and jd-fix-agent (parent decision, user: "decide tu"). Also load `.agents/agents/*.md`.
- S6 Consensus loop: "cuando el agente orquestador discute con los agentes revisores/jueces, deben quedar en loop
  discutiendo y si despues de 3 rondas no llegan a consenso me deben preguntar. y los ajustes lo hace el agente
  orquestador antes de delegar la ejecucion para el worker". Critics enter "Según carril y riesgo".
- S7 Models: "esto debe quedar como ya esta configurado hoy en el proyecto, que usuario elige modelo".
- S8 Generic skills/agents ship builtin in tomidev-shell ("Builtin en tomidev-shell"); repos keep their stack
  skills.
- S9 Skills to build or adapt: tlc-spec-lean ("es agnotico al tipo de proyecto, debe mantenerse asi"), one copy
  unifying the 3 divergent ones; requesting-code-review ("combinar como juzgues mas robusto y no genere
  sobreingenieria"); clean-code ("fusionar en clean code, y manteniendo las reglas indicadas y que sea agnostico
  al lenguaje o framework, como evitar anidamientis de try catch, usar lookup objects etc. (que este sea el estilo
  de generar codigo)"); testing ("evalua las reglas para generar tests de los 4 respositorios de ejemplo, que sea
  una skill agnostica y adaptada a la skill de tests de gentle shell"); delivery (branch-pr + chained-pr +
  work-unit-commits, "la idea es evitar sobreingenieria"); comment-writer (adapt); tomidev (replaces gentle-ai,
  "Reemplazar por skill tomidev"); consensus protocol from judgment-day ("Adaptar como protocolo de consenso").
- S10 Skills to remove or move: rdd-defect-workflow, skills/_shared, issue-creation ("Eliminar"),
  cognitive-doc-design (rules folded into delivery), skill-creator/skill-improver/skill-registry ("elimina las 3,
  yo creo skills con claude code o codex si es necesario"); tui-design moves to tomidev-shell/.agents/skills
  ("Mover al repo"). design + gentle-ui-design are out of scope ("Decidir con la capa de UI").
- S11 Commits: "no vamos a commitear a los pocos vamos a hacer todo junto, una vez termine".

- S12 Harness composition: "debe ser como codex o claude code, que su harness respeta el harness que pueda estar custmizado en cada proyecto"; "no es que deba descartarse sino acoplarse a el posible custom harness que haya en cada proyecto". Concrete example: "harpia en su harness si revisas no contempla los subagentes de jueces/revisores de planes creados antes de ejecutar, tomidev deberia cpmplementar eso, es decir crear el plan que indica el repo pero usar estos agenets revisores".
- S13 Purpose: "el objetivo es hacer un fork customizado de gentle shell, no reducir tokens porque si".

- S14 Optional integrated design canvas: "conservarlo como una capacidad integrada de Tomidev, adaptada a las skills y convenciones de cada\n proyecto, pero opcional, se debe preguntar a usario si prefiere asi, directo o como diga el repositorio".

- S15 Remove guided tour: "quitala" (reply to the question about retaining, making manual-only, or removing `/td:guide`). Preserve product knowledge: "pero manten el contexto para que sepas como funciona algo de tomidev si me olvido". Remove interactive tour mechanics, retain useful feature explanations and discoverable reference docs.

- S16 Remove GitHub star solicitation: "quitalo" (reply to removing the star prompt for gentle-shell/gentle-ai). Preserve attribution and original license.

- S17 Banner and Omni fidelity: "si, pero el tema onmi no carga con la paleta de colores que imagine, no usa los colores omni https://github.com/getomni/omni, https://github.com/getomni/visual-studio-code, https://github.com/getomni/visual-studio-code, https://github.com/getomni/alacritty, https://github.com/getomni/iterm, https://github.com/getomni/neovim".

- S18 Reviewer display names: "los agentes review deben tener nombre unico, los 3 con el mismo nombre confunden".

## Tasks

- [x] T1 [S3] Remove RDD end to end (tools, contract injection, UI, rdd-mode, native review CLI, review libs, gentle-ai
  binary resolution/installer, provider-contract mirror and checks, RDD env kept only for the binary) — route: direct
  — commit: none (S11)
- [x] T2 [S2,S4,S6] Minimal primary prompt: identity + persona, adapted ODD (lanes, feature contract, Engram key,
  consensus loop, no commits unless asked, Risk line); drop ODD mirror steps/continuity/orchestrator weight;
  measure prompt size before/after — route: direct — commit: none
- [x] T3 [S1,S2] Feature contract in code: `odd/tasks` hardcodes → `.agents/designs/features/<feature>/`; remove ODD
  process guards (undocumented writer, unrisked verifier) keeping generic safety; writers may edit
  `.agents/designs/features` — route: direct — commit: none
- [x] T4 [S5,S7] Agents: load `.agents/agents/*.md` (Claude tool-name mapping, ignore `model: inherit`, no rewrite of
  repo files by the model panel); adapt explore, verifier, worker, judge-a/b, 4 review lenses; remove jd-fix-agent,
  4r chain, Judgment Day guard — route: direct — commit: none
- [x] T5 [S8,S9,S10] Skills: build/adapt the S9 set (unified tlc-spec-lean with scripts); remove/move the S10 set;
  update references (gentle-design loader excluded, orchestrator intent tables, verify-package-files) — route: direct
  — commit: none
- [x] T6 [S2] Enforcement: block git commit/push without an explicit request; run
  `.agents/scripts/private_harness_guard.py --root .` before an allowed commit when present; port the gate-guard
  denylist — route: direct — commit: none
- [x] T7 [all] Full suite, typecheck, runtime check, prompt size measurement, differential where shared code changed,
  independent verify — route: verify — commit: none

- [x] T8 [S2,S3] Review fixes A: robust commit/push enforcement (human confirmation instead of prompt regex, wrapper
  detection, child sessions blocked, guard spawn errors, unified denylist) + `.agents/agents` path/tool mapping
  fixes — route: worker — commit: none
- [x] T9 [S2,S3,S4] Review fixes B: remove RDD/JD residue (orchestrator assets, dead tool entries, packed-runner and
  package inventories, UPSTREAM note), identity/persona/continuity text, package.json/README, __pycache__, real
  prompt+tools size measurement — route: worker — commit: none

- [x] T10 [S3] Docs: delete native-review/RDD docs and README sections, rewrite as requesting-code-review + lenses +
  judges ("Borrar y reescribir (recomendado)") — route: worker — commit: none
- [x] T11 [S2] Remove the orchestrator-tracking delivery menu (ask-on-risk/auto-chain/single-pr/size:exception) in favor
  of the delivery skill rule ("Sacarlo (recomendado)") — route: worker — commit: none
- [x] T12 [S4] Remove persona machinery (/td:persona, persona.json helpers, unused persona argument; persona fixed in
  the prompt) ("Eliminarla (recomendado)") — route: worker — commit: none
- [x] T13 [S2] `/td:context` command: per-part token breakdown of what the primary session sends (system prompt
  sections, context files, skills catalog, tool schemas per package, memory) ("Comando /td:context (recomendado)");
  then measure in harpia-front ("harpia-front") — route: worker — commit: none

- [x] T14 [S1,S5,S6,S12,S13] Align builtin prompt, skills and agents with project-harness composition: project-owned artifacts and workflow plus proportional builtin plan judges, no duplicate tracking or competing lane/delivery policy. Inspect current implementation first; preserve runtime safety — route: explore then scoped implementation — commit: none

- [x] T15 [S1,S12,S14] Keep canvas integrated but optional; ask canvas/direct/repository workflow at design entry, adapt to project skills/artifacts, remove mandatory-canvas routing and cover route selection — route: explore then scoped implementation — commit: none

- [x] T16 [S15] Remove guided tour end to end (command, tool, suggestions, dedicated assets, help/package references), preserve shared UI and unrelated data — route: explore then scoped implementation; parent owns deletions — commit: none

- [x] T17 [S16] Remove star solicitation end to end: automatic notice, dedicated shortcuts/buttons, GitHub star actions and dedicated integration; preserve shared UI, attribution, license and user data — route: explore then scoped implementation; parent owns deletions — commit: none

- [x] T18 [S17] Preserve banner; reproduce/diagnose theme-load and official Omni palette mismatch, correct proven cause with isolated tests and visual evidence where available — route: explore then scoped implementation — commit: none

- [x] T19 [S18] Distinguish reviewer role labels in sidebar and waiting alerts without renaming stored IDs/models or custom project agents — route: inline after explorer map — commit: none

## Log

- L16 User clarification: "el objetivo es hacer un fork customizado de gentle shell, no reducir tokens porque si". Live harpia measurement: Pi usage 23,890 tokens; diagnostic estimate 22,798.75, provider JSON bytes/4 30,039.25 (not actual token usage). Tools 43,732 B, skills catalog 21,844 B, AGENTS.md 17,578 B. No token-driven capability removal authorized.
- L17 User: "me parece bien pero, rercurda que debe ser como codex o claude code, que su harness respeta el harness que pueda estar custmizado en cada proyecto"; "fijado carriles, consenso y reglas de entrega en el\n prompt global puede seguir siendo demasiado invasivo, tienes razon en esto, pero no es que deba descartarse sino acoplarse a el posible custom harness que haya en cada proyecto"; "por ejemplo, harpia en su harness si revisas no contempla los subagentes de jueces/revisores de planes creados antes de ejecutar, tomidev deberia cpmplementar eso, es decir crear el plan que indica el repo pero usar estos agenets revisores". User authorized establishing this and continuing: "ok, hay que dejar establecido esto y seguir con los proximos pasos". Accepted interpretation: review the project's same plan before execution, incorporate findings there, no parallel artifacts, proportional application, respect explicit incompatible instructions and runtime safety.
- L18 T14 partial, not complete: worker mw9ruio7-c-gbzk implemented project-composition prompt/assets/skills/agents/docs and six new structural tests (observed RED then GREEN). Live custom-plan dispatch and edit-surface preservation checks passed. Runtime admission helpers were found inactive in live dispatch; no runtime enforcement changes. Worker exhausted its two-correction allowance with legacy test `feature document is the verbatim specification subagents read by reference` still failing (`verdict per C#`, tests/odd-routing-contract.test.ts:210); a subsequent builtin-path assertion may also conflict but has not executed past this failure. Parent did not retry or transfer correction to bypass the bound. Needs explicit user authorization for a bounded correction batch; golden/card generation and full verification remain pending. Scratch: /tmp/t14.PwVP5P. No commits/staging.
- L19 User authorized the L18 bounded continuation: "si" (in reply to one correction batch for legacy contract expectations, one focused recheck, then golden/card generation and full checks if green). Worker resumed as mw9tub9k-d-sdt7. No new automatic correction cycle on failure; runtime safety and no-commit constraints unchanged.
- L20 Authorized correction passed 96/96. Parent job-1 generated primary golden and full-delegation card (checks exit 0). Full suite exit 1: 7407 tests / 7327 pass / 7 fail / 73 skip. Failures: delegate-for-reason legacy logbook/work-unit wording; child-job IPC report assertion; orchestrator-budget tracking pointer terminology; packaged agent body history stale; package-manifest worker test-first wording; verifier spec-item verdict wording; continuity forbidden-word assertion. Runtime-harness, typecheck (0 diagnostics), runtime mirrors (8), package inventory (128) all exit 0. No new correction/recheck attempted after bounded authorization exhausted; awaiting decision. Full log job-1.log; scratch /tmp/t14v.Iej1ZL. T14 remains partial.
- L21 User authorized the next bounded correction: "hazlo" in reply to resolving the seven L20 failures, one focused recheck then one full run if green, stopping on failure. Worker mw9uyftm-e-ihe8 handles scoped contracts and IPC test synchronization; parent owns agent-history/golden/card generation and full verification. Exact failing verifier test is tests/verify-agent-contract.test.ts; continuity log includes subsequent Project harness composition heading, so section extraction must be checked rather than weakening lifecycle protections. No commits.
- L22 L21 correction batch applied: six substantive checks now pass; child-job test uses event-driven IPC+notice waits with 5s abort, preserving exact isolation assertions. Focused command exit 1, 143 tests/142 pass/1 fail: stale agent-body-history hash test executed despite attempted exclusion. Hash assertion unchanged; generator remains parent-owned. No retry/full run performed because L21 conditional green was not met and bounded recheck was consumed. Pending decision: generate agent history and run focused checks, then full verification if green. Scratch /tmp/t14f.OWK5kH. T14 remains blocked, no completion claim.
- L23 User authorized generation and verification: "si". Parent job-2 exit 0: agent-body history regenerated; focused 143/143; full suite 7407 tests / 7334 pass / 0 fail / 73 skip. Runtime-harness, typecheck (0 diagnostics), runtime mirrors (8), package (128), generated delegation-card check all exit 0. T14 complete for instruction composition and regression checks; tests do not prove autonomous model compliance. No runtime guard changes, staging or commits. Token minimization not a gate. Next: UI layer interview/audit. Scratch /tmp/t14g.Pda2VD.
- L24 UI interview, user selected: "conservarlo como una capacidad integrada de Tomidev, adaptada a las skills y convenciones de cada\n proyecto, pero opcional, se debe preguntar a usario si prefiere asi, directo o como diga el repositorio". Canvas retained, no automatic canvas route; user selects canvas, direct application work or repository-defined design workflow. Record and inspect current routing before implementation.
- L25 T15 exploration mw9wm0ie-f-ae2y found canvas-default entry in extensions/gentle-design.ts, prompt hint in lib/gentle-design.ts and mandatory skill instructions. Implementation worker mw9woo8b-g-62gk launched: new design brief asks canvas/direct/repo once; cancel does nothing; no UI never silently defaults. Existing explicit canvas open/stop/sync/implement/comment actions are utilities/continuations, not ambiguous new workflow entry, so no repeated selector. Preserve integrated canvas and project skill precedence; parent owns long verification. No global route preference or new adapter.
- L26 T15 worker focused 78/78 passed with observed RED. Parent job-3 full suite exit 1: 7414 tests / 7340 pass / 1 fail / 73 skip. Sole failure: tests/command-palette.test.ts:50, Vim reference missing `status`; runtime-harness/types/runtime mirrors/package/card/scoped diff all exit 0. Worker resumed as mw9wy77f-h-k0nq for scoped documentation preservation fix, no weakened test or design-route change. T15 remains open. Scratch /tmp/t15.4CXEsD and /tmp/t15v.5HFTGH.
- L27 T15 complete: Vim reference fix only code-formats existing selector values; unchanged focused tests 127/127. Parent job-4 exit 0: full suite 7414 tests / 7341 pass / 0 fail / 73 skip; runtime-harness/types/runtime mirrors/package/delegation-card/scoped diff all exit 0. Optional canvas/direct/repo entry implemented; natural-language route adherence remains instruction-level, not autonomous compliance proof. No commits. Scratch /tmp/t15fix.Xo5vcu, /tmp/t15r.cVQzYe. Next UI interview: guide, music, voice, star prompt, banner.
- L28 UI interview, guided tour: user "quitala". Authorized removal of the guided-tour capability, not other UI features or user data. Record as S15/T16; inspect dependencies before removal. Parent owns any necessary file deletions; no git staging/commits.
- L29 User clarification to S15/T16: "pero manten el contexto para que sepas como funciona algo de tomidev si me olvido". Keep useful feature/help knowledge accessible to the agent; remove interactive tour mechanics and obsolete invocation instructions only. Explorer steered before edits. No requirement to inject all docs every turn or build a new knowledge subsystem.
- L30 T16 complete: parent confirmed three tour files contained only prior rename adaptations and deleted extensions/gentle-guide.ts, lib/gentle-guide.ts, tests/gentle-guide.test.ts without staging. Palette/banner integration removed; reusable product explanations retained in docs/readme-reference.md and linked from docs/gentle-shell.md. Historical tour spec retained. Removal/docs check 4/4; shared UI focused 143/143. Parent job-5 exit 0: full suite 7408 tests / 7335 pass / 0 fail / 73 skip; runtime-harness/types/runtime mirrors/package/delegation-card/scoped diff all exit 0. No commits. Scratch /tmp/t16.KfGmwh, /tmp/t16p.1I3YPc, /tmp/t16v.mjdzhZ. Next UI decisions: music, voice, star prompt, banner.
- L31 UI interview, music: user "conserva" in reply to keep/adapt/remove. Keep current music capability unchanged; supersedes historical strip recommendation. No implementation or additional music tests needed for this decision. Next: voice.
- L32 UI interview, voice: user "dejala" in reply to keep/adapt/remove. Keep current voice capability unchanged; supersedes historical strip recommendation. No voice implementation changes. Next: star prompt and banner.
- L33 UI interview, star solicitation: user "quitalo". Remove star prompt, not upstream attribution/license; no replacement fork-star prompt. Inspect dependencies, parent owns dedicated file deletions. Music and voice remain unchanged; banner still awaiting decision.
- L34 T17 complete: parent removed extensions/gentle-star-prompt.ts, lib/star-prompt.ts, tests/star-prompt.test.ts and docs/star-prompt.md after confirming their only prior edits were rename adaptations. Package/schema references and README fork-star CTA removed. User settings/data, shared UI/keymaps, upstream attribution/LICENSE preserved. Removal/preservation 8/8 and shared schema/UI 45 passed. Parent job-6 exit 0: full suite 7389 / 7316 pass / 0 fail / 73 skip; runtime-harness/types/runtime mirrors/package (126)/delegation-card/scoped diff all exit 0. No commits. Scratch /tmp/t17.vK7bmX, /tmp/t17.LzEAi3, /tmp/t17.89BNw2, /tmp/t17p.1lteCT, /tmp/t17v.14jyOK. Next UI decision: banner.
- L35 Banner interview and reported theme failure, user: "si, pero el tema onmi no carga con la paleta de colores que imagine, no usa los colores omni https://github.com/getomni/omni, https://github.com/getomni/visual-studio-code, https://github.com/getomni/visual-studio-code, https://github.com/getomni/alacritty, https://github.com/getomni/iterm, https://github.com/getomni/neovim". Preserve banner; investigate palette versus actual loading/overrides before fixing. Explorer mwa265g8-m-7vsl; no external home config access granted. Official web source reads authorized by supplied URLs. No visual fidelity claim before captures.
- L36 T18 exploration: shipped base colors match official getomni/omni palette (Alacritty ANSI roles differ from semantic palette). Runtime visual cause not reproduced. Possible contributors: default transparent surfaces inherit terminal background; extra derived surfaces; hardcoded agent tint (#221D30) and banner RGB; migration selects tomidev only from Gentleman-Cute, not arbitrary active themes. No code changes/tests/app launch/home config reads performed. Awaiting user's screenshot, active theme name and transparent/tinted surface setting before selecting correction. Do not claim reported failure already works from matching JSON alone.
- L37 User clarified T18 appearance: "pero continua pareciendo esos colores rosados, onmi neovim y fish muestar los colores sugeridos". Reopen source-level diagnosis without screenshot prerequisite: compare semantic roles and pink dominance (current accent=pink) against official Neovim/Fish, not just matching hex values. Explorer resumed mwa2agqf-n-rdfx. Screenshot remains visual acceptance evidence, not a reason to stop role analysis. No correction chosen yet.
- L38 T18 role diagnosis confirmed accent=pink affects shared navigation/titles/borders. Official Neovim keeps pink syntax and uses purple in FloatBorder/PmenuThumb; Fish distributes semantic colors and has no universal UI accent. Parent applied minimal app mapping accent→purple (#988BC7), unchanged base palette and pink keywords/operators. Observed RED exact accent mismatch; focused/full/package checks running job-7. This is Tomidev role adaptation, not an official Omni universal rule. No runtime loader/home config changes. No visual capture yet; actual appearance acceptance remains pending, and no claim user's session is fixed. Scratch /tmp/omnir.yueraO.
- L39 T18 source correction checks passed: parent job-7 exit 0, focused theme tests 9/9; full suite 7389 tests / 7316 pass / 0 fail / 73 skip; package verification 126 resources passed. Only themes/tomidev.json accent mapping and focused preservation assertions changed for this correction; shared code/loader/private home untouched. Visual acceptance still pending user's fresh session with active tomidev theme; do not mark appearance reproduced/fixed from structural tests. Risk: none (theme role data only, no shared code/contracts changed). Scratch /tmp/omniv.pHKoHt. User provided launch instructions for checkout CLI; no commits.
- L40 User confirmed live visual acceptance: "si funciona, sigamos". T18 complete: source checks plus human visual confirmation. Resume final refactor verification, no commit/push authorized.
- L41 Final local verification: job-8 runtime-harness/types/runtime mirrors/package/delegation-card/packed-runner syntax all passed; diff check found only 3 EOF blank lines (worker agent, orchestrator-writer, launcher test). Parent removed those lines only. Job-9 affected tests 296/297, sole stale worker body hash; job-10 regenerated history using project generator then 297/297 passed, diff and package checks exit 0. Last full suite job-7: 7389 / 7316 pass / 0 fail / 73 skip, before EOF-only cleanup; no claim of another full run after cleanup. Branch rename-tomidev, HEAD d17c6f98c unchanged; 11 pre-existing index entries retained. No commit/push. Packaged-install E2E scripts/test-packed-runner.mjs has NOT run: syntax only, registry install/postinstall network proof remains pending. Final delivery validation awaits decision on isolated networked packed-install check vs explicit deferral. Scratch /tmp/tdfinal.g6w6GU, /tmp/tdclose.YLuPMe, /tmp/tdhash.FkSkTr.
- L42 User S18 reports reviewer labels confusing. Explorer mwa30hok-o-ek7n confirmed sidebar KIND_MAX=10 truncates common review-* prefixes; IDs already unique (repo ships 9 agents, installed 11 count unresolved without private inventory). Parent observed RED via renderAgentsSection at widths 50/36 and preservation case for custom/worker names. Added exact builtin display labels Risk/Readability/Reliability/Resilience in shared agentKind (also waiting alert), no persisted ID/model changes. Focused/full/types/runtime/package/diff checks running job-11. Tests check public rendered output, width and preserved task IDs; no live visual screenshot yet. Packed-install distribution decision remains deferred pending user answer; no commit/push.
- L43 T19 verified: parent job-11 exit 0; widget 39/39; full suite 7391 tests / 7318 pass / 0 fail / 73 skip; typecheck 0 diagnostics, runtime mirrors (8), package (126) and whole-tree diff check passed. Reviewer sidebar/alert display labels now distinguish roles; IDs, model settings and custom names preserved. Public-render tests cover normal/narrow widths; no live screenshot claim. No commits. Scratch /tmp/arn.gC7n0J and /tmp/arv.6LmC58. Distribution packed-install proof still awaiting decision.
- L1 User request: "commitear y ver como lo uso viene despues, no vamos a commitear a los pocos vamos a hacer todo
  junto, una vez termine, asi que vamos a pasar al punto 3 que mencionas" (point 3 = analyze system prompt,
  builtin agents and builtin skills, decide ODD/RDD).
- L2 Analysis (2026-11-08): package-owned prompt ~19-20k tokens; ODD+RDD removal leaves ~6k; package explains
  ~1/3 of the measured 58.5k; builtin agents all ODD/RDD/JD; skills catalog ~1.2k tokens. Details in TOMIDEV.md.
- L3 User harness map of the 4 repos and test-rule map (TOMIDEV.md "User harness map", "Testing skill").
- L4 Decisions recorded verbatim in S1-S11 from the audit rounds (agents 1-2, skills 1-4).
- L5 User on the adapter: "si, porque debes seguir el mismo principio, que ocurre con codex o claude code, si bien
  tienen su propio harness, se adaptan al que se pueda armar a cada repositorio en especifico" → no
  `.agents/harness.json`.
- L7 User: another agent executed T1-T7 ("Se ha finalizado la ejecución completa de las tareas T1 a T7"), then:
  "haz el review, y afina lo que encuetres que sea mejorable. luego proseguimos con los proximos pasos".
- L8 Review (verify + adversarial judge): suite 7324 pass / 0 fail / 73 skip, typecheck 0, package check ok, real
  ~/.tomidev absent. FAIL S3: RDD/JD text still in lazy assets (orchestrator-tracking/verification/prompts/
  delegation/delegation-reference), dead gentle_review* entries (odd-phase-inference, gentle-ai-renderer rdd card,
  GENTLE_TIMED_TOOLS, auto-permission-runtime, gentle-shell RDD label), scripts/test-packed-runner.mjs asserts
  gentle_review*/td:review-mode, verify-package-files lists lib/gentle-ai-binary.ts, tlc UPSTREAM.md openclick note.
  PARTIAL S4/S6/T2: "Current persona mode: gentleman", "Gentle Shell prompt label", identity says plain ODD,
  continuity block unchanged with native-review text, package.json/README el Gentleman; golden 25,396→24,154 B
  ("~70%" unconfirmed, needs full system+tools measurement). T6: commit gate bypassed by quoting (sh -c/bash -c
  stripped), env/path/subshell/alias forms; request regex false positives (any "commit" in pasted text, questions)
  and negatives ("commiteá", "dale"); negation of push blocks commit; fail-open before first input and in children;
  guard hardcodes python3, opaque reason on spawn failure; denylist gaps vs DENIED_BASH_PATTERNS. agents-config
  isRepoAgent substring match; Claude map lacks WebFetch/WebSearch/LS/TodoWrite/Task. Untracked
  skills/tlc-spec-lean/scripts/__pycache__. 11 staged entries come from the rename work (git mv/git rm).
- L9 Parent decision for T8: replace prompt-regex request detection with an explicit human confirmation dialog
  (ctx.ui.confirm) whenever a commit/push is attempted; no UI or child session → block. Rationale: S2 "never
  commit unless asked" needs a reliable signal; regex fails both ways.
- L10 T8 worker: enforcement implemented (unified denylist, child/headless block, ctx.ui.confirm, guard with
  python3→python and clear errors, wrapper-aware detection), agents-config segment check + tool map; 14 old tests
  conflict. User decisions: YOLO/Auto → "Siempre confirma (recomendado)" (commit/push dialog in every mode);
  DROP TABLE → "Pide confirmación (recomendado)" (stays a data-loss confirmation, DROP DATABASE hard-denied).
  Parent: keep widenings (git push origin +main, rm -r ~/x); fix F1 (`echo "rm -rf /"` must stay allowed).
- L11 T8 done: D4-a (DROP DATABASE inside sh -c blocked, consistent with L10). Full suite 7417 tests / 7344 pass /
  0 fail / 73 skip; runtime-harness exit 0 (prior round); typecheck 0; denylist differential 9 planned changes.
  Residual: Auto classifier can still deny an approved push (intentional); `git log --grep="rm -rf /"` now blocked.
- L12 T9 done: orchestrator assets rewritten without RDD/JD (risk-line verifier, lanes, judges consensus loop,
  lenses); dead entries removed; identity/persona/continuity rewritten (continuity 5,447→1,008 B); package.json/README
  identity; structural residue test; __pycache__ ignored and removed by parent. Measured package-owned input (bytes/4):
  HEAD 57,690 B ≈ 14.4k tok → now 54,079 B ≈ 13.5k tok (prompt 25.4→19.8 KB, guidelines 13.1→5.4 KB, tool schemas
  19.1→28.9 KB because 20 more tools register in this harness: subagent/orchestrator/todo/jobs/codemode). The earlier
  "~70%" claim is false. Full suite 7398 / 7325 pass / 0 fail / 73 skip; runtime-harness 0; typecheck 0; package check ok.
  Parent final spot check: typecheck 0, package ok, 65/65 key tests, --version ok, no commits (d17c6f98c), real
  ~/.tomidev absent. Open follow-ups: docs RDD residue (readme-reference, review docs, README native-review sections);
  orchestrator-tracking delivery menu (ask-on-risk/auto-chain/size:exception) contradicts the delivery decision;
  persona machinery leftovers; quiet-tools gentle-ai review classification; tool surface is now the main token cost.
- L13 Interview (user, 2026-11-09): docs "Borrar y reescribir (recomendado)"; delivery menu "Sacarlo
  (recomendado)"; persona "Eliminarla (recomendado)"; tokens "Medir el payload real primero (recomendado)" via
  "Comando /td:context (recomendado)" in "harpia-front"; UI layer audit "Después de los tokens"; commit "al finalizar
  todo el refactor"; worker model must be sol — parent aligned subagents.json, models.json and the worker agent
  frontmatter to openai/gpt-6.1-sol (active profile `worker` already pinned it).
- L14 T10-T12 done (worker on sol; parent deleted the 6 retired docs: review-coordinator, review-integration,
  review-request-context, review-windows-acl, native-authority-architecture, rdd-odd-friction-triage, and turned the
  residue test's pending list into a "retired docs stay gone" check). Worker full suite 7394 / 7320 pass / 1 fail
  (gentle-agents-child-jobs IPC timing; parent reran it isolated 3x: 13/13 each → load flake) / 73 skip;
  runtime-harness 0; typecheck 0; runtime ok; package ok (127); full-delegation card current.
- L15 T13 done: lib/context-breakdown.ts + `/td:context` (`--json`), primary sessions only, sizes/names only;
  attribution: Pi base sections, each context file, skills catalog (+top 5), one "Package appends" row (no per-extension
  provenance in documented APIs), memory sections, tool schemas by sourceInfo (+top 10), projected conversation, last
  observed provider payload size, Pi usage for comparison. Full suite 7399 / 7326 pass / 0 fail / 73 skip; harness 0;
  typecheck 0; runtime ok; package ok (128). Pending: user runs it in a real harpia-front session.
- L6 User on proceeding: "me parece bien" to the stage plan (remove RDD → minimal prompt → agents → skills →
  guards → verify), no commits until the end.
- L7 T1 Complete (2026-11-09): RDD completely removed end-to-end (tools, contracts, UI, Go binary dependencies, review libs).
- L8 T2 Complete (2026-11-09): Minimal primary prompt with Tomidev Shell identity, senior-architect persona, adapted 3 lanes (Direct, Checks-only, Full Lean), feature contract in `.agents/designs/features/<feature>/`, Engram key `features/<feature>/state`, 3-round consensus loop, never-commit rule without explicit request, and Risk line.
- L9 T3 Complete (2026-11-09): Feature contract in code (.agents/designs/features/<feature>/) across admission, handoffs, canvas server, assets. Removed ODD process guards from subagent_run.
- L10 T4 Complete (2026-11-09): Load `.agents/agents/*.md`, Claude tool-name mapping, ignore `model: inherit`, protect repo files from model panel rewrites, adapted 9 builtin agents, deleted `jd-fix-agent.md` and `4r-review.chain.md`.
- L11 T5 Complete (2026-11-09): Built/adapted S9 set (`tlc-spec-lean` with verified selftest.py killing 72/72 mutants, `clean-code`, `requesting-code-review`, `testing` with 19 rules, `delivery`, `comment-writer`, `tomidev`, `consensus`). Moved `tui-design` to `.agents/skills/`. Removed obsolete S10 skills. Updated references and tests.
- L12 T6 Complete (2026-11-09): Enforcement implemented in `lib/command-enforcement.ts` and wired into `tool_call` hook. Blocks `git commit` and `git push` without an explicit request in the current turn; executes `.agents/scripts/private_harness_guard.py --root .` before an allowed commit when present; blocks gate-guard denylist patterns.
- L13 T7 Complete (2026-11-09): Full test suite passed (unit-tests: 7,324 passing, 0 failing, 73 skipped; runtime-harness: 100% pass), typecheck clean (0 diagnostics), package verify passed (129 files, 1 byte-pinned contract), prompt size measured (~6,047 tokens, ~70% reduction). No commits created per S11.
