# Current state

## Identity and publication

- Package: `@dailephd/my-dev-kit-orchestrator`
- Package metadata version: `1.6.0`
- Current release: `v1.6.0`
- Release date: `2026-09-26`
- Required runtime: Node.js 24 or later
- Latest npm version: `1.6.0`
- Latest Git tag and GitHub Release: `v1.6.0`

Package metadata, npm, the `v1.6.0` tag, and the GitHub Release agree. Release
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

## Previous release: Semantic Continuity

`v1.5.0`, the Semantic Continuity and Evidence-to-Implementation Bridge, shipped the following behavior:

Implemented behavior:

- stable `RSP-NNN` responsibility identity declared in the mode-owned test-strategy artifact and traced to upstream `REQ`/`CTX`/`BEH`/`INV`/`TRN`/`PSE` IDs
- per-responsibility mappings in the existing `ImplementationReport`, `TestImplementationReport`, and `VerificationReport`, corroborated by exact match against same-ID my-dev-kit evidence (identity only, not causal proof)
- one phase-aware evaluator enforced through the existing `RunIntegrityGate` (gate schema `1.1.0`, contract `1.0.0`): critical gaps block, noncritical gaps warn, and blocked stages render bounded correction guidance instead of normal work
- automatic activation of new staged runs in `feature`, `repair`, `test`, `refactor`, `harden`, and `extraction` through `run.json`; `greenfield`, proof-only, and legacy runs are unaffected
- a compact Semantic Continuity summary in `status`, `check`, `export`, and the judge prompt, with `mark` and authored `PASS` unable to bypass a blocker
- mode-aware strategy correction routing for `repair`, `refactor`, and `harden`

The command, mode, native-stage, and profile counts below are unchanged, no dependency was added, and no semantic state file is persisted.

## Current release: Workflow Economics and Deterministic Run Telemetry

`v1.6.0`, Workflow Economics and Deterministic Run Telemetry (`ORC-TELEMETRY`), is the current release.

Implemented behavior:

- an optional versioned `runTelemetryVersion` field (`"1.0.0"`) in `run.json`, written for new CLI-created runs; older and programmatic runs without it stay legacy and are never inferred to be activated
- the existing `runId` is unchanged and opaque; each recorded interaction receives a fresh collision-resistant invocation identity (`inv-` plus 32 hex characters), and no second logical run identity exists
- `start`, `prompt`, and `mark` each record one bounded native record per invocation, first as a pending record and then as an immutable completed record with outcome (`succeeded` or `failed`), monotonic duration, and bounded observations copied from results the command already computed (stage facts, prompt character count, mark lifecycle facts, and bounded run-integrity, judge/final-eligibility, and Semantic Continuity snapshots)
- telemetry lives under `.my-dev-kit-orchestrator/telemetry/<run-id>/`, outside the run directory, so recording changes neither run-folder contents nor lifecycle state
- one pure, deterministic Workflow Economics evaluator (version `1.0.0`) derives interaction, prompt-character, duration, observed-span, stage-movement, mark, and snapshot counts on demand; nothing is persisted
- `status` adds one compact Workflow Economics section, `export` adds one bounded fixed-size section, and the default `check` and `check --all` add a `Run telemetry` section whose findings are warnings only (existing `--strict` promotes them like any warning); legacy runs show none of these
- `init`, `list`, `status`, `check`, and `export` never record telemetry

Boundaries preserved: eight commands, seven workflow modes, 79 native stages, 13 greenfield stages, and four starter profiles are unchanged; there is no new command or option, `status` still has no JSON option, no dependency was added, and no Semantic Continuity or economics state is persisted. Telemetry observes `RunIntegrityGate`, judge integrity, lifecycle, correction routing, and Semantic Continuity but never decides for them. Coding-agent time, human time, provider/model identity, token use, API cost, external build/test duration, and target-application measurements remain unavailable.

## Implemented operational surface

The CLI has eight commands: `init`, `start`, `prompt`, `status`, `list`, `mark`, `check`, and `export`. It supports seven workflow modes and 79 native stages. Greenfield has 13 stages and four starter profiles: `typescript-cli`, `nextjs-app`, `android-compose`, and `python-cli`.

Current implementation includes exact workflow-instruction packets, supplemental implementation/test evidence, deterministic context readiness, a canonical `RunIntegrityGate`, judge-integrity enforcement, final-report eligibility, lifecycle-aware status/check/prompt/mark/export behavior, greenfield profile validation, scaffold-plan validation, generated-file evidence, verification-command evidence, and first-vertical-slice readiness. It also includes the standardized 15-file canonical greenfield document baseline applied to all four starter profiles. Separately, every profile receives the common generated-project instructions `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md` through one shared instruction model and the existing scaffold/readiness path. The single supported full-stack combination (`fullstack-web` + `nextjs` + `nextjs-app` + PostgreSQL + Prisma + Docker) remains unchanged, with final-report eligibility for every greenfield run gated on canonical readiness rather than an authored judge verdict alone.

## Current limitations

- Repository retrieval is manual; the orchestrator does not run `my-dev-kit`.
- It generates prompts and validates evidence; it does not execute project setup, builds, tests, Gradle, agents, or publishing.
- `status` is human-readable and has no JSON option.
- Workflow Economics describes only Orchestrator-observed interactions: its durations are time inside Orchestrator commands, its observed span is wall-clock and not active work time, prompt sizes are characters (not tokens), and judge and Semantic Continuity figures are snapshot observations, not attempt or execution counts.
- Custom `start --output-dir` runs cannot be rediscovered by later CLI commands in the current release.
- Component documentation remains empty when the brief provides no component/module hints.
- Checks establish structural/readiness evidence, not runtime correctness.
- Semantic Continuity corroboration shows identity presence in bounded my-dev-kit evidence, not causality; verification results are agent-reported; and the reuse of an `RSP` ID for a different meaning cannot be detected.
- `scaffold-plan` and `scaffold-implementation` retain specialized renderers.

## Active next direction

The latest release is `v1.6.0`, described above; [ROADMAP.md](ROADMAP.md) owns the high-level version scope and
boundaries, and detailed execution sequencing is kept outside current-state
documentation.

`v1.7.0`, Generic Ecosystem Evidence Intake (`ORC-EVIDENCE-01`), is the next
planned feature version and remains a later consumer milestone. It will build on
the `v1.6.0` native run/invocation telemetry substrate; `v1.6.0` does not
implement generic evidence envelopes, requirements, subject/environment
identity, assurance policy, or compatibility evaluation.

The adopted ECO-00 coordination assets are maintained in `my-dev-kit` under
`contracts/ecosystem/` and `docs/ecosystem/`. They reserve `v1.6.0` as
`ORC-TELEMETRY` and `v1.7.0` as `ORC-EVIDENCE-01`, with v1.6.0 as a prerequisite
of v1.7.0. Those assets are cross-repository coordination/reference contracts;
v1.6.0 provides native telemetry
and v1.7.0 remains the planned generic evidence consumer.

Greenfield-to-Feature Workflow Handoff Hardening and optional mobile profile
candidates remain deferred scopes.

See [COMMANDS.md](COMMANDS.md) for syntax, [WORKFLOWS.md](WORKFLOWS.md) for operational sequences, and [CONTRACTS.md](CONTRACTS.md) for stable compatibility boundaries.
