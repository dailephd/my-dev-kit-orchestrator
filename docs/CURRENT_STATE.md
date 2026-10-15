# Current state

## Identity and publication

- Package: `@dailephd/my-dev-kit-orchestrator`
- Package metadata version: `1.7.0`
- Current release: `v1.7.0`
- Release date: `2026-10-15`
- Previous release: `v1.6.2`
- Required runtime: Node.js 24 or later
- Latest npm version: `1.7.0`
- Latest Git tag and GitHub Release: `v1.7.0`

Package metadata, npm, the `v1.7.0` tag, and the GitHub Release agree. Release
history is recorded in [CHANGELOG.md](../CHANGELOG.md).

`v1.4.1` corrects the installed greenfield instruction surface: five stage
prompts (`idea-brief`, `starter-profile`, `bootstrap-bundle`, `project-docs`,
and `scaffold-plan`) no longer depend on Orchestrator-maintainer source paths.
Public prompts now state their artifact, behavior, validation, and
stop-condition requirements directly. Isolated packed-install acceptance
validated that the corrected source-build and installed-package prompts are
equivalent for all five affected stages. All eight commands, seven workflow
modes, 79 native stages, 13 greenfield stages, and four starter profiles
remain unchanged; no package, dependency, export, or core retrieval-engine
change was required.

## Earlier release: Semantic Continuity

`v1.5.0`, the Semantic Continuity and Evidence-to-Implementation Bridge, shipped the following behavior:

Implemented behavior:

- stable `RSP-NNN` responsibility identity declared in the mode-owned test-strategy artifact and traced to upstream `REQ`/`CTX`/`BEH`/`INV`/`TRN`/`PSE` IDs
- per-responsibility mappings in the existing `ImplementationReport`, `TestImplementationReport`, and `VerificationReport`, corroborated by exact match against same-ID my-dev-kit evidence (identity only, not causal proof)
- one phase-aware evaluator enforced through the existing `RunIntegrityGate` (gate schema `1.1.0`, contract `1.0.0`): critical gaps block, noncritical gaps warn, and blocked stages render bounded correction guidance instead of normal work
- automatic activation of new staged runs in `feature`, `repair`, `test`, `refactor`, `harden`, and `extraction` through `run.json`; `greenfield`, proof-only, and legacy runs are unaffected
- a compact Semantic Continuity summary in `status`, `check`, `export`, and the judge prompt, with `mark` and authored `PASS` unable to bypass a blocker
- mode-aware strategy correction routing for `repair`, `refactor`, and `harden`

The command, mode, native-stage, and profile counts below are unchanged, no dependency was added, and no semantic state file is persisted.

## Previous release: Workflow Economics and Deterministic Run Telemetry

`v1.6.0`, Workflow Economics and Deterministic Run Telemetry (`ORC-TELEMETRY`), is the previous release.

Implemented behavior:

- an optional versioned `runTelemetryVersion` field (`"1.0.0"`) in `run.json`, written for new CLI-created runs; older and programmatic runs without it stay legacy and are never inferred to be activated
- the existing `runId` is unchanged and opaque; each recorded interaction receives a fresh collision-resistant invocation identity (`inv-` plus 32 hex characters), and no second logical run identity exists
- `start`, `prompt`, and `mark` each record one bounded native record per invocation, first as a pending record and then as an immutable completed record with outcome (`succeeded` or `failed`), monotonic duration, and bounded observations copied from results the command already computed (stage facts, prompt character count, mark lifecycle facts, and bounded run-integrity, judge/final-eligibility, and Semantic Continuity snapshots)
- telemetry lives under `.my-dev-kit-orchestrator/telemetry/<run-id>/`, outside the run directory, so recording changes neither run-folder contents nor lifecycle state
- one pure, deterministic Workflow Economics evaluator (version `1.0.0`) derives interaction, prompt-character, duration, observed-span, stage-movement, mark, and snapshot counts on demand; nothing is persisted
- `status` adds one compact Workflow Economics section, `export` adds one bounded fixed-size section, and the default `check` and `check --all` add a `Run telemetry` section whose findings are warnings only (existing `--strict` promotes them like any warning); legacy runs show none of these
- `init`, `list`, `status`, `check`, and `export` never record telemetry

Boundaries preserved: eight commands, seven workflow modes, 79 native stages, 13 greenfield stages, and four starter profiles are unchanged; there is no new command or option, `status` still has no JSON option, no dependency was added, and no Semantic Continuity or economics state is persisted. Telemetry observes `RunIntegrityGate`, judge integrity, lifecycle, correction routing, and Semantic Continuity but never decides for them. Coding-agent time, human time, provider/model identity, token use, API cost, external build/test duration, and target-application measurements remain unavailable.

## Current release: Generic Ecosystem Evidence Intake

`v1.7.0`, Generic Ecosystem Evidence Intake (`ORC-EVIDENCE-01`), is the current release.

Implemented behavior:

- strict validation of the six frozen ECO-00 `1.0.0` reference contracts and run-level requirements and evidence documents
- explicit activation through `start --ecosystem-requirements <path>` or programmatic `createRun({ ecosystemRequirementsDocument })`; runs without activation are unchanged
- activated-run sidecars `ecosystem-requirements.json` (immutable, SHA-256 verified) and `ecosystem-evidence.json` (atomic complete replacement through `replaceRunEcosystemEvidence`); neither is a native artifact
- adapters for supported native outputs only: `@dailephd/my-dev-kit@1.12.5` static context capsule and retrieval audit and `@dailephd/my-frontend-observer@0.10.0` bounded agent context, each at native schema `1.0.0`
- deterministic native requirement evaluation inside the existing RunIntegrityGate: critical gaps block judge and final-report eligibility, noncritical gaps warn, and current bytes are re-evaluated without a persisted eligibility cache
- opt-in stdout-only `status --json` and `check --json` projecting RunEvidenceInspectionV1 schema `1.0.0`, and a bounded Ecosystem evidence section in plain-text `export` for activated runs

Preserved contracts: eight commands, seven workflow modes, 79 native stages, 13 greenfield stages, and four starter profiles are unchanged; there is no new command, mode, stage, profile, or runtime dependency. Kit evidence is static context and Observer evidence is bounded review context; neither proves test execution or real browser behavior. Execution assurance, a Lab adapter, and ECO-01 certification are not part of this release.

## Previous release: Trace Diagnostic Accuracy and Correction Guidance

`v1.6.2`, a trace-diagnostic correction patch, is the previous release; it is a patch between `v1.6.1` and `v1.7.0`.

Implemented behavior:

- ordinary technical tokens such as `ECO-00` and `UTF-8` are preserved as prose, while recognized-prefix near misses (`REQ-01`, `RSP001`) still fail wherever they occur and supported explicit unknown-prefix declarations or link endpoints still fail
- run-level `check --trace` and native trace checks in `check --all` resolve actual declarations from the same artifact, same-stage artifacts, and earlier native stages; future stages do not satisfy targets, and standalone and design-map checks remain file-local
- advisory correction guidance names only verified run stages or an explicit artifact, with no change to judge routing, the gate, lifecycle, or trace-results version `"1"`
- the development-only documentation linter is `markdownlint-cli` (configured by `.markdownlint.jsonc`), replacing `markdownlint-cli2` and removing a high-severity development-only dependency chain; the runtime dependency set is unchanged

Preserved contracts: eight commands, seven workflow modes, 79 native stages, 13 greenfield stages, and four starter profiles are unchanged; there is no new command, option, mode, stage, artifact family, persisted state, schema-major bump, or runtime dependency. `RunIntegrityGate` remains the single enforcement consumer, and generic evidence intake is not implemented.

## Earlier release: Test-Context Bootstrap Correction

`v1.6.1`, a test-context bootstrap correction, is an earlier release; it is a patch between `v1.6.0` and `v1.7.0`.

Why it exists: repository-context readiness required every critical test responsibility to be fully mapped, including related-test and oracle evidence, before `test-implementation` could begin. That evidence can only be created during `test-implementation`, so a new subsystem with no tests yet could never enter the stage.

Implemented behavior:

- readiness is phase-aware over truthful raw evidence. While a run is entering `test-implementation` and its `TestImplementationReport` does not exist, a critical responsibility whose raw my-dev-kit mapping is `partially-mapped` only for the test-side reasons `no related test` and `no oracle evidence` is accepted for entry, provided production symbols, contract/validator/constant/error evidence, and a discovered test-runner command are present and freshness, repository/index identity, provenance, and mapping completeness hold
- the accepted state is ready-with-assumptions with the warning `CONTEXT_TEST_EVIDENCE_PENDING_PRETEST`; the raw mapping status is never rewritten, so critical responsibilities still count as not fully mapped
- `status`, `check`, and the `test-implementation` prompt say that entry is allowed and completion is not yet eligible; the prompt carries a seven-step sequence that ends with refreshing test repository context after the tests exist
- once the `TestImplementationReport` exists, and for `verification`, `judge`, and `final-report`, the strict contract returns: every critical responsibility must be fully mapped, `mark` cannot complete the stage, and an authored `PASS` cannot bypass the gate
- every other blocker still blocks entry, and a responsibility that mixes a test-side gap with any production-side gap stays blocked
- legacy schema-major-1 runs, including runs without `semanticContinuityVersion`, receive the correction without any `run.json` change; Semantic Continuity is not activated for them and its phase-aware behavior is unchanged

Preserved contracts: eight commands, seven workflow modes, 79 native stages, 13 greenfield stages, and four starter profiles are unchanged; there is no new command, option, mode, stage, artifact family, persisted state, schema-major bump, or dependency. `RunIntegrityGate` remains the single enforcement consumer, and `my-dev-kit` is still run manually.

## Implemented operational surface

The CLI has eight commands: `init`, `start`, `prompt`, `status`, `list`, `mark`, `check`, and `export`. It supports seven workflow modes and 79 native stages. Greenfield has 13 stages and four starter profiles: `typescript-cli`, `nextjs-app`, `android-compose`, and `python-cli`.

Current implementation includes exact workflow-instruction packets, supplemental implementation/test evidence, deterministic context readiness, a canonical `RunIntegrityGate`, judge-integrity enforcement, final-report eligibility, lifecycle-aware status/check/prompt/mark/export behavior, greenfield profile validation, scaffold-plan validation, generated-file evidence, verification-command evidence, and first-vertical-slice readiness. It also includes the standardized 15-file canonical greenfield document baseline applied to all four starter profiles. Separately, every profile receives the common generated-project instructions `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md` through one shared instruction model and the existing scaffold/readiness path. The single supported full-stack combination (`fullstack-web` + `nextjs` + `nextjs-app` + PostgreSQL + Prisma + Docker) remains unchanged, with final-report eligibility for every greenfield run gated on canonical readiness rather than an authored judge verdict alone.

## Current limitations

- Repository retrieval is manual; the orchestrator does not run `my-dev-kit`.
- It generates prompts and validates evidence; it does not execute project setup, builds, tests, Gradle, agents, or publishing.
- Releases up to v1.6.2 print human-readable status only; opt-in JSON inspection (`status --json`, `check --json`) is available since v1.7.0.
- Workflow Economics describes only Orchestrator-observed interactions: its durations are time inside Orchestrator commands, its observed span is wall-clock and not active work time, prompt sizes are characters (not tokens), and judge and Semantic Continuity figures are snapshot observations, not attempt or execution counts.
- Custom `start --output-dir` runs cannot be rediscovered by later CLI commands in the current release.
- Component documentation remains empty when the brief provides no component/module hints.
- Checks establish structural/readiness evidence, not runtime correctness.
- Semantic Continuity corroboration shows identity presence in bounded my-dev-kit evidence, not causality; verification results are agent-reported; and the reuse of an `RSP` ID for a different meaning cannot be detected.
- In v1.6.1 and earlier, run-level trace checks could mistake ordinary technical
  identifiers such as `ECO-00` and `UTF-8` for malformed trace IDs, fail to
  resolve valid upstream declarations across separate native artifacts, and
  suggest a `design-map` correction stage that does not exist in the active
  workflow. These defects are corrected in v1.6.2. Trace diagnostics remain
  separate from the canonical RunIntegrityGate.
- `scaffold-plan` and `scaffold-implementation` retain specialized renderers.

## Active next direction

The `v1.7.0` release implements generic ecosystem evidence intake, native
readiness and inspection, as described above. Strict ECO-00 reference validation,
optional `start --ecosystem-requirements` and programmatic
`createRun({ ecosystemRequirementsDocument })` activation, immutable
requirements with a saved-byte SHA-256, empty evidence initialization, and atomic
complete evidence replacement are included. No new command, native stage, mode,
profile, dependency, telemetry policy, or producer contract is added.

Pinned Kit v1.12.5 static-context and Observer v0.10.0 bounded review-context
adapters require exact native subject binding, schema 1.0.0, fresh adequate
evidence and safe local reads. Execution assurance, commit/environment
attestation, cross-producer project correlation, optional Observer fidelity
verification and integration certification remain unimplemented. Observer native
context from the supported fixture used validated synthetic observation input,
not real browser execution. A Lab execution-assurance producer and ECO-01
certification are not established.

`status --json` and `check --json` are stdout-only RunEvidenceInspectionV1
schema 1.0.0 projections. Check executes the selected native checks and
preserves their diagnostics, writes and strict exits. Activated plain-text export
adds one bounded Ecosystem evidence section; unactivated handoffs retain their
existing format. Default status/check text remains compatible.

The current release is `v1.7.0`, described above; [ROADMAP.md](ROADMAP.md) owns the high-level version scope and
boundaries, and detailed execution sequencing is kept outside current-state
documentation.

`v1.7.0`, Generic Ecosystem Evidence Intake (`ORC-EVIDENCE-01`), is the
current release. It builds on the `v1.6.0` native run/invocation telemetry
substrate; `v1.6.0` and `v1.6.2` do not implement generic evidence
envelopes, requirements, subject/environment identity, assurance policy, or
compatibility evaluation.

The adopted ECO-00 coordination assets are maintained in `my-dev-kit` under
`contracts/ecosystem/` and `docs/ecosystem/`. They reserve `v1.6.0` as
`ORC-TELEMETRY` and `v1.7.0` as `ORC-EVIDENCE-01`, with v1.6.0 as a prerequisite
of v1.7.0. Those assets are cross-repository coordination/reference contracts;
v1.6.0 provides native telemetry
and v1.7.0 is the generic evidence consumer.

Greenfield-to-Feature Workflow Handoff Hardening and optional mobile profile
candidates remain deferred scopes.

See [COMMANDS.md](COMMANDS.md) for syntax, [WORKFLOWS.md](WORKFLOWS.md) for operational sequences, and [CONTRACTS.md](CONTRACTS.md) for stable compatibility boundaries.
