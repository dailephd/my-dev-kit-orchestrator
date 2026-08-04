# Roadmap

Versions are listed in chronological order.

`v1.3.0` is the current published release. `v1.2.3`, `v1.2.2`, `v1.2.1`,
`v1.2.0`, `v1.1.0`, `v1.0.0`, and the `v0.x.0` releases remain part of the
published project history. Versions after `v1.3.0` are planned milestones.

## Version summary

- `v0.1.0` established the first usable CLI workflow shell with init/start/prompt/status/list, local run folders, supported modes, text artifacts, and stage-specific prompts for design-first coding-agent workflows.
- `v0.2.0` stabilized graph-guided architecture context retrieval and artifact handoff for downstream stages.
- `v0.2.1` added the extraction workflow and cross-platform validation.
- `v0.3.0` stabilized the artifact lifecycle with explicit states, stale detection, and resumable prompt progression.
- `v0.4.0` added deterministic artifact content checks and prompt-quality checks.
- `v0.5.0` added Design Trace and DesignMap support across requirements, context, behavior, invariants, transitions, pseudocode, tests, implementation, verification, and risks.
- `v0.6.0` added judge correction routing and trace-aware workflow recovery.
- `v1.0.0` stabilizes the workflow contract with artifact quality gates, mode-aware check behavior, stage-gate validation, combined check coverage, portable run handoff export, and preserved v0.5.0/v0.6.0 compatibility.
- `v1.1.0` publishes the platform-neutral Greenfield Project Bootstrap foundation so a new project can move from idea to brief, product boundary, stack/profile decision, bootstrap bundle, docs, scaffold plan, first runnable slice, verification, and initial my-dev-kit handoff.
- `v1.2.0` adds `android-compose` as an explicit, opt-in greenfield starter profile alongside `typescript-cli` and `nextjs-app`, with profile-guided stack defaults, scaffold-plan/validation-command guidance, and profile-conditional docs validation. It does not add a CLI profile flag or automatic signal-based routing to Android Compose; profile selection stays explicit (see "Published v1.2.0" for what shipped versus what was originally planned).
- `v1.2.1` publishes a stable instruction catalog, deterministic per-stage packets and sidecars, manually supplied repository-context contracts, readiness gates, and additive status/check/export/judge integration without changing the CLI or native workflows.
- `v1.2.2` implements actionable fail-closed readiness blockers, consistent consumer propagation, responsibility-parser hardening, a historical readiness matrix, and permanent documentation anti-drift checks.
- `v1.2.3` corrects a producer-adequacy defect that let a repository-context-blocked run reach a normal `PASS` final report; it adds one canonical run-integrity decision, canonical judge-verdict acceptance, and final-report eligibility enforcement across every readiness-sensitive command. Released on 2026-08-01 and revalidated against `@dailephd/my-dev-kit@1.10.4`.
- `v1.3.0` strengthens the existing `typescript-cli` and `nextjs-app`
  profiles (and confirms `android-compose` shared compliance) with shared
  profile and registry validation, explicit command and documentation
  contracts, exact and bounded-pattern scaffold-target expectations with
  path safety, scaffold-plan and persisted-scaffold-plan validation, layered
  generated-file and verification-command evidence, first-vertical-slice
  readiness, and `status`/`check` readiness integration. Released on
  2026-08-04. It does not add a new starter
  profile; possible `android-xml` and `python-cli` evaluation remains a
  future candidate decision (see "Planned milestones").
- `v1.4.0` will harden the greenfield-to-feature workflow handoff so completed scaffolds transition cleanly into normal graph-guided feature, repair, refactor, test, and harden workflows.
- `v1.5.0` will evaluate the optional `ios-swiftui`, `flutter`, and
  `react-native` profiles only if the greenfield profile architecture proves
  reusable.

## Published releases through v1.0.0

### v0.1.0

- workflow shell release
- commands: `init`, `start`, `status`, `prompt`, `list`
- modes: `feature`, `repair`, `test`, `refactor`, `harden`
- local run folders under `.my-dev-kit-orchestrator/runs/`
- generated prompt files and plain-text artifact flow

### v0.2.0

- graph-guided architecture context release
- retrieval evidence report template in generated prompts
- ArchitectureContextPacket synthesis guidance
- supporting retrieval report visibility in `status`
- tagged in git as `v0.2.0`
- not published to npm

### v0.2.1

- extraction mode runtime implementation
- `--mode extraction`
- required `--source <path>` and `--target <path>` options for extraction runs
- source repository treated as read-only evidence by default
- target repository used as the implementation destination
- extraction-specific 14-stage workflow order
- extraction artifact gates:
  - `source-architecture-context-packet.txt`
  - `source-workflow-map.txt`
  - `source-to-target-porting-map.txt`
  - `do-not-port-list.txt`
  - `golden-behavior-contract.txt`
  - `target-architecture-proposal.txt`
- extraction-specific prompt generation and status support
- run artifacts placed under the target repository by default
- cross-platform validation with GitHub Actions OS matrix:
  - `ubuntu-latest`
  - `windows-latest`
  - `macos-latest`
- relative path normalization for `--source` and `--target`
- paths-with-spaces coverage
- macOS canonical path handling in cross-platform tests

### v0.3.0

- artifact lifecycle states: `missing`, `incomplete`, `blocked`, `complete`, `stale`
- `artifact-state.json` per run at `.my-dev-kit-orchestrator/runs/<run-id>/artifact-state.json`
- manual state setting via `mark` command for incomplete, blocked, and complete states
- stale detection via upstream artifact timestamp comparison
- lifecycle-aware `status` output with reason for blocked, incomplete, or stale artifacts
- lifecycle-aware `prompt` progression respecting incomplete, blocked, and stale artifacts
- lifecycle context block prepended to generated prompts when artifact is blocked, incomplete, or stale
- backward compatibility for runs without `artifact-state.json` through file-existence behavior
- comprehensive lifecycle unit tests and integration tests

### v0.4.0

- artifact content checker with section requirement registry
- check codes:
  - `MISSING_FILE`
  - `MISSING_SECTION`
  - `EMPTY_SECTION`
  - `PLACEHOLDER_CONTENT`
  - `STATUS_MISMATCH`
- prompt quality checker with check codes:
  - `PROMPT_MISSING_FILE`
  - `PROMPT_EMPTY`
  - `PROMPT_MISSING_STAGE_HEADER`
  - `PROMPT_MISSING_TASK_SECTION`
  - `PROMPT_MISSING_OUTPUT_ARTIFACT`
  - `PROMPT_PLACEHOLDER`
- `check` command:
  - `my-dev-kit-orchestrator check [--artifact <name>] [--prompts] [--strict]`
- `artifact-check-results.json` persistence per run
- `status` command shows content check summary when results exist
- `--strict` exits 1 on any `warn` in addition to `fail`
- `CheckSeverity` values:
  - `pass`
  - `warn`
  - `fail`

### v0.5.0

- `src/traceModel.ts`:
  - `TRACE_PREFIXES`
  - `TRACE_ID_RE`
  - `isValidTraceId`
  - `isMalformedTraceId`
- `src/traceParser.ts`:
  - `parseTraceIds`
  - `parseTraceLinks`
  - `findMalformedTraceIds`
  - `findDuplicateIds`
  - `findOrphanIds`
  - `findMissingLinkTargets`
  - `parseTrace`
- `src/traceChecker.ts`:
  - `parseDeclaredTraceIds`
  - `checkArtifactTrace`
  - `checkAllTraces`
  - `checkDesignMapTrace`
  - `trace-check-results.json` persistence
- `check --trace`: deterministic trace link checker across all run artifacts
- `check --design-map`: checks DesignMap artifact required sections and trace links
- `check --strict --trace` and `check --strict --design-map`: promote warnings to failures in exit code
- trace check codes:
  - `TRACE_MALFORMED_ID`
  - `TRACE_DUPLICATE_ID`
  - `TRACE_ORPHAN_ID`
  - `TRACE_MISSING_LINK_TARGET`
- `status` shows trace check summary when `trace-check-results.json` exists
- `DesignMap` artifact kind in section registry with 18 required sections
- optional trace ID guidance added to `behavior-model`, `pseudocode-packet`, and `test-strategy` prompts
- `judge` prompt requests trace link review when trace IDs are present in prior artifacts
- CI `validate.yml` updated with CLI trace smoke step

### v0.6.0

- `src/judgeParser.ts`:
  - judge verdict parser
  - `JUDGE_VERDICTS`
  - `parseJudgeReport`
  - `isValidVerdict`
- `src/correctionRouter.ts`:
  - `routeJudgeVerdict`
  - `parseAndRoute`
  - `CORRECTABLE_STAGES`
  - `CorrectionRouteResult`
- `src/correctionState.ts`:
  - `readCorrectionState`
  - `isCorrectionActive`
- deterministic routing table maps non-PASS verdicts to correction stages
- `SCOPE_VIOLATION` and `BLOCKED` produce blocked status without routing to a correction stage
- unknown verdicts fail the parser instead of being guessed
- `status` command shows Judge correction section when judge report exists
- `prompt` command selects routed correction stage and generates bounded correction-stage prompt
- correction prompts include `judge-report.txt`, prior stage inputs, and DesignMap when present
- `check --trace` and `check --design-map` suggest correction stages from trace issues
- trace-aware correction is deterministic and does not use LLM inference
- correction routing is prompt-generation, not autonomous execution
- 118 new tests across judge-parser, correction-router, and v060-integration suites
- correction smoke in `scripts/cli-smoke.mjs`
- CI `validate.yml` updated with CLI correction smoke step

### v1.0.0

- prior stable workflow contract release
- `src/contractChecker.ts`: deterministic artifact contract checker
  - `checkArtifactContract()`: per-artifact checks
  - `checkRunArtifactContracts()`: run-level check across all stages and modes
  - `checkStageGates()`: critical stage dependency checks across supported workflow modes
  - `resolveArtifactContractsForMode()`: ModeContractSummary with predecessor and section metadata
  - strict mode promotes warn-severity issues to fail in exit code
- artifact contract check codes include:
  - `MISSING_FILE`
  - `EMPTY_FILE`
  - `MISSING_SECTION`
  - `BLANK_SECTION`
  - `PLACEHOLDER_SECTION`
  - `PREDECESSOR_MISSING`
  - `UNKNOWN_MODE`
  - `UNKNOWN_STAGE`
  - `STAGE_NO_CONTRACT`
- `check --artifacts`: v1 contract check for all stages, with per-artifact output including code, severity, stage, mode, and suggested fix
- `check --all`: combined check with contracts, gates, trace, design-map, and correction routing
- `export` command: portable plain-text run handoff
  - run identity
  - request
  - artifact checklist
  - missing artifacts
  - judge verdict
  - correction state
  - verification evidence
  - check summaries
  - next command
- export path safety:
  - symlink refusal
  - traversal refusal
  - existing-file refusal without `--overwrite`
  - stdout or `--out` file output
- CI macOS runner pinned to `macos-15`
- CI export smoke step added
- v0.5.0 Design Trace and DesignMap behavior remains supported
- v0.6.0 correction routing behavior remains supported

## Published v1.1.0

### v1.1.0 - Greenfield Bootstrap Foundation

Status:
Published as `1.1.0`.

Goal:
Add platform-neutral Greenfield Project Bootstrap mode so
my-dev-kit-orchestrator can guide new projects before a useful codebase
exists.

Rationale:
my-dev-kit works best after code exists, but brand-new projects need a disciplined workflow from idea to docs, scaffold plan, first runnable vertical slice, validation, and initial my-dev-kit index.

Implemented features:

- `start --mode greenfield`
- greenfield stage order
- greenfield artifact contract
- greenfield stage prompts
- greenfield final report
- brief loading and normalization
- starter profile resolution
- platform-neutral bootstrap bundle
- initial project docs bootstrap
- scaffold-plan stage
- first-vertical-slice stage
- verification stage
- initial-index handoff stage

Greenfield workflow stages:

1. `idea-brief`
2. `product-boundary`
3. `stack-decision`
4. `starter-profile`
5. `bootstrap-bundle`
6. `project-docs`
7. `scaffold-plan`
8. `scaffold-implementation`
9. `first-vertical-slice`
10. `verification`
11. `initial-index`
12. `judge`
13. `final-report`

Implemented greenfield artifacts:

- `artifacts/idea-brief.json`
- `artifacts/product-boundary.txt`
- `artifacts/stack-decision.txt`
- `artifacts/starter-profile.json`
- `artifacts/bootstrap-bundle.json`
- `artifacts/project-docs-report.txt`
- `artifacts/scaffold-plan.txt`
- `artifacts/first-vertical-slice.txt`
- `reports/scaffold-implementation-report.txt`
- `artifacts/verification-report.txt`
- `reports/initial-index-report.txt`
- `artifacts/judge-report.txt`
- `artifacts/final-report.txt`

Old source comparison:

- inspect `app-dev-starter-kit`
- inspect `my-dev-kit-alpha` or the older my-dev-kit tree
- prefer the newer my-dev-kit-alpha implementation when the same new-project subsystem exists in both old trees
- use app-dev-starter-kit as historical behavior reference for original workflow intent, command names, docs, and compatibility expectations
- do not port both versions of the same subsystem

Initial extraction deliverables:

- `reports/greenfield-source-comparison.txt`
- `artifacts/greenfield-porting-map.txt`
- `artifacts/greenfield-do-not-port-list.txt`
- `artifacts/greenfield-target-architecture.txt`

Porting classification labels:

- `PORT_FROM_MY_DEV_KIT`
- `USE_APP_DEV_STARTER_KIT_AS_REFERENCE`
- `REWRITE_FOR_ORCHESTRATOR`
- `DO_NOT_PORT`
- `NEEDS_MANUAL_DIFF`

Implemented runtime areas:

- `briefSchema.ts`
- `briefTypes.ts`
- `loadProjectBrief.ts`
- `normalizeProjectBrief.ts`
- `resolveGreenfieldProfile.ts`
- `projectDocBootstrapTypes.ts`
- `bootstrapProjectDocs.ts`
- `populateProjectDocsFromBrief.ts`
- `populateComponentDocsFromBrief.ts`
- `validateBootstrapDocs.ts`
- `buildBootstrapBundle.ts`

Preferred new type:

- `GreenfieldBootstrapBundle`

`GreenfieldBootstrapBundle` contains:

- normalized brief
- selected profile
- selected `GreenfieldProfileSelection`
- template targets
- doc-generation instructions
- scaffold planning inputs
- validation rules

Initial profiles:

- `typescript-cli`
- `nextjs-app`
- no Android/mobile profile in v1.1.0

Implemented structure:

- `src/greenfield/brief/`
- `src/greenfield/bootstrap/`
- `src/greenfield/profiles/`
- `src/greenfield/scaffold/`
- `src/greenfield/modes/`
- `tests/greenfield/`

Boundary:

- v1.1.0 creates the platform-neutral greenfield foundation.
- v1.1.0 does not include Android/mobile behavior or Android static analysis.
- v1.1.0 does not include security-validation, pre-release, or publication
  workflows.
- shared artifact and contract checking covers greenfield; no
  `validateGreenfieldArtifacts.ts` was added.
- cross-mode export traversal rejection is implemented in the current release.

## Published v1.2.0

### v1.2.0 - Android Compose Greenfield Profile

Status:
Published as `1.2.0`.

Goal:
Add Android Compose as a third greenfield starter profile plugged into the
platform-neutral greenfield workflow, without a parallel mobile architecture.

Implemented features:

- `android-compose` starter profile (`src/greenfield/profiles/androidComposeProfile.ts`)
- required `setupCommands`/`validationCommands` fields on the shared
  `GreenfieldProfile` contract, backfilled onto `typescript-cli`/`nextjs-app`
- a small, explicit, bounded profile-resolution alias table (`android`,
  `kotlin-compose`, `jetpack-compose`, `compose-android`); no fuzzy matching
- the `'unresolved'` profile-selection status now produced for generic
  "mobile"/"mobile app"/"phone app" requests, rather than a silent default
- profile-conditional bootstrap-bundle validation rules and
  `validateBootstrapDocs()` (optional `selectedProfileId` parameter): Android/
  Jetpack/Kotlin/Gradle content is permitted only for `android-compose`;
  unsupported-platform and Play Store/release-readiness claims are rejected
  for every profile
- `buildScaffoldPlan()` reading `setupCommands`/`validationCommands` directly
  from the selected profile instead of a hardcoded npm assumption
- CLI/check/export regression coverage proving the above works through the
  full user-facing command surface
- hardened `scripts/check-docs-consistency.mjs` (source-derived profile list
  instead of a hardcoded two-profile regex)

Android Compose profile defaults (as implemented):

- language: Kotlin
- UI: Jetpack Compose
- build system: Gradle (Kotlin DSL), Gradle wrapper included
- default module: `app`
- entry point: `MainActivity.kt`

Android Compose validation commands (as implemented):

- `./gradlew build` (required)
- `./gradlew testDebugUnitTest` (required; JVM unit tests, no device needed)
- `./gradlew connectedAndroidTest` (optional; requires a connected device or
  running emulator, which the orchestrator does not provide or check for)

Android Compose scaffold-plan targets (as implemented):

- `settings.gradle.kts`
- `build.gradle.kts`
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/MainActivity.kt`
- `app/src/test/java/ExampleUnitTest.kt`
- `app/src/androidTest/java/ExampleInstrumentedTest.kt`

Deviations from the original plan (see the prior "Planned milestones" entry
this section replaces):

- no `--profile` CLI flag was added. `start` does not parse the request into
  a brief or resolve a profile at the CLI layer at all (unchanged from
  `v1.1.0`); profile selection happens when a coding agent executes the
  `starter-profile` stage prompt, using `preferredProfile`/`platformTarget`
  brief fields
- no automatic signal-based routing to `android-compose` was implemented
  ("a request like 'start a new Android app' should route to greenfield mode
  with `android-compose` profile when Android or Compose signals are
  present" did not ship). This was a deliberate scope decision, not an
  oversight: an ambiguous, technology-unspecified "mobile" signal returns
  `'unresolved'` rather than being silently mapped to Android Compose.
  Whether a specific, unambiguous signal (e.g. a bare `platformTarget:
  "android"` with no explicit profile request) should auto-select Android
  Compose remains an open, unresolved design question for a future version
- the package-per-feature file layout sketched in the original plan (e.g.
  `ui/App.kt`, `ui/theme/Theme.kt`, `feature/<feature>/<Feature>Screen.kt`)
  was not implemented; the actual scaffold-plan target list above is flatter
  and intentionally minimal
- `docs/TESTING.md` was not added as part of the Android Compose scaffold
  targets

Boundary:

- mobile support in my-dev-kit-orchestrator means workflow/profile support, not Android static code indexing
- Android indexing belongs to a future my-dev-kit roadmap, not this orchestrator roadmap
- the orchestrator does not run Gradle and does not require the Android SDK
- do not add Play Store release logic
- do not add Android security validation to my-dev-kit-orchestrator
- iOS, Flutter, and React Native remain unsupported; no generic mobile mode was added

## Published v1.2.1

### v1.2.1 - Workflow Instruction and Context Readiness

Published as `1.2.1` on 2026-07-21 after implementation, compatibility,
documentation, security, package, and cross-platform validation completed.

Goal:
Give every native stage an exact, deterministic instruction identity and
packet while allowing implementation and test stages to evaluate manually
supplied repository evidence before work proceeds.

Delivered scope:

- typed workflow, stage, command, rule, and report-contract catalog entries
  with stable exact IDs, validation, and dependency resolution
- `WorkflowInstructionPacket` sidecars for all 79 native stages, with
  deterministic serialization and explicit budget/truncation reporting
- in-memory `TaskState` and `StageContextBundle` composition
- fixed implementation/test supplemental context packets and retrieval reports
- an exact 11-stage repository-evidence requirement registry
- freshness, adequacy, provenance, required-evidence truncation, and critical
  test-responsibility mapping gates
- refresh-only direct-stage prompts, verification/judge context review,
  deterministic `NEED_CONTEXT` recommendations, and readiness reporting in
  `status`, `check`, and `export`
- compatibility for existing runs, stage order, prompt names, lifecycle state,
  judge verdicts, and correction routing

Dependencies and evaluation boundaries:

- At the time `v1.2.1` was released, the verified `my-dev-kit` 1.10.2 source
  contract was the repository-context authority, while the published 1.10.2
  CLI showed an identity/command mismatch. Users therefore had to select a
  verified CLI manually.
- At that release point, `my-dev-kit-lab` v0.4.3 was the published evaluation
  baseline and its v0.4.4 producer-readiness bridge was still unpublished and
  undergoing separate correction and revalidation. These were historical
  ecosystem conditions, not current orchestrator dependencies.
- the orchestrator has no runtime dependency on `my-dev-kit-lab`

Exclusions:

- no automatic `my-dev-kit` execution or external command engine
- no fuzzy, semantic, or LLM catalog selection
- no shared cross-repository schema package
- no new context stage and no wholesale prompt-generator rewrite
- no lab evaluation logic in orchestrator production behavior

## Published v1.2.2

### v1.2.2 - Context Readiness and Documentation Safeguards

Published as `1.2.2` on 2026-07-28 after implementation, compatibility,
documentation, security, package, and cross-platform validation completed.

Goal:
Make every blocked repository-context path actionable and consistent while
preserving fail-closed evidence contracts and durable public documentation.

Delivered scope:

- deterministic primary blocker selection with a primary reason, corrective
  action, evidence target, and canonical issue ordering
- consistent propagation through direct prompts, `status`, `check`,
  verification, judge, correction routing, and `export`
- fail-closed handling for raw and supplemental contradictions, repository and
  index mismatch, required truncation, missing provenance, and incomplete
  critical responsibility mappings
- responsibility parsing that ignores genuine packet preamble and trailer
  sections without suppressing missing, malformed, or duplicate IDs
- historical producer/readiness coverage for valid, negative, schema-major-1,
  and legacy-run cases
- documentation preservation, manifest validation, anti-drift checking, and
  source-of-truth reconciliation

Compatibility and exclusions:

- no new workflow, native context stage, schema major, verdict, command, or
  persisted run metadata
- no automatic `my-dev-kit` execution or release behavior
- old runs and schema-major-1 producer evidence remain supported
- verified against the published `@dailephd/my-dev-kit@1.10.3` producer
  package; users must continue to select and verify the producer CLI manually

## Published v1.2.3

### v1.2.3 - Run-Integrity and Judge-Verdict Enforcement

Released as `1.2.3` on 2026-08-01 after published-producer compatibility,
package, documentation, local Node.js 24, and cross-platform validation.

Goal:
Close a producer-adequacy defect that let a repository-context-blocked run
reach a normal `PASS` final report, by making one canonical run-integrity
decision -- not raw artifact presence, manual lifecycle state, or an authored
judge verdict alone -- govern every readiness-sensitive command.

High-level scope:

- consumes the corrected `my-dev-kit` v1.10.4 producer contract's additive,
  condition-aware role-adequacy evidence when present, while preserving
  schema-major-1 compatibility (including the earlier `1.10.3` release)
  and treating producer role adequacy and required-evidence-loss decisions as
  authoritative
- reconciles supplemental packet/report declarations against raw producer
  evidence so a packet/report pair cannot mask a contradiction with the raw
  capsule or audit
- adds one canonical run-integrity evaluator that every readiness-sensitive
  surface (prompt, lifecycle resolution, stage detection, `mark`, `status`,
  `check`, `check --all`, `export`) consults instead of independently
  recomputing readiness
- adds canonical judge-verdict acceptance: the expected verdict is derived
  from the same run-integrity decision, an authored `PASS` is rejected when
  `NEED_CONTEXT` is expected, and accepted `NEED_CONTEXT` routes to the
  canonical recovery stage rather than an authored recommendation
- adds final-report eligibility: a normal final report requires an accepted
  `PASS` verdict with no active correction and no remaining readiness
  blocker; artifact presence, a manual `complete` mark, and an otherwise
  structurally valid final-report file cannot substitute for that
- adds a permanent regression fixture pair (a frozen historical defect replay
  and a corrected-evidence positive replay) alongside the full required
  positive and negative matrix

Dependency:
Consumes the released `@dailephd/my-dev-kit@1.10.4` producer contract's
additive, condition-aware evidence when present. Schema-major-1 producer
evidence predating v1.10.4 (including `1.10.3`) remains fully compatible and does not block
on the absence of the additive fields alone.

Compatibility expectations:

- native CLI commands, workflow modes, stage order, and artifact filenames
  are unchanged
- historical runs without a repository-context requirement remain usable
  through existing file-existence and manual-lifecycle behavior
- `greenfield` continues to require neither implementation nor test context
- `test` mode continues to require test context only
- `extraction` continues to keep source and target evidence separate
- existing correction routing for verdicts other than `NEED_CONTEXT` is
  unchanged, including honoring a valid authored recommended-stage override

Exclusions:

- no new workflow, native stage, schema major, or public judge verdict
- no producer-adequacy recomputation and no second run-integrity, judge-
  integrity, or readiness authority
- no automatic package release or publication behavior in the CLI

## Published v1.3.0

### v1.3.0 - Mobile Profile Expansion and Scaffold Verification

Status:
Published as `1.3.0` on 2026-08-04.

Goal:
Strengthen the greenfield profile system so additional starter profiles can be added later without duplicating platform-specific logic.

Delivered scope:

- shared, immutable profile-local and registry-wide validation (required
  fields, duplicate IDs, alias collisions) with stable `GF_*` issue codes
- explicit command contracts: required-versus-optional classification,
  duplicate/malformed command detection, and honest `environmentNotes`
  applicability guidance for commands the orchestrator cannot verify
- a closed, profile-owned documentation terminology vocabulary and
  documentation-requirement/unsupported-claim validation
- exact and bounded-pattern scaffold-target expectations per profile, lexical
  path-safety normalization (traversal/absolute rejection before any
  filesystem access), and bounded-pattern overlap detection
- scaffold-plan conformance validation against the selected profile, and
  deterministic parsing of a persisted `scaffold-plan.txt` artifact into a
  validated plan
- layered generated-file evidence (profile-required targets checked against
  the scaffold implementation report, with optional read-only filesystem
  corroboration that rejects directories and symlinks as file evidence)
- verification-command evidence parsing, honest optional-skip reasons, and
  detection of unsupported "passed" claims with no recorded evidence
- first-vertical-slice readiness tied to the selected profile and product
  boundary
- `status` and `check`/`check --all` readiness integration using the shared
  issue model, with explicit compatibility treatment for runs created before
  this validation existed
- strengthened, symmetric fixture coverage across all three current starter
  profiles, including disk-backed readiness coverage through the real
  run-reading path

Boundary:

- no new starter profile was added; three profiles remain supported
- no command execution was added anywhere in this scope
- profiles were not turned into full application generators; no large app
  skeleton was added by default

Possible additional profiles (unchanged; still requires separate approval):

- `android-xml`
- `python-cli`
- stronger `typescript-cli` and `nextjs-app` (delivered above)

## Planned milestones

### v1.4.0 - Greenfield-to-Feature Workflow Handoff Hardening

Goal:
Make the transition from a completed greenfield scaffold into normal graph-guided feature workflow explicit, testable, and reusable.

Planned features:

- `next-feature-workflow-handoff.txt`
- initial my-dev-kit index report integration
- generated guidance for next normal feature workflow
- handoff checks that confirm the scaffold exists before indexing
- handoff checks that confirm docs match scaffold shape
- handoff checks that confirm the first vertical slice was verified
- status output for greenfield handoff readiness
- prompt guidance for continuing from greenfield to feature mode

Expected handoff flow:

1. greenfield mode creates the initial scaffold
2. verification confirms the scaffold and first vertical slice
3. initial-index instructs a user or coding agent to run my-dev-kit indexing
4. handoff artifact explains how to continue with normal graph-guided feature workflow
5. future changes use feature, repair, test, refactor, or harden workflows

Boundary:

- the handoff should not run autonomous agents
- the handoff should not perform pre-release checks
- the handoff should not run security validation
- the handoff should not publish anything

### v1.5.0 - Optional Mobile Profile Candidates

Goal:
Evaluate whether the greenfield profile architecture should support additional mobile frameworks beyond Android Compose.

Candidate profiles:

- `ios-swiftui`
- `flutter`
- `react-native`

Decision criteria:

- profile can reuse the platform-neutral greenfield workflow
- profile has clear scaffold-plan targets
- profile has reliable local verification commands
- profile can define a small first vertical slice
- profile does not require platform-specific static analysis inside my-dev-kit-orchestrator
- profile does not require store publishing logic
- profile does not require heavyweight template maintenance beyond the project scope

Boundary:

- this version is optional
- do not implement these profiles unless Android Compose proves the profile abstraction works
- do not add native platform analyzers to my-dev-kit-orchestrator

## Ecosystem responsibility boundaries

### my-dev-kit

`my-dev-kit` understands existing codebases.

It should own:

- indexing
- search
- lookup
- slice
- source retrieval
- graph artifacts
- semantic artifacts
- classification
- future Kotlin indexing
- future Java indexing
- future AndroidManifest parsing
- future resource indexing
- future Compose semantic artifacts
- future Android architecture classification
- future Android retrieval benchmarks

`my-dev-kit` should not become a project generator.

### my-dev-kit-orchestrator

`my-dev-kit-orchestrator` controls staged workflows.

It should own:

- feature workflows
- repair workflows
- test workflows
- refactor workflows
- harden workflows
- extraction workflows
- greenfield workflows
- project bootstrap workflow guidance
- starter profile resolution
- scaffold planning
- first vertical slice guidance
- verification stage prompts
- initial handoff to my-dev-kit indexing

`my-dev-kit-orchestrator` should not become:

- an Android static analyzer
- a Play Store release tool
- a security-validation framework
- a direct LLM execution runtime
- an autonomous code-modification runtime

### my-dev-kit-lab

`my-dev-kit-lab` performs validation and audit work.

It should own:

- security validation
- release-readiness checks
- target-aware audits
- package and dependency checks
- pre-release validation support

`my-dev-kit-lab` should not be part of normal greenfield project bootstrap.

## Non-goals

`my-dev-kit-orchestrator` is not intended to become:

- a general autonomous multi-agent runtime
- a security-validation framework
- a replacement for `my-dev-kit`
- an Android static analyzer
- a Play Store publishing tool
- a project marketplace or template marketplace
- a large low-level command suite
- a direct LLM execution layer
- an automatic code modification runtime

Greenfield mode should not:

- copy the old app-dev-starter-kit runtime wholesale
- port both old versions of the same new-project subsystem
- port the old existing-project agent loop
- port the old symbol-index
- port old evaluation or milestone systems unless a later roadmap explicitly needs them
- preserve both old and new template layouts
- duplicate old commands when the current orchestrator mode can expose the behavior cleanly
- include pre-release or publication workflows
- include Android security validation
- include Android static analysis

## Conceptual workflow model

For a new project:

1. `my-dev-kit-orchestrator` greenfield mode
2. idea brief
3. product boundary
4. stack/profile decision
5. bootstrap bundle
6. project docs
7. scaffold plan
8. scaffold implementation
9. first vertical slice
10. verification
11. initial my-dev-kit index
12. normal graph-guided feature workflow

For an existing project:

1. `my-dev-kit` index/search/lookup/slice/source
2. `my-dev-kit-orchestrator` feature, repair, test, refactor, or harden workflow

For extraction work:

1. source repository inspection
2. source workflow map
3. porting map
4. do-not-port list
5. golden behavior contract
6. target architecture proposal
7. target implementation through the staged orchestrator workflow

For pre-release and security:

1. separate pre-release prompts
2. cross-platform release checks
3. my-dev-kit-lab security validation
4. separate publication prompt
