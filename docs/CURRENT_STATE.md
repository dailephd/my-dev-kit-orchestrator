# Current state

## Identity and publication

- Package: `@dailephd/my-dev-kit-orchestrator`
- Package metadata version: `1.5.0`
- Current release: `v1.5.0`
- Release date: `2026-09-25`
- Required runtime: Node.js 24 or later
- Latest npm version: `1.5.0`
- Latest Git tag and GitHub Release: `v1.5.0`

Package metadata, npm, the `v1.5.0` tag, and the GitHub Release agree. Release
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

## Current release: Semantic Continuity

`v1.5.0`, the Semantic Continuity and Evidence-to-Implementation Bridge, is the current release. It ships the following behavior:

Implemented behavior:

- stable `RSP-NNN` responsibility identity declared in the mode-owned test-strategy artifact and traced to upstream `REQ`/`CTX`/`BEH`/`INV`/`TRN`/`PSE` IDs
- per-responsibility mappings in the existing `ImplementationReport`, `TestImplementationReport`, and `VerificationReport`, corroborated by exact match against same-ID my-dev-kit evidence (identity only, not causal proof)
- one phase-aware evaluator enforced through the existing `RunIntegrityGate` (gate schema `1.1.0`, contract `1.0.0`): critical gaps block, noncritical gaps warn, and blocked stages render bounded correction guidance instead of normal work
- automatic activation of new staged runs in `feature`, `repair`, `test`, `refactor`, `harden`, and `extraction` through `run.json`; `greenfield`, proof-only, and legacy runs are unaffected
- a compact Semantic Continuity summary in `status`, `check`, `export`, and the judge prompt, with `mark` and authored `PASS` unable to bypass a blocker
- mode-aware strategy correction routing for `repair`, `refactor`, and `harden`

The command, mode, native-stage, and profile counts below are unchanged, no dependency was added, and no semantic state file is persisted.

## Implemented operational surface

The CLI has eight commands: `init`, `start`, `prompt`, `status`, `list`, `mark`, `check`, and `export`. It supports seven workflow modes and 79 native stages. Greenfield has 13 stages and four starter profiles: `typescript-cli`, `nextjs-app`, `android-compose`, and `python-cli`.

Current implementation includes exact workflow-instruction packets, supplemental implementation/test evidence, deterministic context readiness, a canonical `RunIntegrityGate`, judge-integrity enforcement, final-report eligibility, lifecycle-aware status/check/prompt/mark/export behavior, greenfield profile validation, scaffold-plan validation, generated-file evidence, verification-command evidence, and first-vertical-slice readiness. It also includes the standardized 15-file canonical greenfield document baseline applied to all four starter profiles. Separately, every profile receives the common generated-project instructions `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md` through one shared instruction model and the existing scaffold/readiness path. The single supported full-stack combination (`fullstack-web` + `nextjs` + `nextjs-app` + PostgreSQL + Prisma + Docker) remains unchanged, with final-report eligibility for every greenfield run gated on canonical readiness rather than an authored judge verdict alone.

## Current limitations

- Repository retrieval is manual; the orchestrator does not run `my-dev-kit`.
- It generates prompts and validates evidence; it does not execute project setup, builds, tests, Gradle, agents, or publishing.
- `status` is human-readable and has no JSON option.
- Custom `start --output-dir` runs cannot be rediscovered by later CLI commands in the current release.
- Component documentation remains empty when the brief provides no component/module hints.
- Checks establish structural/readiness evidence, not runtime correctness.
- Semantic Continuity corroboration shows identity presence in bounded my-dev-kit evidence, not causality; verification results are agent-reported; and the reuse of an `RSP` ID for a different meaning cannot be detected.
- `scaffold-plan` and `scaffold-implementation` retain specialized renderers.

## Active next direction

The current runtime remains the published `v1.5.0` Semantic Continuity
baseline described above. No `v1.6.0` telemetry behavior is implemented by
the current release.

The next planned feature release is `v1.6.0`, Workflow Economics and
Deterministic Run Telemetry (`ORC-TELEMETRY`). [ROADMAP.md](ROADMAP.md#v160---workflow-economics-and-deterministic-run-telemetry)
owns the high-level version scope and boundaries; detailed execution
sequencing is kept outside current-state documentation.

The planned v1.6.0 boundary is:

- preserve the existing `runId` behavior as the native run-instance identity
  and add a separate fresh invocation identity for recorded interactions;
- activate the additive telemetry contract through an optional version field on
  new CLI-created runs while leaving historical/programmatic runs valid without
  it;
- store bounded native telemetry outside run directories so telemetry does not
  change native lifecycle state or run-folder mtime;
- record only Orchestrator-owned workflow interactions in v1.6.0
  (`start`, `prompt`, and `mark`), while `status`, `check`,
  `export`, `list`, and `init` remain non-recording inspection/utility
  surfaces;
- derive Workflow Economics deterministically from accepted native telemetry
  records, including bounded interaction, prompt-character, transition/revisit,
  correction/blocking, duration, and observed-span facts;
- treat `RunIntegrityGate`, judge integrity, lifecycle, correction routing,
  repository-context readiness, and Semantic Continuity as canonical existing
  owners that telemetry may observe but never replace or recompute;
- keep coding-agent time, provider/model identity, token usage, API cost,
  external build/test duration, browser performance, and target-application
  resource telemetry unavailable unless a future domain owner supplies them;
- preserve the eight-command, seven-mode, 79-native-stage, 13-greenfield-stage,
  four-profile public surface and keep `status` human-readable with no JSON
  option.

The adopted ECO-00 coordination assets are maintained in `my-dev-kit` under
`contracts/ecosystem/` and `docs/ecosystem/`. They reserve
`v1.6.0` as `ORC-TELEMETRY` and `v1.7.0` as
`ORC-EVIDENCE-01`, with v1.6.0 as a prerequisite of v1.7.0. Those assets are
cross-repository coordination/reference contracts; they do not change the
current Orchestrator 1.5.0 runtime or require v1.6.0 to implement generic
evidence envelopes, requirements, subject/environment identity, assurance
policy, or compatibility evaluation.

`v1.7.0`, Generic Ecosystem Evidence Intake, remains the later consumer
milestone. Greenfield-to-Feature Workflow Handoff Hardening and optional mobile
profile candidates remain deferred and are not part of v1.6.0.

v1.6.0 work proceeds from the high-level roadmap scope and current repository
evidence. Documentation reconciliation, readiness/cross-platform/security/
code-rot validation, release preparation, and publication remain separate
post-implementation workflows.

See [COMMANDS.md](COMMANDS.md) for syntax, [WORKFLOWS.md](WORKFLOWS.md) for operational sequences, and [CONTRACTS.md](CONTRACTS.md) for stable compatibility boundaries.
