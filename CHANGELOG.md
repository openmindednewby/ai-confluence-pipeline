# Changelog

All notable changes to **Katastasi** are documented here. Format: [Keep a Changelog](https://keepachangelog.com),
versioning: [SemVer](https://semver.org).

## [0.2.0] — 2026-06-22 — Rebrand to Katastasi (Phase 0)

The project is now **Katastasi** — an open-source documentation, task-tracking, and testing framework
(see [VISION.md](VISION.md)). This release is the identity + distribution unlock; no capabilities were
removed.

### Changed
- **Renamed** `ai-confluence-pipeline` → `katastasi`. Primary binary is `katastasi` (alias `kat`);
  `acp` / `acp-mcp` continue to work through the transition.
- README now leads with the framework (documentation · task-tracking · testing). The n8n AI-publishing
  flow is retained as an optional **"AI authoring"** add-on.
- MCP server identifies as `katastasi`.

### Added
- **Distribution:** published to npm as `katastasi` and `@dloizides/katastasi`; a public Docker image on
  GHCR (`ghcr.io/openmindednewby/katastasi`); a published GitHub Action (`uses: openmindednewby/katastasi@v1`);
  GitLab CI + pre-commit templates in `docs/ci/`.
- `VISION.md`, this `CHANGELOG.md`, and CI/release GitHub workflows.

### Notes
- No breaking changes to commands or config. `acp-trace.json` and all `acp …` invocations still work.

---

Earlier history (pre-rebrand, as `ai-confluence-pipeline`): markdown ⇄ Jira/Confluence (both ways),
`acp trace` (requirements traceability + regression pipeline), `acp analyze` / `acp pipeline` (BA →
development-ready flow), `acp questions` (interactive decisions), company-agnostic sources/sinks, and the
MCP server. See the git log for details.
