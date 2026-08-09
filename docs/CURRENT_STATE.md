# Current state

## Identity and publication

- Package: `@dailephd/my-dev-kit-orchestrator`
- Source version: `1.3.2`
- Required runtime: Node.js 24 or later
- Latest verified npm version: `1.3.2`
- Latest verified Git tag and GitHub Release: `v1.3.2`

Package metadata, npm, the `v1.3.2` tag, and the GitHub Release agree. Release
history is in [CHANGELOG.md](../CHANGELOG.md).

## Implemented operational surface

The CLI has eight commands: `init`, `start`, `prompt`, `status`, `list`, `mark`, `check`, and `export`. It supports seven workflow modes and 79 native stages. Greenfield has 13 stages and three starter profiles: `typescript-cli`, `nextjs-app`, and `android-compose`.

Current implementation includes exact workflow-instruction packets, supplemental implementation/test evidence, deterministic context readiness, a canonical `RunIntegrityGate`, judge-integrity enforcement, final-report eligibility, lifecycle-aware status/check/prompt/mark/export behavior, greenfield profile validation, scaffold-plan validation, generated-file evidence, verification-command evidence, and first-vertical-slice readiness. It also includes the standardized 15-file canonical greenfield document baseline applied to all three starter profiles, and the single supported full-stack combination (`fullstack-web` + `nextjs` + `nextjs-app` + PostgreSQL + Prisma + Docker) composed additively into scaffold planning and canonical greenfield readiness, with final-report eligibility for every greenfield run gated on that canonical readiness rather than an authored judge verdict alone.

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
Environment Hardening, is the current published release. It makes the
standardized 15-file canonical project-document baseline the generic
documentation substrate for every newly bootstrapped greenfield project
across all three starter profiles, adds orthogonal `projectType`/
`webFramework` brief dimensions, and adds the first supported full-stack
combination (`fullstack-web`, `nextjs`, `nextjs-app`, PostgreSQL, Prisma,
and Docker) composed additively into scaffold planning and canonical
greenfield readiness, together with a judge/final-report lifecycle
correction that gates final-report eligibility on canonical greenfield
readiness for every greenfield run. It does not add a fourth starter
profile, a new CLI flag, a new workflow mode, or a new native stage; the CLI
remains eight commands, seven modes, and 79 native stages, with greenfield
still 13 stages and three starter profiles (`typescript-cli`, `nextjs-app`,
`android-compose`). See the detailed [v1.3.1 roadmap
section](ROADMAP.md#v131---standardized-greenfield-documentation-and-full-stack-nextjs-environment-hardening).

The `v1.3.2` patch release corrects shared artifact validation so the three
native greenfield JSON artifacts retain strict JSON and structured-field
contracts without receiving incompatible text-header requirements. Text
artifact behavior and run-integrity/readiness gates remain unchanged.

`v1.4.0`, Greenfield-to-Feature Workflow Handoff Hardening, is the next
planned milestone after `v1.3.1`. Its scope is not part of the `v1.3.1`
release and has not started.

Before further implementation, the planner must inspect the current
repository and ecosystem evidence rather than treating roadmap prose as a
prewritten execution plan.

See [COMMANDS.md](COMMANDS.md) for syntax, [WORKFLOWS.md](WORKFLOWS.md) for operational sequences, and [CONTRACTS.md](CONTRACTS.md) for stable compatibility boundaries.
