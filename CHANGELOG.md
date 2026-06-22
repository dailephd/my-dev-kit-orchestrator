# Changelog

## Unreleased

## v0.2.1 — Extraction Mode

### Added

- `--mode extraction` workflow mode for source-to-target behavior transfer
- `--source <path>` and `--target <path>` options for extraction runs
- extraction-specific 14-stage workflow order
- extraction artifact gates:
  - `SourceArchitectureContextPacket` at `artifacts/source-architecture-context-packet.txt`
  - `SourceWorkflowMap` at `artifacts/source-workflow-map.txt`
  - `SourceToTargetPortingMap` at `artifacts/source-to-target-porting-map.txt`
  - `DoNotPortList` at `artifacts/do-not-port-list.txt` (dual artifact with `porting-map` stage)
  - `GoldenBehaviorContract` at `artifacts/golden-behavior-contract.txt`
  - `TargetArchitectureProposal` at `artifacts/target-architecture-proposal.txt`
- source repository and target repository metadata stored in `run.json`
- extraction-specific prompt generation for all 14 stages
- source-architecture-context supporting report entry in `status`
- source and target repository paths shown in `status` output
- extraction run artifacts placed under target repository by default
- documented guardrails against cloning source repository architecture
- relative `--source` and `--target` paths normalized to absolute run metadata

### Cross-platform validation

- GitHub Actions validation matrix added for `ubuntu-latest`, `windows-latest`, and `macos-latest`
- typecheck, tests, build, lint, CLI smoke, and extraction CLI smoke covered in CI
- extraction mode tested with OS-native temporary paths
- extraction mode tested with paths containing spaces
- macOS canonical temp-path alias handled in cross-platform tests

### Notes

- source repositories are treated as read-only evidence by default
- target repositories are the implementation destination
- `--create-target` remains future behavior and is not implemented
- `--mode extraction` requires both `--source` and `--target`; errors clearly if either is missing

**Not published to npm.** Tag will be created on release preparation.

## v0.2.1 — Documentation preparation

### Added

- documented planned `--mode extraction` workflow for source-to-target behavior transfer
- documented source repository and target repository roles
- documented source-to-target porting model and do-not-port guardrails
- documented extraction-specific stage order
- documented extraction artifact contracts:
  - `SourceWorkflowMap`
  - `SourceToTargetPortingMap`
  - `DoNotPortList`
  - `GoldenBehaviorContract`
  - `TargetArchitectureProposal`
- documented source and target `.my-dev-kit` index separation
- documented golden behavior contract as mandatory gate before pseudocode and test strategy
- documented guardrails against cloning source repository architecture into the target project
- added v0.2.1 planned extraction mode milestone to `docs/ROADMAP.md`
- added extraction mode architecture section to `docs/ARCHITECTURE.md`
- added extraction workflow to `docs/WORKFLOWS.md`
- added extraction artifact contracts to `docs/ARTIFACTS.md`
- added extraction mode examples to `docs/USAGE.md`
- added `docs/RELEASE_CHECKLIST.md` with v0.2.1 verification items

**Note:** Documentation-only preparation entry. Runtime implementation shipped in the `v0.2.1 — Extraction Mode` entry above.

## v0.2.0 — Graph-Guided Architecture Context

### Added

- `getSupportingReportStatuses` in `stageDetector.ts`: checks known supporting report presence per run
- `SupportingReportStatus` interface in `stageDetector.ts`
- `status` command now shows a Supporting reports section with present/missing status for `reports/architecture-context-retrieval-report.txt`

### Changed

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

**Note:** Tagged as `v0.2.0` in git. Not published to npm.

## v0.1.0 — Workflow Shell

Initial release of `my-dev-kit-orchestrator`.

### Added

- CLI commands: `init`, `start`, `status`, `prompt`, and `list`
- workflow modes: `feature`, `repair`, `test`, `refactor`, and `harden`
- local workspace initialization under `.my-dev-kit-orchestrator/`
- run creation with `00-request.txt`, `run.json`, `prompts/`, `artifacts/`, and `reports/`
- generated stage prompt files for each workflow mode
- plain-text artifact naming and file-existence stage tracking
- run inspection via `status` and `list`
- prompt retrieval for the next or selected stage via `prompt`
- Jest test coverage for command behavior, workflow definitions, prompt generation, and run management

### Not included in v0.1.0

- direct LLM execution
- automatic `my-dev-kit` execution
- JSON-schema-heavy artifact validation
- automatic judge routing
- design-map generation
