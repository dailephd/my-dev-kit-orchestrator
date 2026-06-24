# Changelog

## Unreleased

## v0.5.0 — Design Trace IDs and Trace Link Checking

### Added

- `src/traceModel.ts` — trace prefix constants, canonical ID regex, `isValidTracePrefix`, `isValidTraceId`, `isMalformedTraceId`
  - `TRACE_PREFIXES`: `['REQ','CTX','BEH','INV','TRN','PSE','TST','IMP','VER','RISK']`
  - `TRACE_ID_RE`: `/^(REQ|CTX|BEH|INV|TRN|PSE|TST|IMP|VER|RISK)-(\d{3,})$/`
  - `isMalformedTraceId` detects near-miss tokens (e.g., `BEH001`, `FOO-001`)
- `src/traceParser.ts` — trace ID and link parser utilities
  - `parseTraceIds(content)`: finds all valid trace IDs in text by line
  - `parseTraceLinks(content)`: finds all `FROM -> TO` link expressions
  - `findMalformedTraceIds(content)`: finds malformed trace-like tokens
  - `findDuplicateIds`, `findOrphanIds`, `findMissingLinkTargets`
  - `parseTrace(content)`: composite result of all parse functions
- `src/traceChecker.ts` — deterministic trace link checker
  - `parseDeclaredTraceIds(content)`: finds trace IDs on non-link lines only (skips `->` lines), preventing false "known target" matches
  - `checkArtifactTrace(runFolder, artifactFile)`: checks one artifact file for malformed IDs, duplicate declared IDs, orphan IDs, missing link targets
  - `checkAllTraces(meta)`: runs trace checks on all run artifact files
  - `checkDesignMapTrace(runFolder)`: checks the design-map artifact specifically
  - `trace-check-results.json` per run persists trace check results
  - `readTraceCheckResults`, `writeTraceCheckResults`
  - check codes: `TRACE_MALFORMED_ID` (fail), `TRACE_DUPLICATE_ID` (warn), `TRACE_ORPHAN_ID` (warn), `TRACE_MISSING_LINK_TARGET` (fail)
- `check` command extended with `--trace` and `--design-map` options
  - `my-dev-kit-orchestrator check --trace`: runs trace checks on all run artifacts
  - `my-dev-kit-orchestrator check --design-map`: checks DesignMap sections and trace links
  - `--strict --trace` / `--strict --design-map`: promote warns to failure in exit code
  - trace check results persisted to `trace-check-results.json` when running `--trace`
- `status` command now shows trace check summary:
  - `Trace check: N pass, N warn, N fail  (run: my-dev-kit-orchestrator check --trace)` when results exist
  - `Trace check: not run  (run: my-dev-kit-orchestrator check --trace)` before first run
- `DesignMap` artifact kind added to `SECTION_REGISTRY` in `artifactChecker.ts` with 18 required sections
- `'design-map': 'DesignMap'` added to `STAGE_TO_KIND` in `artifactChecker.ts`
- `'design-map': 'artifacts/design-map.txt'` added to `ARTIFACT_MAP` in `workflows.ts`
- `behavior-model`, `pseudocode-packet`, `test-strategy` prompts updated with optional trace ID guidance (BEH-NNN, INV-NNN, TRN-NNN, PSE-NNN, TST-NNN)
- `judge` prompt updated to request trace link review when trace IDs are present
- CI `validate.yml` updated with CLI trace smoke step
- 72 new tests in `trace-model.test.ts` and `trace-parser.test.ts`
- 39 new tests in `trace-checker.test.ts` and `v050-integration.test.ts`

### Not implemented in v0.5.0

- automatic code-to-symbol tracing
- AST-level dependency graph tracing
- test coverage instrumentation
- LLM-based trace inference
- automatic judge correction routing
- design-map visualization
- full JSON schema validation
- automatic `my-dev-kit` execution
- direct LLM-provider execution

## v0.4.0 — Artifact Content Checks and Prompt Quality Checks

### Added

- `src/artifactChecker.ts` — deterministic text-based artifact content checker
  - section requirement registry mapping artifact kinds to required section names
  - check codes: `MISSING_FILE`, `MISSING_SECTION`, `EMPTY_SECTION`, `PLACEHOLDER_CONTENT`, `STATUS_MISMATCH`
  - `CheckSeverity`: `'pass' | 'warn' | 'fail'`
  - `checkArtifact(runFolder, artifactFile, stageName, stateFile)` and `checkAllArtifacts(meta, stateFile)`
  - `parseArtifact(content)` — regex-based section parser for plain-text artifact format
  - `hasStatusMismatch` detects when artifact `Status:` field conflicts with `artifact-state.json` lifecycle state
- `src/promptChecker.ts` — prompt quality checker and check-results persistence
  - check codes: `PROMPT_MISSING_FILE`, `PROMPT_EMPTY`, `PROMPT_MISSING_STAGE_HEADER`, `PROMPT_MISSING_TASK_SECTION`, `PROMPT_MISSING_OUTPUT_ARTIFACT`, `PROMPT_PLACEHOLDER`
  - `checkPrompt(runFolder, promptFile, stageName)` and `checkAllPrompts(meta)`
  - `artifact-check-results.json` persists artifact and prompt check results per run
  - `readCheckResults(runFolder)` and `writeCheckResults(runFolder, data)` for persistence
- `check` command: `my-dev-kit-orchestrator check [--artifact <name>] [--prompts] [--strict]`
  - checks all artifacts and prompts by default
  - `--artifact <name>`: check a single artifact by stage name, filename, or basename
  - `--prompts`: check only generated prompt files
  - `--strict`: exit 1 on any `warn` (default: only exit 1 on `fail`)
  - persists results to `artifact-check-results.json` when checking all artifacts
- `status` command now shows a content check summary line:
  - `Content check: N pass, N warn, N fail  (run: my-dev-kit-orchestrator check)` when results exist
  - `Content check: not run  (run: my-dev-kit-orchestrator check)` when no results exist yet
- `artifact-check-results.json` per run at `.my-dev-kit-orchestrator/runs/<run-id>/artifact-check-results.json`
- Integration tests covering full v0.4.0 check behavior at CLI level
- CLI smoke test coverage for `check` command via `npm run smoke:cli -- check`
- GitHub Actions CI step: `CLI check smoke` covering all three OS platforms

### Not implemented in v0.4.0

- full JSON schema validation or Zod/AJV enforcement
- LLM-based artifact judging or semantic artifact grading
- automatic artifact rewriting
- automatic judge routing
- design trace IDs
- automatic `my-dev-kit` execution
- direct LLM-provider execution

## v0.3.0 — Artifact Lifecycle and Resume States

### Added

- `artifact-state.json` per run at `.my-dev-kit-orchestrator/runs/<run-id>/artifact-state.json`
- Artifact lifecycle states: `missing`, `incomplete`, `blocked`, `complete`, `stale`
- Manual states: `incomplete`, `blocked`, `complete` (set via `mark` command)
- Computed states: `missing` (no file), `stale` (upstream changed after completion)
- Backward-compatible state resolution: existing runs without `artifact-state.json` continue to work using file-existence behavior
- Stale artifact detection via upstream artifact timestamp comparison
- Lifecycle-aware `status` output: each artifact shows its lifecycle state with reason for blocked/incomplete/stale
- Lifecycle-aware `prompt` progression: blocked/incomplete/stale artifacts keep the stage at the current position
- Lifecycle context block prepended to generated prompts when current artifact is blocked, incomplete, or stale
- `mark` command: `my-dev-kit-orchestrator mark <artifact-name> --state <state> [--reason <reason>]`
  - accepts: `incomplete`, `blocked`, `complete`
  - rejects: `missing`, `stale` (computed states; cannot be set manually)
  - reason required for `blocked` and `incomplete`
  - warns when marking `complete` but artifact file does not exist
- Extraction `porting-map` dual artifact behavior preserved with lifecycle states
- Comprehensive unit and integration tests across all lifecycle state paths

### Not implemented in v0.3.0

- artifact content validation
- required-section validation
- schema validation
- judge correction routing
- design trace IDs
- automatic `my-dev-kit` execution
- direct LLM execution

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
