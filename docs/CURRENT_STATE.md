# Current state

## Identity and publication

- Package: `@dailephd/my-dev-kit-orchestrator`
- Package metadata version: `1.4.0`
- Current release: `v1.4.0`
- Required runtime: Node.js 24 or later
- Latest npm version: `1.4.0`
- Latest Git tag and GitHub Release: `v1.4.0`

Package metadata, npm, the `v1.4.0` tag, and the GitHub Release agree. Release
history is recorded in [CHANGELOG.md](../CHANGELOG.md).

`v1.4.0` ships formal-trace and lifecycle reconciliation corrections,
phase-aware repository readiness, explicit proof-only runs, and a bounded
Observer v0.6 evidence consumer. Fresh pushed `my-frontend-observer@0.6.0`
artifacts validate against the maintained consumer. The historical Lab
compatibility leg is not reproducible from surviving pushed Lab source.

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

The current release, `v1.4.0`, retains `v1.3.2`'s shared artifact-validation
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

The next implementation direction after the released `v1.4.0` is
the separately deferred Greenfield-to-Feature Workflow Handoff Hardening.

Before further implementation or release work, the planner must inspect the current
repository and ecosystem evidence rather than treating roadmap prose as a
prewritten execution plan.

See [COMMANDS.md](COMMANDS.md) for syntax, [WORKFLOWS.md](WORKFLOWS.md) for operational sequences, and [CONTRACTS.md](CONTRACTS.md) for stable compatibility boundaries.
