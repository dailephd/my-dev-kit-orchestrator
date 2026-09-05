# Roadmap

Versions are listed in chronological order.

`v1.4.0` is the current published release. `v1.3.3`, `v1.3.2`, `v1.3.1`, `v1.3.0`,
`v1.2.3`, `v1.2.2`, `v1.2.1`, `v1.2.0`, `v1.1.0`, `v1.0.0`, and the `v0.x.0`
releases remain part of the published project history. `v1.4.1`, `v1.5.0`, and
`v1.6.0` are planned; deferred scopes remain separate.

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
  2026-08-04. It did not add a new starter profile; `android-xml` and
  `python-cli` were future candidate decisions at that time. The later
  `v1.3.3` milestone promotes `python-cli`; the historical candidate record is
  retained here.
- `v1.3.1` makes the ecosystem's standardized project-document structure
  the generic baseline for newly bootstrapped projects and hardens the existing
  `nextjs-app` profile for the first explicit full-stack web environment
  contract: Next.js with PostgreSQL, Prisma, and Docker. Released on
  2026-08-09.
- `v1.3.2` corrects the shared artifact-validation contract so native
  greenfield JSON artifacts retain strict JSON and structured-field validation
  without receiving incompatible text-header requirements. Released on
  2026-08-09.
- `v1.3.3` adds
  common coding-agent instruction bootstrap to every supported greenfield
  profile and promotes `python-cli` from its earlier candidate status into the
  fourth starter profile, reusing the existing greenfield architecture. The
  release shipped on 2026-08-11.
- `v1.4.0` reconciles maintained-line trace/lifecycle behavior, adds
  phase-aware readiness and explicit proof-only verification, and adds a
  bounded Observer v0.6 evidence consumer validated against fresh pushed
  Observer source.
- `v1.4.1` will correct the installed greenfield instruction surface by
  replacing inappropriate Orchestrator-maintainer source-path guidance in
  public generated prompts with direct artifact, behavior, validation, and
  completion requirements, with isolated packed-install regression coverage
  and no packaging or workflow redesign.
- `v1.5.0` will provide the Semantic Continuity and Evidence-to-Implementation
  Bridge; richer semantic chains remain opt-in for FULL_STAGE_CONTEXT.
- `v1.6.0` will provide Workflow Economics and Deterministic Run Telemetry.

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

## Published v1.3.1

### v1.3.1 - Standardized Greenfield Documentation and Full-Stack Next.js Environment Hardening

Status:
Published as `1.3.1` on 2026-08-09.

Goal:
Extend the `v1.3.0` greenfield profile and scaffold foundation in two connected
ways: make the standardized ecosystem project-document structure the generic
documentation substrate for newly bootstrapped projects, and add the first
explicit full-stack web environment contract by combining `fullstack-web`,
Next.js, the existing `nextjs-app` starter profile, PostgreSQL, Prisma, and
Docker.

Rationale:
The current greenfield project-doc bootstrap uses a smaller legacy taxonomy,
while the ecosystem now has one canonical cross-project document structure.
The current `nextjs-app` profile also establishes a minimal frontend scaffold
but does not express an active database, environment, container, migration,
test-database, or production-readiness contract. The Biolit and
scientific-literature-explorer reference studies establish reusable pieces of
that lifecycle and identify gaps that the first generic contract must harden
explicitly rather than inherit as false-green behavior.

Delivered capabilities:

- use the common canonical document set as the generic baseline for new
  greenfield projects, with content derived from the new project's actual
  brief, stack, profile, type, framework, capabilities, and scaffold contract
- represent project type, web framework, starter profile, and environment
  capability as related but distinct decisions, without multiplying starter
  profiles
- resolve the first supported full-stack combination as Next.js, PostgreSQL,
  Prisma, and Docker, while making no generic support claim for unvalidated
  frameworks, databases, toolkits, or container runtimes
- carry the resolved documentation and full-stack requirements through the
  existing greenfield artifacts, scaffold guidance, evidence, readiness, and
  judge flow
- require real lifecycle evidence from the coding agent instead of accepting
  generated-file existence or successful no-op commands as proof

Standardized project-document contract:

The generic baseline for a newly bootstrapped project is:

- `README.md`
- `CHANGELOG.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/CURRENT_STATE.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTRACTS.md`
- `docs/COMMANDS.md`
- `docs/WORKFLOWS.md`
- `docs/QUICKSTART.md`
- `docs/DEVELOPMENT.md`
- `docs/CI_CD.md`
- `docs/ROADMAP.md`
- `docs/RELEASE.md`
- `docs/SECURITY.md`
- `docs/DOCUMENTATION_PRESERVATION_POLICY.md`

These filenames establish common responsibilities, not shared boilerplate.
Greenfield must generate project-specific content from the selected project's
inputs and resolved contract; it must not blindly copy my-dev-kit ecosystem
prose. Project-type-, framework-, database-, container-, and platform-specific
requirements are layered into the appropriate common owners. Specialized
documents remain allowed when they have a genuine independent responsibility,
but project-specific content should normally enrich the common documents
instead of creating a parallel taxonomy.

For the initial full-stack contract, `PROJECT_OVERVIEW` owns product identity
and technology shape; `ARCHITECTURE` owns application/database/container
topology; `CONTRACTS` owns environment, database, migration, readiness, reset,
and service invariants; `COMMANDS` owns the generated command surface;
`WORKFLOWS` owns setup, daily development, migration, testing, and recovery;
`QUICKSTART` owns the shortest successful startup; `DEVELOPMENT` owns
contributor setup and validation; `CI_CD` owns CI test-database behavior plus
production image and pre-traffic migration ordering when applicable;
`SECURITY` owns secrets, destructive-operation boundaries, and runtime safety;
and `CURRENT_STATE`, `ROADMAP`, and `RELEASE` retain their normal temporal and
release responsibilities. The capability does not create `docs/DATABASE.md`,
`docs/ENVIRONMENT.md`, `docs/TESTING.md`, or `docs/DEPLOYMENT.md` by default.

The project-doc system must distinguish universal document requirements from
conditional project-type, framework, database, container, and platform content
requirements. Existing project-doc bootstrap behavior should remain compatible
where practical. A legacy greenfield run must not become invalid solely because
it predates the expanded documentation contract.

Full-stack web selection model:

The first explicit combination is:

`projectType = fullstack-web`

plus

`webFramework = nextjs`

plus

`starterProfile = nextjs-app`

plus

the full-stack environment capability.

`nextjs-app` remains the starter profile; no `nextjs-fullstack` profile or new
workflow mode is introduced. Structured project-type and framework intent
belongs to the greenfield brief, decision, and artifact flow. Existing stages
remain responsible for resolution, so CLI `start` does not gain `--profile`,
`--project-type`, or `--framework` options. Profile compatibility and capability
information must be machine-readable enough for deterministic validation
without creating a combinatorial profile catalog. Future combinations require
their own explicit validated contracts before being advertised as supported.

Initial Next.js/PostgreSQL/Prisma/Docker contract:

- Development environment: support fast host-based Next.js development with
  PostgreSQL in Docker, plus full-container application execution for smoke or
  production-like validation. Handle Docker-engine readiness explicitly,
  including Windows Docker Desktop readiness, and use bounded waits. Treat host
  and container network addresses as different environments. Ordinary shutdown
  preserves development database state unless reset is explicitly requested.
- Environment variables: generate committed non-secret templates while keeping
  real secrets untracked. Record each required variable's purpose, consumer,
  scope, requiredness, and secret classification. Keep host-development,
  Docker, test, and production database addresses distinct; fail clearly when
  required configuration is absent; and never make production secrets depend
  on insecure local defaults.
- Database lifecycle: PostgreSQL is the first engine and Prisma the first
  toolkit. One canonical application database client owns access. The Prisma
  schema owns logical design and committed SQL migrations own database
  evolution. Development migration creation and migration deployment/replay
  remain separate. Client generation occurs at the required setup, build, and
  test points. Fresh setup has one authoritative initialization path rather
  than implicit migration application.
- Data classes: default to no seed. Development sample data, required bootstrap
  data, and test fixtures remain distinct; seed replay occurs only when the
  selected project contract explicitly requires it.
- Test database: isolate test data from development and production with a
  dedicated environment and database identity. Apply committed migrations,
  guard reset targets, and make repeated runs deterministic. Database-backed
  tests must demonstrate that the application actually uses the database when
  database capability is selected.
- Docker: treat containerization as a lifecycle contract rather than a
  Dockerfile-only deliverable. Require a production-oriented multi-stage Next.js
  image, deterministic dependency installation from the selected lockfile and
  package-manager contract, Prisma generation before the production build when
  required, and standalone Next.js output when selected. Keep build context and
  `.dockerignore` aligned. Compose responsibilities include PostgreSQL health,
  bounded waiting, service dependency ordering, distinct development/test
  database identities, persistent development storage, controlled test cleanup,
  and application startup verification. Use a non-root production runtime where
  practical.
- Health and readiness: distinguish a running process/container, healthy
  PostgreSQL, and an application ready to serve database-backed behavior. A
  reusable application readiness contract must prove database reachability when
  required; container state or database process health alone is insufficient.
- Production migrations: expose a real production migration command and assign
  an explicit pre-traffic migration responsibility. Ordinary application
  replicas must not each run migrations during startup. Provider-specific
  tooling may bind that responsibility later, but the generic contract does not
  select a deployment provider.
- Safe reset and recovery: allow destructive reset only for explicitly approved
  non-production development/test environments. Parse and validate the actual
  target environment and database rather than using a weak substring check;
  refuse ambiguous or production-like targets; redact credentials from errors;
  replay migrations after reset; and replay seed data only when required by the
  selected contract. Production reset is outside this capability.
- Evidence integrity: fake, message-only, or otherwise no-op commands cannot be
  presented as successful setup, migration, test, Docker, or readiness evidence.

Greenfield stage integration:

The capability flows through the existing 13 stages; Docker and database work
do not create another native stage:

1. `idea-brief` captures enough structured intent to identify full-stack web.
2. `product-boundary` decides whether persistence and backend behavior belong
   inside the project boundary.
3. `stack-decision` resolves the concrete framework, database, toolkit, and
   container shape required by the project.
4. `starter-profile` selects `nextjs-app` when appropriate and validates its
   compatibility with the requested project type and framework.
5. `bootstrap-bundle` carries normalized type/framework intent and the resolved
   environment, database, container, and document requirements.
6. `project-docs` prepares the common canonical set and layers resolved
   full-stack content into the responsible documents.
7. `scaffold-plan` plans project and infrastructure files, non-secret
   environment templates, lifecycle commands, ownership, tests, and acceptance
   criteria.
8. `scaffold-implementation` guides the coding agent to create only the approved
   scaffold.
9. `first-vertical-slice` requires minimal useful behavior that genuinely
   crosses the selected full-stack boundary when persistence is part of the
   product.
10. `verification` requires real evidence for the resolved development, test,
    Docker, and database contract.
11. `initial-index` remains the handoff to `my-dev-kit` after source exists.
12. `judge` evaluates the generated result against the resolved full-stack and
    standardized-document contracts.
13. `final-report` records the result, evidence, remaining risks, and handoff
    without changing release state.

Verification expectations:

When applicable to the selected contract, acceptance evidence must cover
dependency installation; environment-template validation; Docker/Compose
configuration validity; Docker engine and service readiness; PostgreSQL startup
and health; Prisma/client generation; migration application; Next.js development
startup or production build; application/database connectivity; isolated
database-backed tests; production image build; production-style container
startup and health smoke; clean shutdown; restart/recovery; and safe
development/test reset when provided. The evidence must show meaningful command
and runtime results, not only file presence or an exit-zero placeholder.

The orchestrator continues to generate guidance and validate reported evidence;
it does not execute Docker, database, application, build, test, or reset
commands. The coding agent executes the resolved commands and reports bounded
evidence through the existing greenfield artifacts.

Compatibility expectations:

- Published `v1.3.0` behavior, the 13-stage order, the three existing starter
  profile identities, and stage-owned profile resolution remain intact.
- Existing frontend-oriented `nextjs-app` requests remain usable; full-stack
  behavior is selected through explicit structured intent and compatibility,
  not inferred as mandatory for every Next.js project.
- New contracts evolve additively where practical, with explicit legacy or
  not-evaluated treatment when older runs lack new documentation or full-stack
  evidence.
- The standardized document baseline applies to newly bootstrapped projects;
  it is not a retroactive declaration that historical generated projects are
  defective.

Explicit exclusions and boundaries:

- no new workflow mode or native stage
- no `nextjs-fullstack` starter profile
- no CLI `--profile`, `--project-type`, or `--framework` flags
- no autonomous Docker or database execution by the orchestrator
- no deployment-provider-specific infrastructure or Kubernetes requirement
- no authentication framework by default
- no product-specific sidecars, including Biolit's Python NLP service
- no seed data by default
- no claim of generic support for every framework, database, toolkit, or
  container runtime
- no replacement of `my-dev-kit` indexing or retrieval
- no `my-dev-kit-lab` integration into ordinary greenfield bootstrap
- no release, publication, or provider deployment behavior
- no `v1.4.0` greenfield-to-feature handoff work
- no `v1.5.0` optional mobile-profile work

Dependencies and evidence basis:

- the completed ecosystem documentation-standardization report is authoritative
  for the common canonical project-document set and responsibility model
- the Biolit full-stack environment reference supplies the proven host-first
  development, Docker readiness, host/container addressing, Compose health and
  ordering, persistent development storage, separate test-service identity, and
  standalone multi-stage Next.js image patterns
- the scientific-literature-explorer database lifecycle reference supplies the
  active PostgreSQL/Prisma client, schema, committed migration, generation,
  database-backed test, and dedicated test-database patterns
- gaps identified by those reports are deliberate hardening requirements here:
  authoritative fresh initialization, safe reset, explicit no-seed default,
  database-aware application readiness, and singleton pre-traffic production
  migration responsibility
- the reference projects provide evidence and counterexamples, not product
  templates; their names, domain models, credentials, ports, routes, sidecars,
  and prose are not copied

Acceptance criteria:

- newly bootstrapped projects use the common canonical document baseline, with
  generated content grounded in the resolved project rather than ecosystem
  boilerplate and with specialized documents added only for independent needs
- a structured `fullstack-web` plus `nextjs` request can resolve compatibly to
  `nextjs-app` plus the initial PostgreSQL/Prisma/Docker capability without a
  new profile, mode, or CLI semantic flag
- the resolved contract explicitly covers host and container development,
  environment/secret scopes, database ownership and evolution, isolated tests,
  Docker lifecycle, health/readiness, safe reset, and pre-traffic production
  migrations
- the existing 13 stages carry, guide, verify, and judge the resolved
  documentation and full-stack responsibilities without the orchestrator
  executing external commands
- verification requires real database-backed and container/runtime evidence
  where selected, rejects known no-op proof, and preserves honest skip/blocker
  reporting for genuinely unavailable optional infrastructure
- legacy runs and current non-full-stack profiles remain compatible under the
  stated additive/legacy treatment
- all explicit exclusions remain enforced, and the separate `v1.4.0` and
  `v1.5.0` plans remain unchanged and in order

## Published v1.3.2

### v1.3.2 - Greenfield JSON Artifact Contract Correction

Status:
Published as `1.3.2` on 2026-08-09.

Goal:
Restore a satisfiable shared artifact contract for greenfield runs containing
both structured JSON and plain-text artifacts.

Required behavior:

- the artifact-kind registry selects text or structured JSON content validation
- the three native greenfield JSON artifacts remain parseable JSON and must
  satisfy their required structured fields
- plain-text artifacts retain existing header, blank, and placeholder checks
- shared existence, predecessor, lifecycle, stage-gate, judge-integrity, and
  canonical readiness guarantees remain unchanged
- existing valid greenfield runs remain readable without artifact rewrites

Exclusions:

- no new workflow mode, stage, profile, or CLI command
- no relaxed parsing of malformed JSON
- no second greenfield-only artifact engine
- no release or publication behavior added to the CLI

Acceptance expectations:

- valid mixed-format greenfield runs pass format-appropriate content checks
- malformed or structurally incomplete JSON fails deterministically
- `check --artifacts` and `check --all` share the corrected behavior
- legacy text behavior and run-integrity gates remain covered by regression tests

## Published v1.3.3

### v1.3.3 - Python CLI Greenfield Profile and Coding-Agent Instruction Bootstrap

Status:
Published as `1.3.3` on 2026-08-11. The earlier `v1.3.0` discussion of
`python-cli` remains an accurate historical candidate record; this release
promotes that candidate into shipped scope.

Goal:
Extend the existing greenfield architecture in two related ways: give every
supported greenfield project one common coding-agent instruction set, and add
`python-cli` as the fourth greenfield starter profile. Both additions must use
the existing profile, scaffold, documentation, verification, readiness, and
initial-index architecture rather than parallel Python-specific or
coding-agent-specific workflows.

Release scope:

- The preceding `v1.3.2` release had exactly three starter profiles: `typescript-cli`,
  `nextjs-app`, and `android-compose`.
- `v1.3.2` provided the standardized 15-file canonical public
  project-document baseline, shared profile and registry validation, shared
  scaffold-plan validation, shared generated-file and verification-command
  evidence, shared first-vertical-slice and greenfield readiness, and the
  existing initial `my-dev-kit` indexing handoff.
- Released `v1.3.3` has four starter profiles by adding `python-cli` and gives
  every supported profile `agents.txt`, `claude.txt`, `AGENTS.md`, and
  `CLAUDE.md` as common greenfield outputs.

Coding-agent instruction bootstrap:

- `agents.txt` is the detailed shared operating manual for the generated
  project. It covers project identity and purpose, current scope, core
  workflow, non-goals, architecture boundaries, tool usage, repository
  retrieval discipline, implementation rules, testing and failure handling,
  validation, Git safety, documentation, final reporting, and uncertainty or
  stop rules.
- `claude.txt` is a compact Claude Code guide derived from the same project
  facts and instruction model. It directs Claude to read `agents.txt` and
  retains the highest-value project constraints, first steps, tool usage,
  testing, validation, and reporting rules without becoming a separately
  maintained source of truth.
- `AGENTS.md` is a small deterministic adapter directing compatible coding
  agents to the lower-case instruction files.
- `CLAUDE.md` is a small deterministic adapter directing Claude Code to the
  lower-case instruction files.
- One normalized project-instruction source/model renders both the detailed
  and compact instruction files. The implementation does not maintain independent,
  manually duplicated `agents.txt` and `claude.txt` content.

Public-document boundary:

The four coding-agent instruction files are distinct from the standardized
15-file public canonical project-document baseline. The public baseline remains
README, CHANGELOG, and `docs/*`; the agent files are coding-agent project
instructions. `v1.3.3` defines and validates their participation in
greenfield scaffold output without redefining the public-document registry or
treating them as ordinary public project documentation.

Common scaffold integration:

The four agent files are common greenfield outputs represented once, not copied
into `typescript-cli`, `nextjs-app`, `android-compose`, or `python-cli` profile
definitions. Effective target expectations compose conceptually as common
greenfield targets plus selected starter-profile targets plus optional
capability targets. Those expectations flow through the existing scaffold
plan, scaffold-plan validation, scaffold implementation evidence,
generated-file readiness, and optional filesystem corroboration path. No
second readiness engine or agent-file-specific lifecycle is introduced.

Python CLI profile:

- `python-cli` is the fourth starter profile beside `typescript-cli`,
  `nextjs-app`, and `android-compose`, within the existing `greenfield`
  workflow.
- Its deliberately small CLI baseline is `pyproject.toml`, `src/main.py`,
  `tests/test_main.py`, and `README.md`. The common coding-agent instruction
  files are additive common targets, not Python-owned targets.
- The initial stack is Python with `pyproject.toml`, standard-library
  command-line entry behavior where practical, and pytest.
- Profile-owned command contracts carry dependency/environment setup, Python
  syntax or compile validation, pytest, and CLI smoke guidance and evidence.
  The orchestrator continues not to execute Python, setup, validation, npm,
  Gradle, Docker, or other project commands.
- The profile is CLI-specific, not a generic Python project profile. FastAPI,
  Django, Flask, Jupyter, scientific computing, machine learning, databases,
  and web services require separate future design.

Profile resolution and generic ownership:

- Explicit `python-cli` selects the profile, and the bounded alias
  `python` resolves to it. Clearly Python-plus-CLI intent may resolve to
  `python-cli`; fuzzy profile matching remains prohibited.
- A generic request such as "create a Python project" remains unresolved and
  must not silently assume CLI. Python web, API, or server intent must not be
  silently mapped to `python-cli` or `nextjs-app` when no compatible profile
  exists. Existing Android ambiguity behavior remains unchanged.
- First-runnable entry-point selection is profile-owned target metadata:
  the selected profile identifies its entry point through the existing target
  contract. The design must not grow a hard-coded `.ts | .tsx | .kt | .py`
  extension list.
- Supported-profile guidance in the generic `starter-profile` instruction
  derives from the actual profile registry as its single canonical source,
  replacing the former hard-coded three-profile inventory so a future fifth
  profile does not require another generic-prose update.
- Python-specific documentation claims use the existing profile-owned
  terminology contract. Shared validators must not accumulate Python
  profile-ID branches, and other profiles must not claim Python as their
  selected stack.

Existing integrations and capability boundaries:

No new `my-dev-kit` Python subsystem is required because current `my-dev-kit`
already supports Python source indexing. Generated Python source joins the
existing `greenfield -> scaffold -> verification -> initial-index -> normal
graph-guided development` flow; there is no Python-specific initial-index
stage.

The existing Next.js full-stack capability remains separate and unchanged.
`python-cli` does not acquire `fullstack-web`, PostgreSQL, Prisma, Docker,
Next.js compatibility, or a Python web-framework capability.

Compatibility invariants:

- exactly eight CLI commands, seven workflow modes, 79 native stages, and 13
  greenfield stages
- existing workflow stage orders, lifecycle, artifact paths except for the
  approved non-native generated project files, `RunIntegrityGate`, judge
  integrity, final-report eligibility, and extraction behavior
- current three-profile behavior for old runs and explicit legacy
  compatibility where current greenfield readiness requires it
- existing shared profile validation, scaffold validation, generated-file
  evidence, verification-command evidence, status/check readiness, first-slice
  readiness, and canonical greenfield readiness
- existing Next.js full-stack capability behavior and orchestrator
  non-execution boundaries

Verified acceptance criteria:

- `python-cli` is the fourth registered greenfield starter profile, while the
  existing three profiles remain compatible and no workflow mode or native
  stage is added.
- All four supported profiles receive the four coding-agent instruction files.
- `agents.txt` and `claude.txt` derive from one project-instruction source;
  `AGENTS.md` and `CLAUDE.md` remain small deterministic adapters.
- Agent instruction files remain distinct from the standardized public
  canonical-document registry and are represented once as common greenfield
  outputs rather than copied into each profile definition.
- Common, profile, and optional capability target expectations compose through
  the existing scaffold/readiness path.
- Python uses the shared profile, scaffold, generated-file, command-evidence,
  status/check, first-slice, and greenfield-readiness architecture.
- Python entry-point determination is profile-driven; explicit Python CLI
  requests resolve correctly; ambiguous Python requests remain unresolved;
  and unsupported Python web/server intent is not silently mapped elsewhere.
- Generated Python source can enter the existing initial `my-dev-kit` indexing
  handoff, while existing Next.js full-stack behavior remains unchanged.
- Documentation consistency and preservation checks understand the released
  `v1.3.3` milestone and the four-profile release truth.

Explicit exclusions:

- Python web profiles, FastAPI, Django, Flask, Jupyter/notebook, scientific
  computing, machine learning, Python databases, and generic Python project
  inference
- a new workflow mode, a new native greenfield stage, Python-specific native
  stages, readiness, artifact lifecycle, scaffold engine, or initial-index
  stage
- automatic agent execution, project-command execution, or `my-dev-kit`
  execution
- release or publication automation
- `v1.4.0` greenfield-to-feature handoff hardening
- `v1.5.0` optional mobile-profile evaluation

Roadmap sequence:

`v1.4.0` is the current published release. `v1.4.1` is the next planned patch;
`v1.5.0` remains the next planned feature version after that, followed by
`v1.6.0`. Greenfield-to-Feature Workflow Handoff Hardening and optional
mobile-profile candidates remain deferred scopes.

## Planned milestones

### v1.4.0 - Maintained-Line Reconciliation and Proof-Only Workflow Support

Status: Released as `1.4.0`.

Implemented scope:

- formal trace and lifecycle reconciliation corrections
- stage-aware repository evidence readiness
- explicit proof-only verification with declared proof responsibility
- bounded Observer v0.6 evidence consumption and public-contract hardening
- reproducible Observer-to-Orchestrator compatibility using fresh pushed
  source; no current claim of a reproducible Lab leg

### v1.4.1 - Installed Greenfield Instruction Surface Correction

Status: Planned patch before `v1.5.0`.

Audit basis:

- isolated `npm pack` installation reproduced all eight public commands and all
  seven workflow modes with behavior matching the source build
- package contents, runtime assets, dependencies, exports, and repository-root
  independence were otherwise clean
- four confirmed greenfield stage instructions (`idea-brief`,
  `starter-profile`, `scaffold-plan`, and `bootstrap-bundle`) expose
  Orchestrator-maintainer source paths such as `src/greenfield/**/*.ts` to
  coding agents working on generated user projects
- the defect is shipped instruction content, not a missing package asset or a
  package-files problem

Goal:

Make every shipped greenfield instruction self-contained for the coding agent
operating on the generated project, while preserving the artifact, behavior,
validation, and completion requirements currently hidden behind inappropriate
Orchestrator-maintainer source references.

Planned scope:

- audit the complete rendered public greenfield instruction surface for
  equivalent Orchestrator-internal source-path leakage
- correct the confirmed `idea-brief`, `starter-profile`, `scaffold-plan`, and
  `bootstrap-bundle` instruction content in the existing instruction owner
- for every removed internal reference, identify the requirement it was meant
  to communicate and state that requirement directly rather than deleting the
  guidance without replacement
- add focused regression coverage that rejects inappropriate Orchestrator
  repository source paths in public generated prompts while allowing legitimate
  maintainer-only source references in internal code and documentation
- validate affected prompts from both the source build and an isolated packed
  installation outside the repository
- preserve source-build and installed-package behavior parity

Acceptance criteria:

- no confirmed affected public greenfield prompt instructs a generated-project
  coding agent to inspect `src/greenfield/**/*.ts`
- every meaningful requirement represented by a removed internal path remains
  present as direct artifact, behavior, validation, or completion guidance
- the complete rendered greenfield prompt surface is checked for equivalent
  leakage, not only the four known examples
- affected source-build prompt tests and isolated packed-install acceptance pass
- all eight public CLI commands and all seven workflow modes remain available
- package contents, runtime dependencies, exports, workflow modes, native stage
  order, artifact families, and existing greenfield architecture remain
  unchanged unless new evidence proves a narrowly required correction

Compatibility expectations:

- no new workflow mode, native stage, CLI command, package asset family, or
  runtime dependency
- no prompt subsystem rewrite; the correction stays in the established
  instruction-content ownership path
- no change to Observer evidence consumption, proof-only behavior, context
  readiness, lifecycle, judge integrity, or final-report eligibility
- preserve `NO_CORE_RETRIEVAL_ENGINE_CHANGE_REQUIRED`; this finding provides no
  evidence of a `my-dev-kit` core retrieval-engine defect

Explicit exclusions:

- no Semantic Continuity and Evidence-to-Implementation Bridge or WF-002 work
- no Workflow Economics or deterministic telemetry work
- no Greenfield-to-Feature Workflow Handoff Hardening
- no optional mobile-profile work
- no Observer consumer redesign
- no reconstruction of the lost historical Lab compatibility candidate
- no package-files redesign, packaging architecture change, or dependency
  expansion solely to correct instruction wording

Relationship to later work:

`v1.4.1` is a bounded corrective patch and does not replace or absorb
`v1.5.0`. After this patch, the next planned feature version remains the
Semantic Continuity and Evidence-to-Implementation Bridge.

### v1.5.0 - Semantic Continuity and Evidence-to-Implementation Bridge

Preserve lightweight DIRECT_IMPLEMENTATION while richer semantic continuity,
including deterministic WF-002 metadata direction, remains FULL_STAGE_CONTEXT
work.

### v1.6.0 - Workflow Economics and Deterministic Run Telemetry

Planned deterministic workflow economics and run telemetry.

### Deferred: Greenfield-to-Feature Workflow Handoff Hardening

The completed greenfield scaffold-to-feature transition remains a separate
future scope.

### Deferred: Optional Mobile Profile Candidates

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