# Roadmap

Versions are listed in chronological order.

`v1.2.0` is the current published release. `v1.1.0`, `v1.0.0`, and the
`v0.x.0` releases remain part of the published project history. Versions after
`v1.2.0` are planned milestones.

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
- `v1.2.1` is **planned, not implemented**. It introduces a structured workflow-instruction catalog with stable IDs, deterministic reference resolution, a bounded `WorkflowInstructionPacket` per stage, and manually refreshed implementation/test repository context consumed inside the existing `implementation` and `test-implementation` stages. It preserves the current native stage order, all seven modes, and existing-run compatibility, and it does not add automatic `my-dev-kit` execution or a native context-retrieval stage (see "v1.2.1 (planned)" below).
- `v1.3.0` will expand greenfield scaffold verification and profile readiness so additional starter profiles can plug into the platform-neutral bootstrap workflow without duplicating Android-specific behavior.
- `v1.4.0` will harden the greenfield-to-feature workflow handoff so completed scaffolds transition cleanly into normal graph-guided feature, repair, refactor, test, and harden workflows.
- `v1.5.0` will evaluate optional additional mobile profiles such as Android XML, Flutter, React Native, and iOS SwiftUI only if the greenfield profile architecture proves reusable.

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

## v1.2.1 (planned)

### v1.2.1 - Workflow-Instruction and Context-Refresh Integration

Status:
**Planned. Not implemented. Not published. No release date assigned.**

This section documents the approved implementation plan so that another
coding agent or planning session has enough verified context to write and
execute the `v1.2.1` implementation prompts. It is a bounded patch placed
immediately after `v1.2.0`. It does not reorder, combine, or move any
capability into or out of `v1.3.0`, `v1.4.0`, or `v1.5.0` below, and it does
not introduce any other version number.

#### Problems this patch addresses

**Workflow-instruction overload.** Runtime instructions are currently
produced by the roughly 3,000-line `src/promptGenerator.ts`, supported by
this documentation set. That file mixes many instruction categories in one
place: workflow-selection rules, command references, shared prompt
invariants, testing methodology, workflow-specific instructions, git-safety
rules, anti-drift rules, release rules, publication rules, examples, and
final-report formats. Because there is no structured, ID-addressable
catalog, unrelated instruction categories can leak between stages -- for
example, publication rules appearing in an implementation prompt, or release
steps appearing in a test-writing prompt. This wastes prompt context, makes
prompts harder to inspect, and makes leakage possible instead of structurally
prevented.

**Stale repository context.** The architecture-context stage retrieves
repository context early in a run, but production implementation can
substantially change the codebase after that point. The original
`ArchitectureContextPacket` can become stale before test implementation
begins. Implementation needs a context view that is current at the moment
of implementation; test implementation needs a context view that reflects
the actual production changes just made. One early, broad context packet
cannot honestly satisfy both later roles.

**Incompatible context needs across roles.** Architecture planning needs
likely owners and extension points. Production implementation needs exact
current code and contracts. Test implementation needs changed-production
evidence and current test infrastructure. These are different retrieval
roles, not different depths of the same retrieval.

**Manual-integration gap.** The orchestrator does not invoke `my-dev-kit`
automatically today. The architecture-context prompt instructs a coding
agent to perform retrieval; the implementation and test-implementation
prompts do not currently require any context refresh. `v1.2.1` adds explicit
manual refresh requirements to those two existing stages without claiming
that retrieval happens automatically.

#### Goal

Produce bounded, stage-specific workflow instructions and integrate manually
refreshed repository evidence into the existing `implementation` and
`test-implementation` stages, while preserving native stage order, run
compatibility, lifecycle behavior, judge behavior, and correction routing.

#### Ownership boundaries

- **`my-dev-kit-orchestrator` owns:** workflow modes, workflow pipelines,
  native stage order, workflow catalog content, workflow/stage selection,
  stable workflow/stage/command/rule/report-contract IDs, catalog
  validation, deterministic dependency resolution, the
  `WorkflowInstructionPacket`, stage prompt assembly, `TaskState`, required
  upstream artifact selection, the prompt-level `StageContextBundle`, run
  state, artifact lifecycle, manual context-freshness rules, correction
  routing, judge-verdict interpretation, and publication authorization.
- **`my-dev-kit` owns:** repository indexing, architecture/implementation/
  test-implementation-role repository evidence, `ContextRequest`, context
  capsules, retrieval-audit records, changed-file/changed-symbol evidence,
  before/after graph-diff evidence, and repository-evidence adequacy and
  provenance.
- **`my-dev-kit-lab` owns:** controlled strategy evaluation, context-size
  measurement, required-evidence recall, irrelevant-instruction/file
  inclusion measurement, responsibility-mapping completeness, determinism
  evaluation, truncation/inadequacy evaluation, target immutability,
  reports/plots/screenshots, security validation, and code-rot auditing.
- `my-dev-kit-orchestrator` must not reimplement repository indexing,
  source ranking, or code-graph traversal; must not generate `my-dev-kit`
  context capsules itself; must not own retrieval-audit semantics; and must
  not become `my-dev-kit-lab`.
- `my-dev-kit` must not decide stage order, select the next workflow,
  interpret judge verdicts, assemble orchestrator workflow instructions, or
  authorize publication.
- `my-dev-kit-lab` must not become a production workflow dependency, assemble
  normal coding-agent prompts, or control stage progression.

See [docs/ARCHITECTURE.md](ARCHITECTURE.md#v121-planned-workflow-catalog-workflowinstructionpacket-and-stagecontextbundle)
for the catalog, resolver, packet, and bundle design, and
[docs/WORKFLOWS.md](WORKFLOWS.md#v121-planned-operational-sequence) for the
revised operational sequence.

#### In scope

- A structured workflow catalog (new owner: `my-dev-kit-orchestrator`) with
  typed entries for workflows, stages, commands, rules, and report
  contracts, each carrying a stable ID (candidate patterns such as
  `workflow.feature`, `workflow.feature.implementation`,
  `command.my-dev-kit.context`, `rule.context.refresh-before-implementation`
  -- exact names are subject to implementation-time source-convention
  inspection and are not final).
- Deterministic, exact-ID reference resolution with duplicate-ID rejection,
  missing-reference rejection, invalid-reference-type rejection, and cycle
  detection. No fuzzy matching, no semantic retrieval, no LLM-based
  selection.
- A `WorkflowInstructionPacket` that bounds one stage's instructions to its
  primary workflow/stage entry plus only its explicitly referenced
  commands, rules, and one report contract -- excluding the rest of the
  catalog, adjacent workflows, and unrelated publication/release/security/
  documentation instructions.
- A deterministic budget model for packet contents (entry counts and
  text-size limits), with explicit truncation and inadequacy signaling
  instead of silent omission of required content.
- Stage-specific prompt assembly that consumes the packet inside the
  existing prompt generator, preserving existing prompt filenames and stage
  contracts.
- A prompt-level `StageContextBundle` concept (`TaskState` +
  `WorkflowInstructionPacket` + a repository-evidence reference + required
  upstream artifacts + per-section provenance). This is an assembled prompt/
  in-memory structure in `v1.2.1`, not a native lifecycle stage, not a
  shared package, and not a `my-dev-kit` artifact.
- Supplemental, optional context artifacts and reports consumed inside the
  existing `implementation` and `test-implementation` stages (see
  [docs/ARTIFACTS.md](ARTIFACTS.md#v121-planned-supplemental-context-artifacts)):
  `artifacts/implementation-context-packet.txt`,
  `reports/implementation-context-retrieval-report.txt`,
  `artifacts/test-context-packet.txt`, and
  `reports/test-context-retrieval-report.txt`.
- Manual freshness rules (`fresh` / `stale` / `unknown`, candidate names
  subject to implementation) recorded in supplemental context metadata, plus
  stage stop rules for missing, stale, or inadequate context.
- Verification and judge integration that treats missing/stale/inadequate
  required context, and unresolved critical test-responsibility mappings, as
  correction evidence -- using the existing judge and correction-routing
  architecture, not a second judge.

#### Deferred (explicitly out of scope for v1.2.1)

- Automatic `my-dev-kit` execution or any external-command runtime.
- A native implementation-context or test-context lifecycle stage (the
  native stage count for every mode is unchanged in `v1.2.1`).
- Source or repository watching.
- Content-hash stale propagation or automatic downstream invalidation by
  context hash.
- Fuzzy, semantic, or LLM-based workflow selection.
- A shared cross-repository schema package or public plugin architecture.
- A wholesale rewrite of `src/promptGenerator.ts`.
- A coding-agent runtime, repository indexing, or repository-evidence
  ranking inside the orchestrator.
- `my-dev-kit-lab` evaluation logic, security validation, or publication
  changes.

#### Dependencies

`v1.2.1` depends on stable repository-context contracts from `my-dev-kit
v1.10.1` (`ContextRequest`, context capsule, and retrieval-audit schema
additions). Publication of `my-dev-kit v1.10.1` is not required before
`my-dev-kit-orchestrator v1.2.1` implementation begins; local fixture files
and configurable paths are acceptable for development and tests. Recommended
implementation order across the three repositories:

1. `my-dev-kit v1.10.1`
2. `my-dev-kit-orchestrator v1.2.1`
3. `my-dev-kit-lab v0.4.3`

`my-dev-kit-lab v0.4.3` evaluates the combined strategy after both
patches exist; it is never a production runtime dependency of either.

#### Candidate implementation batches

1. **Catalog contracts and resolver** -- verify the `v1.2.0` baseline, define
   entry types/stable IDs/reference types, implement validation and
   exact-ID resolution (duplicate/missing-reference/invalid-reference/cycle
   failures), add the budget model, add unit tests. Does not integrate every
   stage prompt yet.
2. **`WorkflowInstructionPacket`** -- assemble one bounded, deterministic
   packet (one primary entry, resolved commands/rules, one report contract,
   provenance, budget evidence, truncation/inadequacy, deterministic
   serialization); integrate one representative stage; add tests.
3. **Stage-specific prompt integration** -- migrate stage prompts to packet
   assembly in bounded groups inside the existing prompt generator,
   preserving filenames and stage order; add prompt-leakage tests; avoid a
   wholesale prompt-generator rewrite.
4. **Supplemental context references** -- add optional context-requirement
   metadata and the four supplemental artifact/report references to the
   implementation and test-implementation prompts; preserve old-run
   compatibility; add artifact and prompt tests.
5. **Freshness, inadequacy, and stop rules** -- add manual freshness states,
   repository/index identity references, stale/unknown behavior, critical
   inadequacy rules, and unresolved-responsibility behavior; integrate with
   the existing lifecycle and correction-routing architecture; add tests.
6. **Compatibility and regression gate** -- validate every existing mode,
   artifact, lifecycle behavior, prompt, judge behavior, and package
   behavior; determinism; cross-platform paths; full test suite; CLI smoke;
   bounded corrective fixes only.
7. **Documentation reconciliation and completeness audit** -- reconcile
   README, CHANGELOG, ROADMAP, and architecture/workflow/artifact/usage/
   validation docs against the actual implementation; document the manual
   integration boundary and deferred native automation; full completeness
   audit; no pre-release or publication work.

#### Acceptance criteria

- Each stage receives exactly one primary workflow/stage entry, its
  permitted dependencies, and one report contract; unrelated instructions
  (publication, release, security, unrelated-workflow content) are excluded
  from every stage prompt.
- Catalog resolution and packet assembly are deterministic: identical
  catalog, workflow ID, stage ID, task state, and limits produce identical
  selected entries, ordering, packet content, warnings, and budget
  accounting.
- Every existing mode, stage order, prompt filename, run, artifact file,
  lifecycle state, judge behavior, and correction route remains compatible;
  old runs without the new supplemental artifacts remain valid.
- The implementation and test-implementation prompts accurately describe
  manual integration; no prompt claims the orchestrator executes
  `my-dev-kit` automatically or that a native context stage exists.
- Required content that cannot fit inside a packet's budget produces
  explicit truncation or inadequacy signaling, never silent omission.
- Catalog, packet, prompt-leakage, supplemental-artifact, freshness, and
  full-suite regression tests all pass, and `npm run docs:check` /
  `npm run lint:docs` pass.

#### Testing and validation requirements

Behavior-derived tests are required for: catalog validity, stable IDs, and
exact retrieval (including duplicate/missing/invalid/cyclic-reference
failures and deterministic ordering); packet assembly (inclusion/exclusion
rules, provenance, budget accounting, truncation, stable serialization);
prompt-leakage (each stage prompt contains only its permitted instruction
categories); supplemental-artifact handling (present/missing/stale/
inadequate/unsupported-schema, old-run compatibility); freshness resolution
(`fresh`/`stale`/`unknown`, missing-identity handling, critical-stale
blocking); and full lifecycle/judge/correction/run-loading regression across
every existing mode, including greenfield.

Actual current validation commands (verified against `package.json`):
`npm ci`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run docs:check`, `npm run smoke:cli`, `npm run lint`,
`npm run lint:docs`, `npm run test:security`, `npm pack --dry-run`. Targeted
test examples: `npx jest tests/promptGenerator.test.ts`,
`npx jest tests/artifactLifecycle.test.ts`,
`npx jest tests/artifactChecker.test.ts`, plus new catalog/resolver/packet/
context-integration test files added during implementation. This planning
inspection found no dedicated `verify`, benchmarking, packet-determinism, or
JSON-validation script in the current repository; do not describe those as
existing.

See [docs/DEVELOPMENT.md](DEVELOPMENT.md#v121-planned-validation-additions)
for the full validation plan, including package (`npm pack --dry-run`) and
cross-platform (Windows/Linux/macOS, Node 22/24) validation.

#### Integration with the wider ecosystem

- `my-dev-kit v1.10.1` establishes the `ContextRequest`, context-capsule, and
  retrieval-audit contract additions this patch consumes manually.
- `my-dev-kit-lab v0.4.3` evaluates the combined workflow-instruction and
  context-refresh strategy after both patches exist. It measures context
  size, required-evidence recall, irrelevant-content inclusion, and
  responsibility-mapping completeness; it does not participate in normal
  runtime execution and is never a production dependency of
  `my-dev-kit-orchestrator`.

## Planned milestones

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
