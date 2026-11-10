# Decisions, lessons and Engram

Engram supports memory across sessions; approved requirements, current plan/checks and live code
remain authoritative. Use the official per-user integration installed with engram setup <client>.
The client loads MCP and its supported plugin/protocol when a new session starts. No custom
per-project activation command is required. The shared local database is ~/.engram/engram.db.

At session start resolve mem_current_project and compare it with the nearest .engram/config.json.
Use its stable project_name for this repository. Search that project narrowly: mem_context for
recent context, focused mem_search, then fetch only relevant observations by ID. Do not perform
an unfiltered global recall by default. Cross-repo workspace decisions use workspace projects explicitly;
repository knowledge stays in its own project. Check remembered claims against current code.

Use the host's actually exposed tools and the official adapter lifecycle. Codex/Claude/OpenCode
plugins provide session handling; never invent a session ID or claim hooks ran without evidence.
Follow the installed Memory Protocol for meaningful saves and summaries, respecting explicit user
storage constraints and higher-priority host rules. Keep verified decisions/discoveries concise
with project scope and stable topic_key; update evolving topics rather than duplicating history.

Do not upload the database, enable Cloud/Git Sync, or export memory into client repositories.
No tokens, secrets, customer payloads or bulk transcripts in observations. Project selection is
logical organization, not a security boundary. If tools are unavailable or the project cannot be
established, report the missing evidence and continue with the local task artifacts.

STATE.md may retain approved AD-NNN decisions. lessons.py can maintain focused local lessons
when needed, without duplicating complete Engram histories or creating another workflow tree.

## Compaction and handoff

Keep actual approvals and decisions in the feature plan/checks with date and source; record real dispatched and returned roles in handoff.md. After compaction re-read the skill and current phase reference and reconcile artifacts against the live tree; never infer an approval or agent identity. Engram supplements these feature records.
