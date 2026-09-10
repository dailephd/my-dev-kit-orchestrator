# Current state

## Identity and publication

- Package: `@dailephd/my-dev-kit-orchestrator`
- Package metadata version: `1.4.1`
- Current release: `v1.4.1`
- Required runtime: Node.js 24 or later
- Latest npm version: `1.4.1`
- Latest Git tag and GitHub Release: `v1.4.1`

Package metadata, npm, the `v1.4.1` tag, and the GitHub Release agree. Release
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
- `scaffold-plan` and `scaffold-implementation` retain specialized renderers.

## Active next direction

The ecosystem documentation-standardization report records
`ECOSYSTEM_DOCUMENTATION_STANDARDIZED`: the common canonical project-document
structure and its responsibility model have been reconciled across
`my-dev-kit`, `my-dev-kit-orchestrator`, and `my-dev-kit-lab`.

`v1.3.1`, Standardized Greenfield Documentation and Full-Stack Next.js
Environment Hardening, established the
standardized 15-file canonical project-document baseline the generic
documentation substrate for every newly bootstrapped greenfield project
across the then-current `typescript-cli`, `nextjs-app`, and `android-compose`
profile set, adds orthogonal `projectType`/
`webFramework` brief dimensions, and adds the first supported full-stack
combination (`fullstack-web`, `nextjs`, `nextjs-app`, PostgreSQL, Prisma,
and Docker) composed additively into scaffold planning and canonical
greenfield readiness, together with a judge/final-report lifecycle
correction that gates final-report eligibility on canonical greenfield
readiness for every greenfield run. It does not add a fourth starter
profile, a new CLI flag, a new workflow mode, or a new native stage; the CLI
remains eight commands, seven modes, and 79 native stages, with greenfield
still 13 stages and the same `typescript-cli`, `nextjs-app`, and
`android-compose` profile set. See the detailed [v1.3.1 roadmap
section](ROADMAP.md#v131---standardized-greenfield-documentation-and-full-stack-nextjs-environment-hardening).

`v1.4.1` retains `v1.3.2`'s shared artifact-validation
correction so the three native greenfield JSON artifacts retain strict JSON and
structured-field contracts without receiving incompatible text-header
requirements. Python CLI Greenfield Profile and Coding-Agent Instruction
Bootstrap adds
the four common instruction outputs, common + profile + optional-capability
target composition, and the bounded fourth `python-cli` profile. Explicit
`python-cli`, the exact `python` alias, and clear Python-plus-CLI intent resolve
to that profile; bare Python and Python web/API/server intent remain
unsupported. A real Python scaffold passed compile, pytest, CLI, canonical
readiness, and generic `my-dev-kit` initial-index retrieval without a new mode,
stage, readiness engine, or Python-specific index path.

`v1.4.1`, Installed Greenfield Instruction Surface Correction, is the current
released version. It replaces inappropriate Orchestrator-maintainer
source-path guidance in shipped greenfield prompts with direct artifact,
behavior, validation, and completion requirements while preserving the
underlying instruction intent and installed package surface. The active next
direction is: (1) `v1.5.0`, Semantic Continuity and Evidence-to-Implementation
Bridge, is the next planned feature version; (2) `v1.6.0` Workflow Economics
and Deterministic Run Telemetry follows; (3) Greenfield-to-Feature Workflow
Handoff Hardening remains deferred; (4) optional mobile-profile candidates
remain deferred.

Before further implementation or release work, the planner must inspect the current
repository and ecosystem evidence rather than treating roadmap prose as a
prewritten execution plan.

See [COMMANDS.md](COMMANDS.md) for syntax, [WORKFLOWS.md](WORKFLOWS.md) for operational sequences, and [CONTRACTS.md](CONTRACTS.md) for stable compatibility boundaries.