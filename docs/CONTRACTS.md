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

## Semantic Responsibility Contract foundation (v1.5.0 Batch 0)

Orchestrator owns the canonical semantic responsibility identity `RSP-NNN` (prefix `RSP`, `-`, three or more decimal digits; `RSP-001` and `RSP-0001` are valid, `RSP-01`, `RSP001`, `RESP-001`, and `rsp-001` are not). `RSP` is part of the canonical trace vocabulary in `src/traceModel.ts`; the trace parser and checker derive their patterns from it. Generic trace-correction suggestions for `RSP` use `test-strategy` only as the generic declaration owner; there is no mode-specific semantic routing.

Responsibilities are declared in the existing mode-specific test-strategy artifacts (the `TEST_STRATEGY_SOURCE_REQUIREMENTS` registry); there is no new artifact, stage, mode, or command. A canonical block requires `test responsibility ID` (an `RSP-*` value), `criticality` (`critical` or `noncritical`), `responsibility` (non-blank statement), `traces to`, `setup`, `action or trigger`, `expected result`, and `test level`. `traces to` is a comma-separated list of unique canonical trace IDs whose prefixes are limited to `REQ`, `CTX`, `BEH`, `INV`, `TRN`, and `PSE`; `RSP`, `TST`, `IMP`, `VER`, and `RISK` are rejected as origins.

`src/instructions/semanticResponsibility.ts` validates this structure with stable `SEMANTIC_RESPONSIBILITY_*` issue codes. It consumes the existing block parser and is pure and deterministic. It checks structure only: it does not verify that upstream IDs exist in a run, that requirements have responsibilities, or that implementation, test, or verification evidence exists. Those checks belong to later v1.5 batches.

Legacy responsibility IDs (any previously accepted safe ID) remain valid for the legacy parser and context-readiness path. Batch 0 does not change generated prompts, `RunIntegrityGate`, judge integrity, `status`, `check`, `export`, or final-report eligibility.

## Implementation evidence bridge foundation (v1.5.0 Batch 1)

The future carrier for semantic implementation mapping is the existing `ImplementationReport`; Batch 1 adds no artifact, stage, mode, or command, and does not change generated prompts or artifact-section requirements. A canonical implementation responsibility block is:

```text
implementation responsibility ID: RSP-001
production file: src/config/schema.ts
production symbol: symbol:src/config/validate.ts#validateConfig
```

A block runs to the next `implementation responsibility ID:` line or end of input. The ID must be a canonical `RSP-NNN` (the Batch 0 pattern). `production file:` and `production symbol:` may each repeat as list entries, and a block needs at least one of them. A file is a project-relative path: separators are normalized to `/`, case is preserved, and absolute, drive-letter, UNC, URL, NUL, `..`, empty, and `.` values are rejected. A symbol is `symbol:<project-relative-path>#<name>` with a non-empty path and name and exactly one `#`. Parsing is purely lexical and never reads the filesystem.

`src/instructions/implementationResponsibilityEvidence.ts` also evaluates the bridge from the strategy-side responsibilities, the declarations, and the projected implementation-role my-dev-kit evidence. The evaluator selects the producer mapping with exactly the same responsibility ID and matches declared files and symbols exactly, with no basename, suffix, substring, or case-insensitive matching. A file is matched by a producer `productionSymbols` item whose `path` or `id` equals it, and a symbol by an item whose `id` or `symbolId` equals it. Per-responsibility states are `corroborated`, `partially-corroborated`, `uncorroborated`, `missing-declaration`, and `producer-mapping-unavailable`. Orphan declarations, missing declarations, missing or truncated producer mappings, and unmatched references are reported with stable `IMPLEMENTATION_RESPONSIBILITY_*` codes. Criticality is carried but not enforced, and the producer's whole `mappingStatus` is kept for context only.

Corroboration means only that a declared repository identity appears exactly in the bounded my-dev-kit production evidence for that responsibility ID. In my-dev-kit 1.12.4 the production-symbol set is request-scoped and may be shared across mappings, so it neither proves that a file or symbol implements a responsibility nor proves that the file changed. The relation between a responsibility and its implementation remains the coding agent's declaration. `productionSymbols` is projected additively; producers that omit it remain valid (treated as empty), while a malformed present value is rejected as malformed raw evidence. Production implementation evidence applies only to modes whose native workflow has an `implementation` stage; `test` and `greenfield` do not. `RunIntegrityGate`, judge integrity, status, check, export, and final-report eligibility are not affected by Batch 1.

## Test and verification evidence bridge foundation (v1.5.0 Batch 2)

Batch 2 adds two independent, non-enforcing contracts. It adds no artifact, stage, mode, or command, does not change generated prompts or artifact-section requirements, and is not read by `RunIntegrityGate`, judge integrity, status, check, export, or final-report eligibility. Proof-only and greenfield remain outside both contracts.

### Test implementation contract

The future carrier is the existing `TestImplementationReport`. A block is:

```text
test implementation responsibility ID: RSP-001
test file: tests/config/validate.spec.ts
```

A block runs to the next `test implementation responsibility ID:` line or end of input. Repeated `test file:` lines are list entries, and a block needs at least one. Test files use exactly the same project-relative lexical path policy as production files (`src/instructions/responsibilityEvidenceShared.ts`). A duplicate `RSP` block is reported and the first stays authoritative.

`src/instructions/testImplementationResponsibilityEvidence.ts` corroborates declared files against the same-ID producer mapping's `proposedOrExistingTestFiles`, projected additively from my-dev-kit. The match is exact on item `path` or `id`; there is no basename, suffix, substring, or case-insensitive matching, and `itemKind` is not required. The contract is file-level only, because my-dev-kit 1.12.4 related-test discovery emits file-level `test-file` items and there is no test-symbol contract. States and issue semantics mirror the implementation bridge (`corroborated`, `partially-corroborated`, `uncorroborated`, `missing-declaration`, `producer-mapping-unavailable`, with `TEST_IMPLEMENTATION_RESPONSIBILITY_*` codes). Corroboration means only that the declared test-file identity appears exactly in bounded my-dev-kit test evidence for that mapping. It does not prove that the test implements the responsibility, that its assertions are correct, that it ran, or that it passed. Legacy producer evidence without `proposedOrExistingTestFiles` remains valid and is treated as empty; a malformed present value is rejected as malformed raw evidence. Applicability is derived from workflow definitions: every native mode with a `test-implementation` stage (feature, repair, test, refactor, harden, extraction) qualifies.

### Verification contract

The future carrier is the existing `VerificationReport`. A block is:

```text
verification responsibility ID: RSP-001
verification status: pass

verification evidence:
command: npm test -- tests/config/validate.spec.ts
working directory: .
exit code: 0
```

Status is exactly `pass`, `fail`, `skipped`, or `blocked`. `pass` and `fail` require at least one `verification evidence:` record, and `skipped` and `blocked` require a non-empty `reason:`. Each record needs a non-empty command, a non-empty working directory (kept verbatim, including absolute paths, since it records where the command ran), and a signed decimal integer exit code. Status is never inferred from exit codes; `pass` with only nonzero exit codes, or `fail` with only zero exit codes, is reported as the diagnostic `VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT` and the declared status is kept. Declarations attribute to canonical strategy responsibilities by exact `RSP` identity (`passed`, `failed`, `skipped`, `blocked`, `missing-declaration`), with `VERIFICATION_RESPONSIBILITY_ORPHAN` and `VERIFICATION_RESPONSIBILITY_DECLARATION_MISSING` issues. Command text is never interpreted as coverage of any test file or production symbol.

Command results are coding-agent-reported evidence. The parser validates structure and attribution only; it never executes a command and cannot prove one ran. External executable-evidence integration is later scope.

## Compatibility expectations

Schema versions, fixed paths, stage order, command families, issue codes, legacy-run treatment, and documented non-execution boundaries are compatibility-sensitive. Additive evolution must preserve old-run readability or emit explicit legacy/not-evaluated evidence. See [ARCHITECTURE.md](ARCHITECTURE.md) for owners and [DOCUMENTATION_PRESERVATION_POLICY.md](DOCUMENTATION_PRESERVATION_POLICY.md) for anti-drift rules.
