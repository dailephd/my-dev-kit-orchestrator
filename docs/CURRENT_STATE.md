# Current state

## Identity and publication

- Package: `@dailephd/my-dev-kit-orchestrator`
- Source version: `1.3.0`
- Required runtime: Node.js 24 or later
- Latest verified npm version: `1.3.0`
- Latest verified Git tag and GitHub Release: `v1.3.0`

Package metadata, npm, the `v1.3.0` tag, and the GitHub Release agree. Release history is in [CHANGELOG.md](../CHANGELOG.md).

## Implemented operational surface

The CLI has eight commands: `init`, `start`, `prompt`, `status`, `list`, `mark`, `check`, and `export`. It supports seven workflow modes and 79 native stages. Greenfield has 13 stages and three starter profiles: `typescript-cli`, `nextjs-app`, and `android-compose`.

Current implementation includes exact workflow-instruction packets, supplemental implementation/test evidence, deterministic context readiness, a canonical `RunIntegrityGate`, judge-integrity enforcement, final-report eligibility, lifecycle-aware status/check/prompt/mark/export behavior, greenfield profile validation, scaffold-plan validation, generated-file evidence, verification-command evidence, and first-vertical-slice readiness.

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
`my-dev-kit`, `my-dev-kit-orchestrator`, and `my-dev-kit-lab`. That completed
documentation work does not change the current greenfield bootstrap behavior.

The next planned implementation task is `v1.3.1`, Standardized Greenfield
Documentation and Full-Stack Next.js Environment Hardening. It is not
implemented. The plan will extend the existing `nextjs-app` foundation with
structured `fullstack-web` plus `nextjs` intent, the first explicit
PostgreSQL/Prisma/Docker environment contract, and the standardized canonical
project-document baseline for newly bootstrapped projects. Current source still
has the three implemented starter profiles and the current project-doc and
scaffold behavior described above; it must not be treated as already providing
the planned contract. See the detailed [v1.3.1 roadmap
section](ROADMAP.md#v131---standardized-greenfield-documentation-and-full-stack-nextjs-environment-hardening).

`v1.4.0`, Greenfield-to-Feature Workflow Handoff Hardening, remains the later
milestone after `v1.3.1`. Its separate scope is not part of the patch plan.

Before implementation, the planner must inspect the current repository and
ecosystem evidence rather than treating roadmap prose as a prewritten execution
plan. Implementation-facing documents remain descriptions of `v1.3.0` behavior
until corresponding `v1.3.1` behavior is implemented and verified.

See [COMMANDS.md](COMMANDS.md) for syntax, [WORKFLOWS.md](WORKFLOWS.md) for operational sequences, and [CONTRACTS.md](CONTRACTS.md) for stable compatibility boundaries.
