# Contracts

This document maps stable cross-cutting contracts to their implementation and detailed documentation owners. It is not a duplicate artifact schema.

## Workflow and stage contract

Workflow mode and stage identity/order are owned by `src/workflows.ts`. The seven modes and 79 native stages are compatibility-sensitive. A stage defines its prompt, expected artifact, predecessor/gate relationships, and instruction identity. Operational stage order is documented in [WORKFLOWS.md](WORKFLOWS.md).

## Prompt and instruction-packet contract

The instruction catalog and exact resolution live under `src/instructions/`; prompt assembly lives in `src/promptGenerator.ts`. Every native stage receives a deterministic `WorkflowInstructionPacket` sidecar. The packet is schema-versioned and bounded. Specialized greenfield scaffold stages retain their renderer while still receiving catalog identity and sidecars.

## Artifact and lifecycle contract

Run paths, artifact formats, state transitions, deterministic checks, correction metadata, and export inclusion are owned by workflow definitions, `src/artifactLifecycle.ts`, check commands, and export code. File-level definitions remain canonical in [ARTIFACTS.md](ARTIFACTS.md).

## Supplemental repository-evidence contract

Supplemental implementation/test packets and retrieval reports mirror evidence produced outside the orchestrator. They carry repository/index provenance, freshness, adequacy, allocation, truncation, and critical test-responsibility evidence. The orchestrator does not perform retrieval or accept workflow/stage/run identity claims that the producer contract does not enforce.

## Context-readiness contract

Readiness owners under `src/instructions/` select one deterministic primary blocker, retain ordered blocking/supporting issue codes, and carry reason, corrective action, and evidence target through prompts, status, checks, verification, judge review, routing, and export. Optional truncation is non-blocking unless required-condition evidence is actually lost.

## RunIntegrityGate, judge integrity, and final-report eligibility

`src/runIntegrityGate.ts` is the canonical readiness-sensitive decision. `src/judgeIntegrity.ts` prevents an authored `PASS` from overriding a required `NEED_CONTEXT` state and evaluates final-report eligibility. A normal final report requires an accepted `PASS`, no active correction, and no remaining readiness blocker. Artifact presence or a manual lifecycle mark cannot substitute.

## Greenfield profile and scaffold contract

Profile types/registry/resolution live under `src/greenfield/profiles`. Bootstrap bundles, project-document content, scaffold targets, setup/validation commands, generated-file reports, and readiness are structured evidence. A profile is guidance and validation policy, not an executor. Detailed greenfield artifacts are in [ARTIFACTS.md](ARTIFACTS.md); command behavior is in [COMMANDS.md](COMMANDS.md).

## Standardized greenfield documents and full-stack capability (v1.3.1, implemented candidate, unpublished)

The canonical 15-file greenfield document baseline is owned by `src/greenfield/bootstrap/projectDocBootstrapTypes.ts` and applies to all three starter profiles; it is not a fourth taxonomy alongside them. The single supported full-stack combination -- `fullstack-web` + `nextjs` + the existing `nextjs-app` starter profile + PostgreSQL + Prisma + Docker -- is owned by `src/greenfield/fullstack/` and composes additively into the existing scaffold-plan (`buildScaffoldPlan.ts`) and canonical greenfield readiness (`src/greenfield/readiness/`) contracts rather than introducing a second one. Its environment scope, migration create-vs-deploy distinction, isolated test-database lifecycle, default-none seed policy, and non-production-only reset are part of the capability contract, not ad hoc. Final-report eligibility for every greenfield run now additionally requires canonical greenfield readiness (see "RunIntegrityGate, judge integrity, and final-report eligibility" above); this is not a separate gate. See [ARCHITECTURE.md](ARCHITECTURE.md#v131-implemented-candidate-unpublished-standardized-documents-and-full-stack-capability) for owners and [ROADMAP.md](ROADMAP.md) for status.

## Compatibility expectations

Schema versions, fixed paths, stage order, command families, issue codes, legacy-run treatment, and documented non-execution boundaries are compatibility-sensitive. Additive evolution must preserve old-run readability or emit explicit legacy/not-evaluated evidence. See [ARCHITECTURE.md](ARCHITECTURE.md) for owners and [DOCUMENTATION_PRESERVATION_POLICY.md](DOCUMENTATION_PRESERVATION_POLICY.md) for anti-drift rules.
