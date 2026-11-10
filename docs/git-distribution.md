# Tomidev installs from its Git repository

The npm package name `tomidev` is not this fork's distribution source. Installers
and updates use `TommiL90/tomidev-shell`; the executable and installed package
identity remain `tomidev`. Git must be available to the package manager.

## Source pins

| Operation | Tomidev source |
|---|---|
| Standard installer, started by either bootstrap | `git:github.com/TommiL90/tomidev-shell#v<installer-version>` |
| Bundled distribution project | The same Git tag, alongside the exact Pi version and verified lockfile |
| `tomidev upgrade` on release | Latest stable GitHub release's `vX.Y.Z` tag |
| `tomidev update` with a global Tomidev-owned Pi peer | Current Tomidev version's `vX.Y.Z` tag; re-resolves Pi without upgrading Tomidev |
| Main-channel Tomidev package | Exact `main` commit, fetched from the repository's source archive and packed locally |
| `tomidev update` with a main build's Pi peer | Existing locally packed main tarball; no registry fallback |

A standalone globally installed Pi still updates from its own registry package,
`@earendil-works/pi-coding-agent`. Source-linked checkout updates keep their
existing local dependency-range and lockfile behavior. External companions such
as `gentle-engram` keep their own distribution sources.

## Release discovery

`tomidev upgrade` requests
`https://api.github.com/repos/TommiL90/tomidev-shell/releases/latest`. Only a
stable `vX.Y.Z` tag is accepted; draft, prerelease and malformed responses are
rejected. The selected tag becomes the package-manager argument, for example
`git:github.com/TommiL90/tomidev-shell#v4.8.0`. No request to the npm registry's
`tomidev` package is made. No published GitHub release, an API rate limit or a
network error stops the upgrade without changing installed packages or channel
state. Git tags must name source whose package version matches the tag.

The central source definitions are `SOURCE_REPOSITORY` and `GIT_SOURCE` in
`lib/brand.ts`, mirrored into `runtime/brand.mjs` by the runtime build. Network
and command execution remain host adapters, so distribution tests use fakes.

Installation and upgrades no longer require, verify, download or build Gentle AI.
Main builds pack only tomidev from the fork; no Go toolchain or development-binary
registration is involved. Windows bundled installation also has no Go prerequisite.
Setup provisions gentle-engram, pi-web-access and pi-btw through Pi and keeps MCP
enabled. Review uses `requesting-code-review` and independent verification, not
an external review binary. Legacy channel records and old-install migration remain readable.
