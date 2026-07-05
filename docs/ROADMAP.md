# Roadmap

Versions are listed in chronological order.

`v1.1.0` is the current published release and is newer than every prior
`v1.0.0` or `v0.x.0` release.

`v1.0.0` remains the prior stable workflow-contract release.
Later versions remain planned milestones.

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
- `v1.2.0` will add the Android Compose greenfield profile as the first mobile starter profile, with Android stack defaults, scaffold-plan guidance, docs templates, verification commands, and first vertical slice guidance.
- `v1.3.0` will expand greenfield scaffold verification and profile readiness so additional starter profiles can plug into the platform-neutral bootstrap workflow without duplicating Android-specific behavior.
- `v1.4.0` will harden the greenfield-to-feature workflow handoff so completed scaffolds transition cleanly into normal graph-guided feature, repair, refactor, test, and harden workflows.
- `v1.5.0` will evaluate optional additional mobile profiles such as Android XML, Flutter, React Native, and iOS SwiftUI only if the greenfield profile architecture proves reusable.

## Implemented

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

## Implemented v1.1.0

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

## Planned milestones

### v1.2.0 - Android Compose Greenfield Profile

Goal:
Add Android Compose as the first mobile starter profile plugged into the platform-neutral greenfield workflow.

Core features:

- `android-compose` starter profile
- Android stack-decision defaults
- Android scaffold-plan template
- Android docs template adaptation
- Android verification command profile
- Android first vertical slice guidance
- Android handoff to my-dev-kit indexing

Preferred CLI surface:

`npx my-dev-kit-orchestrator@latest start --mode greenfield --profile android-compose "<new project request>"`

Prompt-entry routing:

- a request like "start a new Android app" should route to greenfield mode with `android-compose` profile when Android or Compose signals are present

Android profile defaults:

- project type: Android application
- language: Kotlin
- UI: Jetpack Compose
- build system: Gradle Kotlin DSL
- default module: `app`
- entry point: `MainActivity`
- theme: Material 3
- navigation: optional simple Compose NavHost when needed
- state owner: ViewModel when behavior needs state
- persistence: none by default
- persistence escalation: DataStore or Room only if justified
- test setup: unit tests first
- Compose UI tests optional

Android verification commands:

- `.\gradlew.bat tasks`
- `.\gradlew.bat assembleDebug`
- `.\gradlew.bat testDebugUnitTest`
- `.\gradlew.bat lintDebug`

Optional emulator/device command:

- `.\gradlew.bat connectedDebugAndroidTest`

Android scaffold-plan targets:

- `settings.gradle.kts`
- `build.gradle.kts`
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/<package>/MainActivity.kt`
- `app/src/main/java/<package>/ui/App.kt`
- `app/src/main/java/<package>/ui/theme/Theme.kt`
- `app/src/main/java/<package>/feature/<feature>/<Feature>Screen.kt`
- `app/src/main/java/<package>/feature/<feature>/<Feature>ViewModel.kt` when needed
- `app/src/test/...` unit tests
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/WORKFLOWS.md`
- `docs/TESTING.md`

Android first vertical slice rule:

- do not create a huge app skeleton
- create the smallest runnable app with one useful flow
- the first app should open, show a first screen, allow one simple action, show a visible state change, and have at least unit-test or smoke-verification evidence

Boundary:

- mobile support in my-dev-kit-orchestrator means workflow/profile support, not Android static code indexing
- Android indexing belongs to a future my-dev-kit roadmap, not this orchestrator roadmap
- do not add Play Store release logic
- do not add Android security validation to my-dev-kit-orchestrator

### v1.3.0 - Mobile Profile Expansion and Scaffold Verification

Goal:
Strengthen the greenfield profile system so additional starter profiles can be added without duplicating platform-specific logic.

Planned features:

- profile contract validation
- scaffold-plan validation across profiles
- profile-specific verification command registry
- profile-specific docs template validation
- first-vertical-slice readiness checks
- generated-file expectation checks
- profile fixture tests
- improved failure messages for incomplete starter profiles

Possible additional profiles:

- `android-xml`
- `python-cli`
- stronger `typescript-cli`
- stronger `nextjs-app`

Boundary:

- add new profiles only when the profile contract is stable enough to avoid one-off implementation
- do not turn profiles into full application generators
- do not create a large app skeleton by default

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
3. initial-index runs or instructs my-dev-kit indexing
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
