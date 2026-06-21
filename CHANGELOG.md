# Changelog

## Unreleased

### Added (v0.2.0 graph-guided architecture context)

- `getSupportingReportStatuses` in `stageDetector.ts`: checks known supporting report presence per run
- `SupportingReportStatus` interface in `stageDetector.ts`
- `status` command now shows a Supporting reports section with present/missing status for `reports/architecture-context-retrieval-report.txt`

### Changed (v0.2.0 graph-guided architecture context)

- architecture-context stage prompt updated with full 8-step graph-guided retrieval sequence
- architecture-context prompt now specifies both output paths explicitly (retrieval report and ArchitectureContextPacket)
- architecture-context prompt now includes retrieval evidence report template
- architecture-context prompt now includes expanded ArchitectureContextPacket template with retrieval evidence fields
- architecture-context prompt instructs synthesis of retrieval evidence, not direct dumping
- architecture-context prompt includes fallback guidance for when `my-dev-kit` is unavailable

### Documentation

- clarified the graph-guided architecture context design
- documented the retrieval evidence report and ArchitectureContextPacket synthesis
- clarified the relationship between `my-dev-kit` and `my-dev-kit-orchestrator`
- updated `docs/ROADMAP.md` to show v0.2.0 as implemented

## v0.1.0

Initial release of `my-dev-kit-orchestrator`.

Included in `v0.1.0`:

- CLI commands: `init`, `start`, `status`, `prompt`, and `list`
- workflow modes: `feature`, `repair`, `test`, `refactor`, and `harden`
- local workspace initialization under `.my-dev-kit-orchestrator/`
- run creation with `00-request.txt`, `run.json`, `prompts/`, `artifacts/`, and `reports/`
- generated stage prompt files for each workflow mode
- plain-text artifact naming and file-existence stage tracking
- run inspection via `status` and `list`
- prompt retrieval for the next or selected stage via `prompt`
- Jest test coverage for command behavior, workflow definitions, prompt generation, and run management

Not included in `v0.1.0`:

- direct LLM execution
- automatic `my-dev-kit` execution
- JSON-schema-heavy artifact validation
- automatic judge routing
- design-map generation
