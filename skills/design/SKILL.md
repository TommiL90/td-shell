---
name: gentle-design
description: "Trigger: design a screen or page, mockup, landing page, UI directions. Ask for canvas/direct/repository route first; after canvas selection, supply self-contained HTML artboard delivery and design system sync."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

At a new design workflow entry, ask once whether the user prefers canvas (HTML artboards), direct application work, or the repository-defined workflow. Start nothing until the human selects; never default to canvas. An explicit route already selected for this task needs no second question. Honor it for continuations and explicit canvas utilities (open/stop/sync/implement/comments); ask anew for a subsequent independent task, with no global preference.

Only the canvas route uses the delivery rules below. Direct application work uses the project's real stack and skills, without builtin canvas skills, list/system sync, artifacts or server. The repository route follows existing project instructions, relevant skills and artifacts through existing skill discovery; if no repository design workflow is defined, report that clearly and stop rather than inventing one or falling back to canvas.

The project's relevant design and UX skills take precedence; builtin guidance fills gaps, not a mandatory pairing. Respect explicit project prohibitions and runtime safety. Reuse compatible artifacts and the project's existing feature tracking, never competing tracking. The integrated canvas supports self-contained HTML with `design/<slug>/design.json`, not arbitrary project formats or roots: explain any incompatibility instead of claiming unsupported formats work. Do not use the canvas delivery steps to implement production code.

The `/td:design` commands are optional shortcuts: every action also works from a plain request, through this skill and the `gentle_design` tool (`list`, `open`, `stop`, `implement`, `handoff`).

## Hard Rules

- Every artboard is one self-contained HTML file: inline CSS, JS, and SVG; system font stacks only. Never reference external URLs, CDNs, remote fonts, images, or scripts.
- Use realistic content for the audience; no lorem ipsum or placeholder names.
- Accessible markup: semantic elements and landmarks, WCAG AA contrast, visible focus styles, `prefers-reduced-motion` respected for any motion.
- Follow the project's authoritative tokens and component rules first, reusing compatible existing artifacts. When `design/system.md` exists, read it and reconcile it with those sources; never silently use stale or conflicting tokens. Run the Self-check from "Design system sync" before finishing any artboard.
- Ask at most one clarifying question, and only when the brief lacks the goal or the content.
- Iterating edits only the targeted artboard. Never rewrite the others.

## Decision Gates

| Situation | Action |
| --- | --- |
| New brief, canvas route selected | Write N clearly different directions (3 by default, or the number asked) to a new `design/<slug>/` |
| Feedback on one artboard | Edit that file only; keep its manifest entry, update `tradeoff` if it changed |
| "Save and try a different approach" | Add a new artboard with the next `NN`; keep previous ones; append it to the manifest |
| User wants to tune values (spacing, color, type scale) | Add sliders or controls in the artboard plus a "Copy as prompt" button that copies the chosen values as a prompt |
| Compatible artifacts already exist for this task | Reuse them; edit only the targeted artboard and preserve other directions |
| `design/<slug>/` belongs to a different task | Pick a new slug; never overwrite another design |
| A message carries design comments, or the user asks to apply them | Follow "Canvas comments" below |
| `/td:design sync`, or the user asks to capture the project's design system | Follow "Design system sync" below |
| The user asks to show, stop, or list designs, or to implement an artboard | Call the `gentle_design` tool (`open`, `stop`, `list`, or `implement` with `<slug>/<artboard>`); follow the handoff text `implement` returns, and report progress with `action "handoff"`: `status: "in_progress"` when you start, `status: "implemented"` when done, with `previewUrl` set to the running app's loopback URL when one is running |

## Before designing

Only after canvas selection, inspect relevant project skills and compatible existing artifacts first. Call the `gentle_design` tool with `action: "list"`, then apply these fallback rules where the project has not supplied compatible token guidance. Missing `design/system.md` alone is not a reason to duplicate the project's existing token artifacts:

| `list` reports | Action |
| --- | --- |
| `system.exists` false and `designSources` present | Run "Design system sync" first, tell the user in one line that you synced the project's design system, then design with it |
| No `designSources` | Skip the sync and design freely |
| `system.staleSources` present | Name those sources, say `design/system.md` may be outdated, and offer to sync again before designing; re-sync only with the user's OK, and never use the stale tokens silently |

## Execution Steps

1. Take the brief: goal, layout, content, audience.
2. Load relevant project design/UX skills first for the audience, primary job, and success condition. Use `gentle-ui-design` only for uncovered UX gaps; read only the relevant references, not a mandatory builtin pairing.
3. Choose a kebab-case slug from the brief.
4. Make the directions differ in structure or visual strategy, not only in color. Label each with the tradeoff it makes.
5. Write `design/<slug>/NN-<name>.html` per artboard (`01-…`, `02-…`; kebab-case name).
6. Write `design/<slug>/design.json`:

```json
{
  "title": "Pricing page",
  "brief": "Pricing page for a note-taking app aimed at students",
  "feature": "odd/tasks/pricing-page.md",
  "artboards": [
    { "file": "01-comparison-table.html", "title": "Comparison table", "tradeoff": "Dense and scannable; weaker emotional pull", "width": 1440, "height": 900 },
    { "file": "02-single-plan-hero.html", "title": "Single plan hero", "tradeoff": "Strong focus; hides plan differences", "width": 1440, "height": 900 }
  ]
}
```

7. Set `width`/`height` to the artboard's intended viewport in CSS pixels; keep the manifest in sync with the files on every change. Fields: `title`, `brief`, optional `feature`, and `artboards[]` with `file`, `title`, `tradeoff`, `width`, `height`.
8. Feature / legacy ODD link: reuse the project's current tracking in its existing format, naming the artboards and chosen artboard there when appropriate; never create a second feature or log. The manifest supports `.agents/designs/features/<feature>/` and legacy `odd/tasks/<feature>.md` (whose `## Log` can record the handoff); set `feature` only for such an existing compatible locator. For other project formats, keep tracking there without inventing a manifest link. For untracked work, omit `feature` and leave the design standalone; never create a feature document just to link it.
9. UX self-check, for every artboard you finish: apply the project's UX checks first; use `gentle-ui-design` composition-and-feedback (hierarchy, density, feedback) and adaptive-interfaces (narrow screens, input access, states) guidance only for gaps, and fix every gap before you report.
10. After writing or changing artboards, call the `gentle_design` tool with `action: "open"` and the slug, unless the user said not to. When a canvas tab is already open it refreshes that tab instead of opening a new one, so call it after every change. Report the URL it returns.

## Design system sync

1. Read only, and never edit project source. Sources: CSS custom properties (`:root`, `@theme`, `[data-theme]`), the Tailwind config or v4 `@theme`, component library folders, existing token files, and the fonts they declare.
2. Reuse compatible project token artifacts instead of duplicating them. When a canvas-specific snapshot is needed, write `design/system.md`: colors (token name, value, usage), typography, spacing, radius, shadows, and component rules. Each entry names its source `path`. Record only values found in the sources.
3. Write `design/system.html`: one self-contained artboard, 1440 px wide, that renders those tokens (swatches, type scale, spacing, radius, shadows) and the core components, under the same no-external-URL rules. The canvas shows it as the first board of every design.
4. When no design sources exist, say so and propose a minimal starter system for the user to accept; never present invented values as project tokens.
5. Self-check, for every artboard you finish while `design/system.md` exists: list the colors and font families the artboard uses, compare them with the system tokens, and fix every deviation before you report.

## Canvas comments

Comments from the canvas are stored in `design/<slug>/comments.json`; the session also receives them as messages that name each comment id.

1. Read the open comments with the `gentle_design_comments` tool (`action: "list"`, optional `slug` and `file`). Without the tool, read `design/<slug>/comments.json` and use the entries whose `status` is `"open"`.
2. Apply each comment by editing only the artboard in its `file`; use `selector` and `excerpt` to find the element. When a comment has a `screenshot`, look at it first: it arrives attached to the comment message, or open `design/<slug>/<screenshot>` with the read tool. It shows what the user saw, often a transient animation or transition state that the static artboard does not show.
3. Mark each applied comment resolved with the tool (`action: "resolve"`, `slug`, `ids`). Without the tool, set its `status` to `"resolved"` and `resolvedAt` to the current ISO time, keeping every other entry and field as is. Leave comments you did not apply open, and say why.

The file format, for agents that only have file access:

```json
{
  "version": 1,
  "comments": [
    { "id": "k3x9p2ab", "file": "02-bold.html", "selector": "body > header > h1", "excerpt": "Ship faster", "comment": "Make the headline shorter.", "createdAt": "2026-10-26T10:00:00.000Z", "status": "open", "sentAt": null, "resolvedAt": null },
    { "id": "m7q2w9cd", "file": "02-bold.html", "selector": "#cta", "excerpt": "Start", "comment": "The button jumps during the hover transition.", "screenshot": ".screenshots/m7q2w9cd.png", "createdAt": "2026-10-26T10:05:00.000Z", "status": "open", "sentAt": null, "resolvedAt": null }
  ]
}
```

`screenshot` is optional: a path relative to the design folder, under `.screenshots/`, present only when the user attached an image.

Never delete or reorder entries, and keep the file valid JSON: the canvas refuses to overwrite a file it cannot parse.

## Output Contract

Return: the slug, each artboard file with its title and tradeoff, which files changed in this turn, the comment ids resolved in this turn, and any open question. Give the canvas URL from step 10, or mention that `/td:design open <slug>` shows the canvas when you did not open it. For a sync, return the source paths read, the token counts per group, and whether the system is a proposed starter; after an automatic sync from "Before designing", say it ran and report it the same way.

## References

- `design/system.md` in the project, when present — the design tokens to follow.
- Project design/UX skills — authoritative project guidance.
- `gentle-ui-design` skill — optional UX fallback for uncovered gaps.
