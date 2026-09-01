# Contracts

This document maps stable cross-cutting contracts to their implementation and detailed documentation owners. It is not a duplicate artifact schema.

## Workflow and stage contract

Workflow mode and stage identity/order are owned by `src/workflows.ts`. The seven modes and 79 native stages are compatibility-sensitive. A stage defines its prompt, expected artifact, predecessor/gate relationships, and instruction identity. Operational stage order is documented in [WORKFLOWS.md](WORKFLOWS.md).

## Prompt and instruction-packet contract

The instruction catalog and exact resolution live under `src/instructions/`; prompt assembly lives in `src/promptGenerator.ts`. Every native stage receives a deterministic `WorkflowInstructionPacket` sidecar. The packet is schema-versioned and bounded. Specialized greenfield scaffold stages retain their renderer while still receiving catalog identity and sidecars.

## Artifact and lifecycle contract

Run paths, artifact formats, state transitions, deterministic checks, correction metadata, and export inclusion are owned by workflow definitions, `src/artifactLifecycle.ts`, check commands, and export code. Shared checking does not imply identical syntax: text artifact kinds use section-header contracts, while registered structured JSON kinds require valid JSON and their actual structured fields. Both retain shared existence, predecessor, lifecycle, judge-integrity, and readiness behavior. File-level definitions remain canonical in [ARTIFACTS.md](ARTIFACTS.md).

## Supplemental repository-evidence contract

Supplemental implementation/test packets and retrieval reports mirror evidence produced outside the orchestrator. They carry repository/index provenance, freshness, adequacy, allocation, truncation, and critical test-responsibility evidence. The orchestrator does not perform retrieval or accept workflow/stage/run identity claims that the producer contract does not enforce.

## Context-readiness contract

Readiness owners under `src/instructions/` select one deterministic primary blocker, retain ordered blocking/supporting issue codes, and carry reason, corrective action, and evidence target through prompts, status, checks, verification, judge review, routing, and export. Optional truncation is non-blocking unless required-condition evidence is actually lost.

## RunIntegrityGate, judge integrity, and final-report eligibility

`src/runIntegrityGate.ts` is the canonical readiness-sensitive decision. `src/judgeIntegrity.ts` prevents an authored `PASS` from overriding a required `NEED_CONTEXT` state and evaluates final-report eligibility. A normal final report requires an accepted `PASS`, no active correction, and no remaining readiness blocker. Artifact presence or a manual lifecycle mark cannot substitute.

## Proof-only and bounded Observer-evidence contracts

`start --proof-only --verification-responsibility <path>` is an explicit, durable run capability rather than a workflow mode or stage. A proof-only run requires a non-empty safe relative responsibility path; the responsibility option without `--proof-only`, or an unsafe path, fails closed. Legacy runs without `proofOnly` remain ordinary. Final proof evidence must include a trimmed line exactly equal to `Proof result: PASS`; this does not bypass `RunIntegrityGate`, judge/correction state, or applicable context readiness.

`consumeBoundedObserverEvidence` is a pure public library boundary for already-loaded `my-frontend-observer/bounded-agent-context` schema `1.0.0` artifacts. It validates bounded producer, provenance, adequacy, loss, identity, and runtime/static-correlation truth without browser execution, persistence, static retrieval, or source/edit-authority inference. Structurally valid inadequate evidence remains distinct from malformed or unsupported evidence.

## Greenfield profile and scaffold contract

Profile types/registry/resolution live under `src/greenfield/profiles`. Bootstrap bundles, project-document content, scaffold targets, setup/validation commands, generated-file reports, and readiness are structured evidence. A profile is guidance and validation policy, not an executor. Detailed greenfield artifacts are in [ARTIFACTS.md](ARTIFACTS.md); command behavior is in [COMMANDS.md](COMMANDS.md).

## Standardized greenfield documents and full-stack capability (v1.3.1)

The canonical 15-file greenfield document baseline is owned by `src/greenfield/bootstrap/projectDocBootstrapTypes.ts` and applied to the then-current `typescript-cli`, `nextjs-app`, and `android-compose` profile set; it is not a fourth taxonomy alongside them. The single supported full-stack combination -- `fullstack-web` + `nextjs` + the existing `nextjs-app` starter profile + PostgreSQL + Prisma + Docker -- is owned by `src/greenfield/fullstack/` and composes additively into the existing scaffold-plan (`buildScaffoldPlan.ts`) and canonical greenfield readiness (`src/greenfield/readiness/`) contracts rather than introducing a second one. Its environment scope, migration create-vs-deploy distinction, isolated test-database lifecycle, default-none seed policy, and non-production-only reset are part of the capability contract, not ad hoc. Final-report eligibility for every greenfield run now additionally requires canonical greenfield readiness (see "RunIntegrityGate, judge integrity, and final-report eligibility" above); this is not a separate gate. See [ARCHITECTURE.md](ARCHITECTURE.md#v131-standardized-documents-and-full-stack-capability) for owners and [ROADMAP.md](ROADMAP.md) for status.

## Common project instructions and Python CLI profile (v1.3.3)

`src/greenfield/bootstrap/projectInstructions/` owns one normalized project-instruction model and deterministic render/validation contract for exactly `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md`. These are generated-project instructions, not native run artifacts and not members of `GREENFIELD_CANONICAL_DOCUMENTS`.

`src/greenfield/scaffold/effectiveTargetExpectations.ts` owns the common exact targets and `composeEffectiveGreenfieldTargetExpectations()`, whose stable order is common targets, selected-profile targets, then optional-capability targets. Scaffold planning, scaffold validation, generated-file evidence, filesystem corroboration, and canonical readiness consume that composition rather than rebuilding it.

`python-cli` uses the existing profile registry, resolver, command, terminology, target, scaffold, evidence, and readiness contracts. It owns four profile targets (`pyproject.toml`, `src/main.py`, `tests/test_main.py`, `README.md`); the common instruction targets are not duplicated in the profile. Runnable entry-point selection is owned by required exact `entry-point` target metadata, and Python terminology is permitted through the profile's closed terminology declaration. Python is not compatible with the Next.js full-stack capability. The orchestrator lists setup and validation commands as evidence contracts but does not execute them.

## Compatibility expectations

Schema versions, fixed paths, stage order, command families, issue codes, legacy-run treatment, and documented non-execution boundaries are compatibility-sensitive. Additive evolution must preserve old-run readability or emit explicit legacy/not-evaluated evidence. See [ARCHITECTURE.md](ARCHITECTURE.md) for owners and [DOCUMENTATION_PRESERVATION_POLICY.md](DOCUMENTATION_PRESERVATION_POLICY.md) for anti-drift rules.
