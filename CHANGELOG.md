# Changelog

## Unreleased

## v1.3.1 - Standardized Greenfield Documentation and Full-Stack Next.js Environment Hardening

Release date: 2026-08-09.

### Added

- standardized 15-file canonical greenfield document baseline (`README.md`,
  `CHANGELOG.md`, and 13 `docs/*.md` files) applied to all three starter
  profiles, with content derived from each project's actual brief, profile,
  and capability instead of copied ecosystem prose; no default
  `DATABASE.md`/`ENVIRONMENT.md`/`TESTING.md`/`DEPLOYMENT.md` taxonomy
- orthogonal `projectType`/`webFramework` brief dimensions, additive to
  starter-profile selection; legacy briefs without these fields remain valid
- the first explicit full-stack web environment contract: the existing
  `nextjs-app` starter profile combined with `fullstack-web`/`nextjs` intent,
  PostgreSQL, Prisma, and Docker, composed additively into scaffold planning
  (Dockerfile, Compose files, Prisma schema, environment templates, readiness
  scripts, a database-backed first vertical slice) rather than a new profile
  or a parallel scaffold format
- canonical greenfield readiness extended with full-stack generated-file and
  verification-command evidence, and a three-way distinct proof requirement
  for PostgreSQL health, application liveness, and application/database
  readiness
- a judge/final-report lifecycle correction: final-report eligibility for
  every greenfield run now also requires canonical greenfield readiness, so
  an authored judge `PASS` can no longer override incomplete readiness; the
  gate is generic to greenfield runs, not hard-coded to full-stack, with a
  narrow legacy-run carve-out
- a corrected verification-report artifact path so the generated
  verification/judge/final-report prompts, canonical greenfield readiness,
  and final-report artifact-lifecycle validation all read and write the same
  file, making the lifecycle correction above reachable by a real generated
  workflow run (a pre-existing, unrelated path inconsistency, found and
  fixed during this work)
- no new starter profile, CLI flag, workflow mode, or native stage; the CLI
  remains eight commands, seven modes, 79 native stages, and greenfield
  remains 13 stages and three starter profiles; the orchestrator still never
  executes Docker, PostgreSQL, Prisma, or any other project command itself

## v1.3.0 - Mobile Profile Expansion and Scaffold Verification

Release date: 2026-08-04.

### Added

- shared, immutable profile-local and registry-wide validation for every
  current greenfield starter profile, with stable `GF_*` issue codes
  (code, severity, profile, affected contract, reason, corrective action)
- explicit command contracts (`setupCommands`/`validationCommands`) with
  required-versus-optional classification and honest `environmentNotes`
  applicability guidance, plus a closed, profile-owned documentation
  terminology vocabulary
- exact and bounded-pattern target expectations per profile, including
  path-safety normalization (traversal/absolute rejection) and bounded
  overlap detection between expectations
- scaffold-plan conformance validation against the selected profile's
  targets and commands, and deterministic parsing of a persisted
  `scaffold-plan.txt` artifact back into a validated plan
- layered generated-file evidence: profile-required targets are checked
  against the scaffold implementation report, with optional read-only
  filesystem corroboration that never treats a directory or symlink as
  satisfying a file expectation
- verification-command evidence parsing, including honest optional-command
  skip reasons and detection of unsupported "passed" claims with no
  recorded evidence
- first-vertical-slice readiness checks tied to the selected profile and
  product boundary
- `status` and `check`/`check --all` now surface greenfield scaffold and
  readiness findings using the same shared, deterministic issue model as
  every other check
- explicit, deterministic compatibility treatment for greenfield runs
  created before this validation existed, so older runs are not
  retroactively failed for evidence they could not have produced
- strengthened fixture coverage across all three current starter profiles
  (`typescript-cli`, `nextjs-app`, `android-compose`), including disk-backed
  readiness coverage through the real run-reading path, not only in-memory
  evaluation

### Compatibility and limits

- no new CLI command, workflow mode, or native stage
- no new starter profile; three profiles remain supported
- no command execution is performed by any of the above; profile setup and
  validation commands remain descriptive guidance only
- old runs, existing artifact filenames, and existing lifecycle behavior
  remain compatible

## v1.2.3 - Run-Integrity and Judge-Verdict Enforcement

Release date: 2026-08-01.

### Added

- one canonical run-integrity decision consumed by prompt selection,
  lifecycle resolution, stage detection, `mark`, `status`, `check`,
  `check --all`, and `export`, replacing per-command readiness recomputation
- canonical judge-verdict acceptance: the expected verdict is derived from
  the same run-integrity decision, and correction routing for an accepted
  `NEED_CONTEXT` uses the canonical recovery stage
- final-report eligibility requiring an accepted `PASS` verdict, no active
  correction route, and no remaining readiness blocker
- consumption of the corrected `my-dev-kit` v1.10.4 producer contract's
  additive evidence when present (condition-aware role adequacy and dedicated
  required-condition-witness-loss diagnostics, independent of general
  truncation), revalidated against the released
  `@dailephd/my-dev-kit@1.10.4` package
- a permanent frozen-defect regression fixture and a corrected-evidence
  positive replay fixture, plus the full required positive/negative
  compatibility matrix

### Changed

- Node.js 24 is now the minimum runtime and the required local, CI, and release
  validation version; Node.js 20 and Node.js 22 were removed from active
  support and workflow requirements, while the existing Node.js 26
  pre-release jobs remain supplementary forward-compatibility coverage
- an authored judge `Verdict: PASS` is now rejected when canonical readiness
  still requires `NEED_CONTEXT`, and routes back to the blocked stage instead
  of clearing correction state
- `export` now reports the same accepted judge state as `status` and `check`
  instead of an unreconciled authored verdict
- supplemental packet/report declarations that agree with each other but
  contradict raw producer evidence now fail closed instead of being accepted

### Fixed

- a repository-context-blocked run could previously reach a normal `PASS`
  final report through an authored judge verdict that contradicted canonical
  readiness; artifact presence and a manual `complete` mark could also make a
  blocked or ineligible stage appear complete. Both are now rejected across
  every readiness-sensitive command.

### Compatibility and limits

- schema-major-1 producer evidence, legacy runs without a repository-context
  requirement, `greenfield`'s context exemption, `test` mode's test-context-only
  requirement, extraction's source/target separation, and existing non-context
  correction routing all remain compatible
- no new workflow, native stage, schema major, or public judge verdict was
  added

## v1.2.2 - Context Readiness and Documentation Safeguards

Release date: 2026-07-28.

### Added

- canonical actionable context-blocker summaries with a primary code and
  reason, corrective action, evidence target, and deterministic blocking and
  supporting issue-code lists
- production-level historical readiness-matrix coverage across valid,
  contradictory, mismatched, truncated, unmapped, stale, and legacy evidence
- preservation-manifest checks for the actionable blocker contract, unreleased
  version status, and unsupported context-identity claims

### Changed

- `status`, `check`, prompts, verification, judge, correction routing, and
  export now present the same canonical blocker information
- test-responsibility parsing distinguishes actual responsibility entries from
  packet preamble, coverage, risk, verification, downstream-use, and status
  sections while retaining malformed, duplicate, and missing-ID diagnostics
- documentation now distinguishes the published `v1.2.1` package history from
  the shipped `v1.2.2` source state

### Fixed

- every refresh-required result now has an actionable issue and deterministic
  primary blocker
- raw and supplemental evidence contradictions, repository/index mismatch,
  required truncation, missing provenance, and incomplete critical mappings
  remain fail closed across all consumers
- public architecture wording no longer claims unsupported workflow, stage, or
  run identity validation

### Compatibility and limits

- schema-major-1 evidence, legacy runs, stage order, verdicts, CLI commands,
  and manual `my-dev-kit` execution remain compatible
- verified against the published `@dailephd/my-dev-kit@1.10.3` producer
  package for role-aware producer behavior; manual retrieval still requires
  selecting and running a verified producer CLI

## v1.2.1 - Workflow Instruction and Context Readiness

Release date: 2026-07-21.

### Added

- Added the typed `1.0.0` workflow-instruction catalog, stable exact IDs,
  catalog validation, exact dependency resolution, and deterministic budget
  accounting.
- Added `WorkflowInstructionPacket` schema `1.0.0` and deterministic
  instruction-packet sidecars for all 79 native stages.
- Added in-memory `TaskState` and `StageContextBundle` schemas `1.0.0`.
- Added `1.0.0` supplemental context packet and retrieval-report contracts,
  templates, raw-evidence references, and the exact 11-stage implementation/
  test repository-evidence requirement registry.
- Added `ContextReadiness` schema `1.0.0`, including freshness, adequacy,
  provenance, required-evidence truncation, and critical responsibility-
  mapping checks.
- Added structured context-readiness visibility to `status`, `check`,
  `check --all`, and `export`.

### Changed

- Context-sensitive implementation and test-implementation prompts render
  refresh-only work when required evidence is not ready.
- Verification and judge prompts review mode-required context; blocked judge
  prompts use the existing `NEED_CONTEXT` verdict with a deterministic exact
  `Recommended next stage`.
- `TestStrategyPacket` responsibilities now declare criticality, and critical
  responsibilities require repository-evidence mappings before test
  implementation can proceed.
- Required packet content is preserved even when over budget; optional
  truncation is explicit and deterministic.

### Fixed

- Fixed the stage-instruction placeholder completeness defect so every native
  stage has complete catalog-owned instruction content.

### Compatibility

- Preserved all seven workflow modes, all 79 native stage names and ordering,
  the eight CLI commands, prompt filenames, lifecycle behavior, judge
  verdicts, correction routing, and legacy run loading.
- Added deterministic, cross-platform, prompt-compatibility, package, and
  legacy-run coverage. Two greenfield scaffold prompts retain their existing
  specialized renderer while still receiving catalog entries and sidecars.

### Known limitations

- `my-dev-kit` retrieval remains manual; the orchestrator does not execute an
  external context engine.
- At the time `v1.2.1` was released, the published package labeled
  `my-dev-kit` 1.10.2 showed a CLI identity/command mismatch from the verified
  role-aware 1.10.2 source contract, so manual integration required a verified
  CLI.
- Extraction command examples are not fully promoted into command catalog
  entries, and generic non-`NEED_CONTEXT` extraction architecture-context
  routing remains a pre-existing edge case.

## v1.2.0 - Android Compose Greenfield Profile

- added `android-compose` as a third supported greenfield starter profile,
  alongside `typescript-cli` and `nextjs-app`
- added required `setupCommands` and `validationCommands` fields to the
  `GreenfieldProfile` contract (a minimal, never-executed
  `{ command, purpose, required, environmentNotes? }` shape); backfilled onto
  the existing two profiles with no behavior change
- added a small, explicit, bounded alias table for Android Compose requests
  (`android`, `kotlin-compose`, `jetpack-compose`, `compose-android`); no
  fuzzy matching
- added the first real use of the `'unresolved'` profile-selection status:
  generic "mobile", "mobile app", or "phone app" requests are reported as
  unresolved rather than silently mapped to a profile
- iOS, Flutter, and React Native remain unaliased and unsupported
- made bootstrap-bundle validation rules and `validateBootstrapDocs()`
  profile-conditional: Android/Jetpack/Kotlin/Gradle content is permitted
  only when the selected profile is `android-compose`; iOS/React
  Native/Flutter/multiplatform and Play Store/release-readiness claims
  remain rejected for every profile
- made `buildScaffoldPlan()` read `setupCommands`/`validationCommands`
  directly from the selected profile instead of a hardcoded npm assumption;
  Android Compose scaffold plans get an empty setup step and Gradle-based
  validation commands (`./gradlew build`, `./gradlew testDebugUnitTest`, and
  an optional device/emulator-dependent `./gradlew connectedAndroidTest`)
- corrected 6 stale static stage-prompt lines (in `src/promptGenerator.ts`
  and `src/greenfield/scaffold/renderScaffoldPrompt.ts`) left over from when
  Android Compose was out of scope, which had blanket-forbidden Android/
  mobile content or listed only two supported profiles
- added CLI-level, check-level, and export-level regression coverage proving
  Android Compose works through the full user-facing command surface, with
  no Gradle execution and no Android SDK requirement anywhere in the test
  suite
- hardened `scripts/check-docs-consistency.mjs` to extract the supported
  greenfield profile list from source instead of a hardcoded two-profile
  regex, and to distinguish legitimate "supports Android Compose" claims
  from misleading generic-mobile/iOS/Flutter/React-Native claims
- repaired README.md, docs/WORKFLOWS.md, docs/ARTIFACTS.md,
  docs/ARCHITECTURE.md, docs/DEVELOPMENT.md, and docs/RELEASE_CHECKLIST.md
  to describe the current three-profile greenfield foundation accurately

Known limitations in `v1.2.0`:

- `platformTarget`-only Android auto-selection (e.g. selecting
  `android-compose` from a bare `platformTarget: "android"` with no explicit
  profile request) remains an open, deliberately unimplemented design
  question, not a silent default
- component docs remain empty until the brief schema adds module/component
  hints
- the repository still has split `src/__tests__/*.test.ts` and
  `tests/**/*.spec.ts` conventions
- optional empirical `my-dev-kit` Kotlin-source indexing support has not
  been checked; this does not block Android Compose profile support, which
  is planning/prompt guidance only, not indexing

## v1.1.0 - Greenfield Bootstrap Foundation

Released.

- added `greenfield` as the seventh workflow mode with 13 bounded stages
- added project-brief loading and deterministic normalization
- added the platform-neutral profile foundation with `typescript-cli` and
  `nextjs-app` profiles
- added the pure, deterministic `GreenfieldBootstrapBundle` runtime
- added structured in-memory project-doc bootstrap and unsupported-claim
  validation
- added scaffold planning and implementation prompts, first-vertical-slice
  guidance, and the initial `my-dev-kit` indexing handoff prompt
- extended the shared mode, workflow, artifact, stage-kind, and section
  registries rather than creating parallel greenfield infrastructure
- added greenfield regression coverage for `check --artifacts`, `check --all`,
  `export`, and existing modes
- added a target-owned `test:security` contract for package metadata and
  tarball-content validation
- fixed the cross-mode `export --out` traversal guard so raw parent-path
  traversal attempts such as `../x.txt` are rejected before path resolution
- verified the Node 22 and Node 24 GitHub Actions matrix across
  `windows-latest`, `macos-15`, and `ubuntu-latest`
- completed `my-dev-kit-lab` security validation for release preparation
- retained the shared artifact checker and contract checker; a separate
  `validateGreenfieldArtifacts.ts` was intentionally unnecessary
- deferred Android and mobile profiles to v1.2.0 or later

Known limitations in the released `v1.1.0` line:

- component docs remain empty until the brief schema adds module/component hints
- the repository still has split `src/__tests__/*.test.ts` and
  `tests/**/*.spec.ts` conventions
- Android/mobile support remains deferred to v1.2.0 or later

## v1.0.0 - Stable Workflow Contract and Portable Run Handoff

### Added

- `src/contractChecker.ts` - artifact contract checker model
  - `checkArtifactContract()`: deterministic checks per artifact (MISSING_FILE, EMPTY_FILE, MISSING_SECTION, BLANK_SECTION, PLACEHOLDER_SECTION, PREDECESSOR_MISSING, UNKNOWN_MODE, UNKNOWN_STAGE, STAGE_NO_CONTRACT)
  - `checkRunArtifactContracts()`: run-level contract check across all stages
  - `checkStageGates()`: critical stage dependency checks across supported workflow modes
  - `resolveArtifactContractsForMode()`: returns ModeContractSummary with stage/artifact/predecessor/section metadata for all modes
  - Strict mode: promotes BLANK_SECTION, PLACEHOLDER_SECTION, PREDECESSOR_MISSING, STAGE_NO_CONTRACT from warn to fail
- `check --artifacts`: run v1 artifact contract check for all stages in the current run
  - per-artifact output with code/severity/stage/mode/suggestedFix
- `check --all`: combined check including contracts, stage gates, trace, design-map (if present), correction routing
  - section-headered output, persists trace results, includes trace correction suggestions
- `export` command: `my-dev-kit-orchestrator export [--run <id>] [--out <file>] [--overwrite]`
  - portable plain-text run handoff with run identity, request, artifact checklist, missing artifacts, judge verdict, correction state, verification evidence excerpt, content/trace check summaries, next command
  - path checks refuse symlinks, existing files without --overwrite, and
    non-existent parent directories; complete traversal rejection is a known
    follow-up
  - default: print to stdout; --out file: write to file

### Changed

- CI: pinned macos runner to macos-15 (previously macos-latest)
- Added CLI export smoke step to CI validate workflow

## v0.6.0 - Judge Correction Routing and Trace-Aware Workflow Recovery

### Added

- `src/judgeParser.ts` - judge verdict parser
  - `JUDGE_VERDICTS`: `['PASS','DESIGN_INCOMPLETE','PSEUDOCODE_INCOMPLETE','IMPLEMENTATION_MISMATCH','TEST_COVERAGE_INCOMPLETE','ARCHITECTURE_MISMATCH','NEED_VERIFICATION','NEED_CONTEXT','SCOPE_VIOLATION','BLOCKED']`
  - `JudgeVerdict` type, `isValidVerdict()` type guard
  - `parseJudgeReport(content)`: parses `Verdict:` and `Recommended next stage:` from judge report text
    - returns null verdict with `parseError` for unrecognized tokens
    - returns null verdict without error when field is absent
    - case-insensitive `Verdict:` label matching
    - robust to extra surrounding prose in judge report
- `src/correctionRouter.ts` - deterministic correction routing model
  - `CORRECTABLE_STAGES` const: `['architecture-context','behavior-model','pseudocode-packet','test-strategy','test-implementation','implementation','verification']`
  - `routeJudgeVerdict(parsed, options)`: routes verdict to a correction stage
  - `parseAndRoute(content, options)`: parse + route in one call
  - routing table: `NEED_CONTEXT -> architecture-context`, `DESIGN_INCOMPLETE -> behavior-model`, `PSEUDOCODE_INCOMPLETE -> pseudocode-packet`, `IMPLEMENTATION_MISMATCH -> implementation`, `TEST_COVERAGE_INCOMPLETE -> test-strategy`, `ARCHITECTURE_MISMATCH -> architecture-context`, `NEED_VERIFICATION -> verification`
  - `SCOPE_VIOLATION` and `BLOCKED` route to `blocked` status - no correction stage
  - recommended stage overrides table default when it is a valid correctable stage
  - conflict between table and recommended stage: warning (normal mode) / `strictFail` + error (strict mode)
  - unknown verdict: `unknown_verdict` status with parse error
  - missing verdict: `missing_verdict` status
  - no file I/O, no automatic code modification, pure routing functions
- `src/correctionState.ts` - reads judge-report.txt and computes correction route
  - `readCorrectionState(runFolder, options)`: returns `CorrectionRouteResult` or null when no judge report exists
  - `isCorrectionActive(runFolder)`: true when correction is required with a correctable stage
- `status` command extended with Judge correction section
  - `PASS`: shows "Judge correction: PASS - no correction required"
  - correction required: shows verdict, routed stage, and routing warnings
  - blocked: shows blocked state message
  - unknown or missing verdict: shows error or note
  - no judge report: section omitted (backward compatible)
- `prompt` command extended with correction routing
  - when correction active: generates correction-stage prompt for the routed stage
  - when blocked: prints blocked state message instead of next stage prompt
  - normal flow unchanged when no judge report present (backward compatible)
- `generateCorrectionPrompt(meta, correctionState)` in `promptGenerator.ts`
  - bounded, stage-specific correction prompt
  - includes judge-report.txt, prior stage artifact inputs, and design-map when present
  - stop conditions: revise only the corrected stage, no automatic execution, no broadened scope
  - does not include unrelated workflow modes or giant instruction sets
- `src/traceChecker.ts` extended with trace-aware correction suggestions
  - `suggestCorrectionStageFromTraceIssue(issue)`: deterministic prefix-to-stage mapping
    - `TRACE_MISSING_LINK_TARGET`: maps target ID prefix to owning stage (`BEH -> behavior-model`, `PSE -> pseudocode-packet`, `TST -> test-strategy`, `VER -> verification`, etc.)
    - `TRACE_MALFORMED_ID` and `TRACE_ORPHAN_ID`: suggest `design-map`
  - `buildTraceCorrectionSuggestions(results)`: returns deduplicated suggestion strings
- `check --trace` and `check --design-map` output now includes correction suggestions when trace issues exist
- CI `validate.yml` updated with CLI correction smoke step
- 54 tests in `src/__tests__/judge-parser.test.ts`
- 40 tests in `src/__tests__/correction-router.test.ts`
- 24 tests in `src/__tests__/v060-integration.test.ts`
- correction smoke in `scripts/cli-smoke.mjs` covering all major routing paths

### Not implemented in v0.6.0

- automatic code modification after a judge failure
- automatic judge correction execution or agent routing
- LLM-based trace inference or judge inference
- multi-agent runtime
- automatic `my-dev-kit` execution
- direct LLM-provider execution
- design-map visualization
- AST-level dependency graph tracing
- test coverage instrumentation
- full JSON schema validation

## v0.5.0 - Design Trace IDs and Trace Link Checking

### Added

- `src/traceModel.ts` - trace prefix constants, canonical ID regex, `isValidTracePrefix`, `isValidTraceId`, `isMalformedTraceId`
  - `TRACE_PREFIXES`: `['REQ','CTX','BEH','INV','TRN','PSE','TST','IMP','VER','RISK']`
  - `TRACE_ID_RE`: `/^(REQ|CTX|BEH|INV|TRN|PSE|TST|IMP|VER|RISK)-(\d{3,})$/`
  - `isMalformedTraceId` detects near-miss tokens (e.g., `BEH001`, `FOO-001`)
- `src/traceParser.ts` - trace ID and link parser utilities
  - `parseTraceIds(content)`: finds all valid trace IDs in text by line
  - `parseTraceLinks(content)`: finds all `FROM -> TO` link expressions
  - `findMalformedTraceIds(content)`: finds malformed trace-like tokens
  - `findDuplicateIds`, `findOrphanIds`, `findMissingLinkTargets`
  - `parseTrace(content)`: composite result of all parse functions
- `src/traceChecker.ts` - deterministic trace link checker
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

## v0.4.0 - Artifact Content Checks and Prompt Quality Checks

### Added

- `src/artifactChecker.ts` - deterministic text-based artifact content checker
  - section requirement registry mapping artifact kinds to required section names
  - check codes: `MISSING_FILE`, `MISSING_SECTION`, `EMPTY_SECTION`, `PLACEHOLDER_CONTENT`, `STATUS_MISMATCH`
  - `CheckSeverity`: `'pass' | 'warn' | 'fail'`
  - `checkArtifact(runFolder, artifactFile, stageName, stateFile)` and `checkAllArtifacts(meta, stateFile)`
  - `parseArtifact(content)` - regex-based section parser for plain-text artifact format
  - `hasStatusMismatch` detects when artifact `Status:` field conflicts with `artifact-state.json` lifecycle state
- `src/promptChecker.ts` - prompt quality checker and check-results persistence
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

## v0.3.0 - Artifact Lifecycle and Resume States

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

## v0.2.1 - Extraction Mode

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

## v0.2.1 - Documentation preparation

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

**Note:** Documentation-only preparation entry. Runtime implementation shipped in the `v0.2.1 - Extraction Mode` entry above.

## v0.2.0 - Graph-Guided Architecture Context

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

## v0.1.0 - Workflow Shell

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
