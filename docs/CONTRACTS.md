# Contracts

This document maps stable cross-cutting contracts to their implementation and detailed documentation owners. It is not a duplicate artifact schema.

## Workflow and stage contract

Workflow mode and stage identity/order are owned by `src/workflows.ts`. The seven modes and 79 native stages are compatibility-sensitive. A stage defines its prompt, expected artifact, predecessor/gate relationships, and instruction identity. Operational stage order is documented in [WORKFLOWS.md](WORKFLOWS.md).

## Prompt and instruction-packet contract

The instruction catalog and exact resolution live under `src/instructions/`; prompt assembly lives in `src/promptGenerator.ts`. Every native stage receives a deterministic `WorkflowInstructionPacket` sidecar. The packet is schema-versioned and bounded. Specialized greenfield scaffold stages retain their renderer while still receiving catalog identity and sidecars.

## Artifact and lifecycle contract

The v1.7.0 storage/import contract is explicit and optional.
`createRun` gains only the input `ecosystemRequirementsDocument?:
RunEcosystemRequirementsDocumentV1`; caller-supplied ECO version/digest fields
are rejected. The input is validated at runtime before creating a run folder.
`RunMetadata` gains only derived `ecosystemEvidenceVersion?: '1.0.0'` and
`ecosystemRequirementsSha256?: string` (64 lowercase hex characters).
No document or input path is persisted in metadata. Both fields absent means
legacy; either field alone, an unsupported version, or invalid digest fails closed.

The contracts owner `src/ecosystemEvidenceContracts.ts` validates the exact six
Kit v1.12.5 ECO-00 1.0.0 shapes, including nested closed objects, unique arrays,
digest formats and date-time forms. Native schema versions and locator text are
preserved. A run requirements document has `schemaVersion`, `subject`, optional
`environment`, and a nonempty `requirements` array with unique `requirementId`.
A run evidence document has `schemaVersion`, an `evidence` array (possibly empty)
with unique `evidenceId`, and optional `compatibilityBundles` with unique bundle
IDs. Both run documents reject unknown keys. Invalid shapes use
`ECO_RECORD_INVALID`; unsupported ECO versions use `ECO_SCHEMA_UNSUPPORTED`.
Validation issues are deterministic and expose no untrusted keys or values.

`src/ecosystemEvidenceStore.ts` owns immutable canonical UTF-8 requirements and
their saved-byte SHA-256, plus atomic complete evidence replacement through
`replaceRunEcosystemEvidence(runFolder, document)`. The exact sidecar paths are
in [ARTIFACTS.md](ARTIFACTS.md). Replacement verifies activation and immutable
requirements before writing, rejects unsafe paths and duplicate/malformed input,
and performs no native artifact resolution. Syntactic validity establishes no
testing, certification, compatibility, or requirement satisfaction.

Run paths, artifact formats, state transitions, deterministic checks, correction metadata, and export inclusion are owned by workflow definitions, `src/artifactLifecycle.ts`, check commands, and export code. Shared checking does not imply identical syntax: text artifact kinds use section-header contracts, while registered structured JSON kinds require valid JSON and their actual structured fields. Both retain shared existence, predecessor, lifecycle, judge-integrity, and readiness behavior. File-level definitions remain canonical in [ARTIFACTS.md](ARTIFACTS.md).

The trace contract at HEAD includes the v1.6.2 corrections.
Canonical IDs remain case-sensitive `PREFIX-NNN` with at least three decimal
digits, using `REQ`, `CTX`, `BEH`, `INV`, `TRN`, `PSE`, `TST`, `RSP`, `IMP`,
`VER`, and `RISK`. `isMalformedTraceId` classifies recognized-prefix near
misses only; the parser diagnoses unknown two-to-six-letter uppercase prefixes
with three or more digits in explicit declaration labels or link endpoints
whose opposite endpoint is canonical. `ECO-00`, `UTF-8`, unknown-prefix prose,
and links between two unknown prefixes are outside that malformed-ID contract.

`checkArtifactTrace` and `checkDesignMapTrace` retain file-local target scope.
`checkAllTraces`, used by `check --trace` and `check --all`, accepts actual
declarations from the same artifact, same-stage primary/additional artifacts,
and earlier native stages in `RunMetadata` order. Future-stage declarations,
prose references, and link endpoints cannot satisfy targets. Duplicate and
orphan warnings stay file-local; semantic identity reuse is not adjudicated.
`TRACE_MALFORMED_ID` and `TRACE_MISSING_LINK_TARGET` remain failures;
`TRACE_DUPLICATE_ID` and `TRACE_ORPHAN_ID` remain warnings, fatal only under
`--strict`. Missing-target messages describe the evaluated scope. Result and
issue fields and `trace-check-results.json` version `"1"` are unchanged.
Run-stage-validated trace suggestions are advisory, with artifact guidance for
an optional design map; they are separate from accepted judge routing.

## Supplemental repository-evidence contract

Supplemental implementation/test packets and retrieval reports mirror evidence produced outside the orchestrator. They carry repository/index provenance, freshness, adequacy, allocation, truncation, and critical test-responsibility evidence. The orchestrator does not perform retrieval or accept workflow/stage/run identity claims that the producer contract does not enforce.

## Context-readiness contract

Readiness owners under `src/instructions/` select one deterministic primary blocker, retain ordered blocking/supporting issue codes, and carry reason, corrective action, and evidence target through prompts, status, checks, verification, judge review, routing, and export. Optional truncation is non-blocking unless required-condition evidence is actually lost.

Test-context readiness is phase-aware without changing any schema major. Outside `test-implementation` entry, every critical test responsibility must be fully mapped by the raw producer evidence. Entry to `test-implementation` is the single exception: while the stage is being entered and its `TestImplementationReport` does not exist, a critical responsibility that is `partially-mapped` only for the test-side producer reasons `no related test` and `no oracle evidence`, with no related test file and with grounded production symbols, contract/validator/constant/error evidence, and a discovered test-runner command, is accepted as ready-with-assumptions carrying the warning `CONTEXT_TEST_EVIDENCE_PENDING_PRETEST` (entry allowed; completion not yet eligible). A missing test command, any production-side gap, an unmapped or absent mapping, and every other readiness blocker still block entry, and a responsibility mixing test-side and production-side gaps stays blocked. The raw producer `mappingStatus` is never rewritten, and the warning is additive: no artifact family, persisted state, or schema version is added. The existing `TestImplementationReport` remains the native carrier, and its existence restores the strict contract for completion, `mark`, `verification`, `judge`, and `final-report`. The supplemental context files stay supplemental evidence. Semantic Continuity and `RunIntegrityGate` ownership are unchanged, and compatible legacy runs receive the behavior without `semanticContinuityVersion`.

## RunIntegrityGate, judge integrity, and final-report eligibility

Activated ECO runs evaluate the latest validated sidecars and native evidence
through one deterministic result at schema `1.0.0`: `required`, `ready`,
`classification`, sorted `requirements` (ID, capability, criticality, state,
matching evidence IDs and issue codes), `blockingCodes`, `warningCodes`, optional
primary code/reason and `recommendedCorrectionStage`. Classifications are
`not-required`, `ready`, `warning`, and `blocked`; warnings alone remain ready.
Global record/digest defects always block. Exact native package/version/kind/schema,
subject, freshness and adequacy are required; compatibility bundle status assertions
confer no certification. Kit's only positive capability is
`my-dev-kit/static-context`, through `my-dev-kit/context-capsule` or
`my-dev-kit/retrieval-audit` from package `@dailephd/my-dev-kit@1.12.5`.
Observer's only positive capability is `my-frontend-observer/frontend-change-review`,
through `my-frontend-observer/bounded-agent-context` from
`@dailephd/my-frontend-observer@0.10.0`. Native schemas are exactly `1.0.0`.
Kit binds `@dailephd/my-dev-kit` / `my-dev-kit/static` to native `index.projectRoot`
and the run project. Observer binds `@dailephd/my-frontend-observer` /
`my-frontend-observer/runtime` to native `contextId`, with native request identity.
Neither proves repository commits, declared execution environments or test success.
These producer subject bindings cannot share a universal project subject. URI/opaque references,
unsupported tuples and optional Observer fidelity projections remain unverified.
Local native files are bounded to 4 MiB under the existing run/project roots, with
traversal/link rejection and optional saved-byte SHA-256 verification.

The producer versions above are exact compatibility pins, not minimum versions.
Orchestrator `1.7.0` rejects newer producer versions, including Kit `1.13.0` and
Observer `0.10.1`, for this ECO intake path. Generate evidence with the supported
producer version or keep newer native outputs in their separately documented
manual review workflow. Do not relabel an artifact's producer version to make it
appear compatible. The older supplemental repository-context and pure
`consumeBoundedObserverEvidence` interfaces retain their own contracts; these
ECO pins do not redefine them.

Each activated run has one requirements subject. That subject must match both
the envelope and the native artifact exactly. A Kit static project subject and
an Observer runtime context subject therefore cannot be combined into one
satisfied run by assigning them a common project label. Their complementary
evidence can be reviewed separately without inventing cross-producer identity.
If the optional requirements `environment` is present, the current adapters
report `ECO_EVIDENCE_ENVIRONMENT_MISMATCH` even when envelope fields agree,
because neither producer attests native execution environments. A context-only
run may omit that optional field; a workflow that requires environment
attestation needs external assurance rather than a weaker claim.

An unsuitable evidence item for a required capability can keep its requirement
unmet even when another item qualifies. Refresh native files and replace the
complete current evidence snapshot through `replaceRunEcosystemEvidence`,
rather than append stale references. Optional ECO responsibility binding also
requires the Orchestrator authority/namespace and exactly `RSP-` plus three
digits, corroborated by the native adapter. This narrower ECO binding does not
change the native Semantic Continuity contract's acceptance of longer IDs.

Prior context/semantic blockers retain primary precedence. The gate combines all
three readiness facts and alone derives `PASS` versus `NEED_CONTEXT`. ECO-unready
runs block judge/final-report completion; earlier stages may generate evidence.
Without either terminal stage, the last existing stage is blocked. External
refresh instructions have no new correction stage or sidecar lifecycle. An
authored PASS cannot override ECO blockers; ECO-ready alone cannot grant final
eligibility. Unactivated behavior and existing check-results JSON are unchanged.

`src/runIntegrityGate.ts` is the canonical run-integrity decision. It combines repository-context readiness with Semantic Continuity (see "Semantic Continuity activation and enforcement" below) and reports one expected judge verdict. `src/judgeIntegrity.ts` prevents an authored `PASS` from overriding a required `NEED_CONTEXT` state and evaluates final-report eligibility. A normal final report requires an accepted `PASS`, no active correction, and no remaining readiness or semantic blocker. Artifact presence or a manual lifecycle mark cannot substitute.

### RunEvidenceInspectionV1

The pure inspection owner is
`src/ecosystemEvidenceInspection.ts`. Successful status/check JSON objects
have exactly schemaVersion: '1.0.0', run, ecosystem, integrity, judge, and
optional checks (check only). Fields are:

- run: runId, mode, currentStage, status (existing current run strings).
- ecosystem: required (boolean), classification (not-required, ready, warning,
  blocked), requirements, blockers and warnings (ordered code arrays).
- requirements rows: requirementId, capabilityId, criticality (critical or
  noncritical), state (satisfied, unmet-critical, unmet-noncritical),
  matchingEvidenceIds and issueCodes. Rows sort by exact requirementId;
  matching IDs sort lexicographically. Evaluator code precedence is retained.
- integrity: ready (canonical runIntegrityReady), expectedJudgeVerdict (PASS or
  NEED_CONTEXT), blockingCodes (deduplicated context, semantic, ECO precedence).
- judge: accepted (canonical judgeVerdictAccepted), finalReportEligible
  (canonical final eligibility), both booleans.
- checks: selection (default, single-artifact, artifacts, all, prompts, trace,
  design-map), outcome (passed, warning, failed, not-run), issueCounts with
  fail/warn numbers or null, strict (boolean), exitCode (0 or 1). Counts and
  selector semantics are detailed in [COMMANDS.md](COMMANDS.md#json-inspection).

Unactivated ecosystem is required=false, classification=not-required and empty
arrays regardless of stray files. Global activated defects remain blocked
without invented requirement rows. Positive ECO state cannot accept a missing
or rejected judge verdict or independently authorize a final report.

Error objects have exactly schemaVersion: '1.0.0' and error: { code }, where
code is INSPECTION_NO_RUNS_FOUND, INSPECTION_RUN_NOT_FOUND,
INSPECTION_RUN_UNREADABLE, INSPECTION_CHECK_INVALID_SELECTION or
INSPECTION_FAILED. No error message, stack or path is serialized. Both success
and error emit one two-space formatted JSON object plus LF to stdout. No
request, timestamp, root, raw evidence, producer payload, certification claim,
extra metadata or unbounded diagnostics are included.

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

## Semantic responsibility contract

The Orchestrator owns the canonical semantic responsibility identity `RSP-NNN`: the prefix `RSP`, a hyphen, and three or more decimal digits. `RSP-001` and `RSP-0001` are valid; `RSP-01`, `RSP001`, `RESP-001`, and `rsp-001` are not. `RSP` is part of the canonical trace vocabulary in `src/traceModel.ts`, and the trace parser and checker derive their patterns from it. The context-free missing-target hint for `RSP` is `test-strategy`; CLI trace suggestions validate hints against the actual run and also identify the reporting artifact's native owner.

Responsibilities are declared in the existing mode-specific test-strategy artifacts, whose paths come from the `TEST_STRATEGY_SOURCE_REQUIREMENTS` registry. There is no separate artifact, stage, mode, or command. A canonical block requires `test responsibility ID` (an `RSP-*` value), `criticality` (`critical` or `noncritical`), `responsibility` (a non-blank statement), `traces to`, `setup`, `action or trigger`, `expected result`, and `test level`. `traces to` is a comma-separated list of unique canonical trace IDs whose prefixes are limited to `REQ`, `CTX`, `BEH`, `INV`, `TRN`, and `PSE`; `RSP`, `TST`, `IMP`, `VER`, and `RISK` are rejected as origins. The declared upstream IDs must exist in artifacts of stages before the strategy stage (see the evaluator below).

A trace declaration is a line that begins with `ID: text`, and it remains a declaration when its text contains `->` (for example `TRN-001: invalid-input -> validation-error`). A link line such as `REQ-001 -> BEH-999` never begins with that label and declares nothing. Declaration matching is exact and case-sensitive.

`src/instructions/semanticResponsibility.ts` validates this structure with stable `SEMANTIC_RESPONSIBILITY_*` issue codes. It consumes the existing block parser and is pure and deterministic. Legacy responsibility IDs (any previously accepted safe ID) remain valid for the legacy parser and context-readiness path; only the explicit canonical validator requires `RSP-*`. Malformed and duplicate canonical IDs fail deterministically, and the first declaration of a duplicated ID stays authoritative.

## Implementation evidence bridge

The carrier for semantic implementation mapping is the existing `ImplementationReport`; no artifact, stage, mode, or command is added. A canonical implementation responsibility block is:

```text
implementation responsibility ID: RSP-001
production file: src/config/schema.ts
production symbol: symbol:src/config/validate.ts#validateConfig
```

A block runs to the next `implementation responsibility ID:` line or end of input. The ID must be a canonical `RSP-NNN`. `production file:` and `production symbol:` may each repeat as list entries, and a block needs at least one of them. A file is a project-relative path: separators are normalized to `/`, case is preserved, and absolute, drive-letter, UNC, URL, NUL, `..`, empty, and `.` values are rejected. A symbol is `symbol:<project-relative-path>#<name>` with a non-empty path and name and exactly one `#`. Parsing is purely lexical and never reads the filesystem.

`src/instructions/implementationResponsibilityEvidence.ts` also evaluates the bridge from the strategy-side responsibilities, the declarations, and the projected implementation-role my-dev-kit evidence. The evaluator selects the producer mapping with exactly the same responsibility ID and matches declared files and symbols exactly, with no basename, suffix, substring, or case-insensitive matching. A file is matched by a producer `productionSymbols` item whose `path` or `id` equals it, and a symbol by an item whose `id` or `symbolId` equals it. Per-responsibility states are `corroborated`, `partially-corroborated`, `uncorroborated`, `missing-declaration`, and `producer-mapping-unavailable`. Orphan declarations, missing declarations, missing or truncated producer mappings (kept distinct), and unmatched references are reported with stable `IMPLEMENTATION_RESPONSIBILITY_*` codes. The producer's whole `mappingStatus` is kept for context only.

Corroboration means only that a declared repository identity appears exactly in the bounded my-dev-kit production evidence for that responsibility ID. In my-dev-kit 1.12.4 the production-symbol set is request-scoped and may be shared across mappings, so it neither proves that a file or symbol implements a responsibility nor proves that the file changed; a declared file may be an existing owner of the behavior. The relation between a responsibility and its implementation remains the coding agent's declaration. `productionSymbols` is projected additively: producers that omit it (older schema-major-1 evidence) remain valid and are treated as empty, while a malformed present value is rejected as malformed raw evidence. Production implementation evidence applies only to modes whose native workflow has an `implementation` stage; `test` and `greenfield` do not.

## Test and verification evidence bridges

### Test implementation contract

The carrier is the existing `TestImplementationReport`. A block is:

```text
test implementation responsibility ID: RSP-001
test file: tests/config/validate.spec.ts
```

A block runs to the next `test implementation responsibility ID:` line or end of input. Repeated `test file:` lines are list entries, and a block needs at least one. Test files use exactly the same project-relative lexical path policy as production files (`src/instructions/responsibilityEvidenceShared.ts`). A duplicate `RSP` block is reported and the first stays authoritative.

`src/instructions/testImplementationResponsibilityEvidence.ts` corroborates declared files against the same-ID producer mapping's `proposedOrExistingTestFiles`, projected additively from my-dev-kit. The match is exact on item `path` or `id`; there is no basename, suffix, substring, or case-insensitive matching, and `itemKind` is not required. The contract is file-level only, because my-dev-kit 1.12.4 related-test discovery emits file-level `test-file` items and there is no test-symbol contract. States and issue semantics mirror the implementation bridge (`corroborated`, `partially-corroborated`, `uncorroborated`, `missing-declaration`, `producer-mapping-unavailable`, with `TEST_IMPLEMENTATION_RESPONSIBILITY_*` codes). Corroboration means only that the declared test-file identity appears exactly in bounded my-dev-kit test evidence for that mapping. It does not prove that the test implements the responsibility, that its assertions are correct, that it ran, or that it passed. Legacy producer evidence without `proposedOrExistingTestFiles` remains valid and is treated as empty; a malformed present value is rejected as malformed raw evidence. Applicability is derived from workflow definitions: every native mode with a `test-implementation` stage (feature, repair, test, refactor, harden, extraction) qualifies.

### Verification contract

The carrier is the existing `VerificationReport`. A block is:

```text
verification responsibility ID: RSP-001
verification status: pass

verification evidence:
command: npm test -- tests/config/validate.spec.ts
working directory: .
exit code: 0
```

Status is exactly `pass`, `fail`, `skipped`, or `blocked`. `pass` and `fail` require at least one `verification evidence:` record, and `skipped` and `blocked` require a non-empty `reason:`. Each record needs a non-empty command, a non-empty working directory (kept verbatim, including absolute paths, since it records where the command ran), and a signed decimal integer exit code. Status is never inferred from exit codes; `pass` with only nonzero exit codes, or `fail` with only zero exit codes, is reported as the diagnostic `VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT` and the declared status is kept. Declarations attribute to canonical strategy responsibilities by exact `RSP` identity (`passed`, `failed`, `skipped`, `blocked`, `missing-declaration`), with `VERIFICATION_RESPONSIBILITY_ORPHAN` and `VERIFICATION_RESPONSIBILITY_DECLARATION_MISSING` issues. Command text is never interpreted as coverage of any test file or production symbol.

Command results are coding-agent-reported evidence. The parser validates structure and attribution only; it never executes a command and cannot prove one ran. Integration with external executable evidence is not part of the current contract.

## Semantic Continuity evaluator

`src/instructions/semanticContinuity.ts` is the one canonical Semantic Continuity evaluator. It composes the parsed strategy responsibilities, the implementation, test-implementation, and verification validations and bridges, and a caller-supplied set of declared upstream trace IDs. It is pure and derived: it reads no files, runs no commands, persists nothing, and uses no scoring, probability, or model inference.

Continuity applies to the six native workflows that have a strategy owner in `TEST_STRATEGY_SOURCE_REQUIREMENTS` (feature, repair, test, refactor, harden, extraction). It is `not-applicable` to greenfield and proof-only runs.

Evaluation is phase-aware. A leg is active only when the current stage is strictly after the stage that owns its output, so a stage's own output is never required while entering it. Strategy ownership comes from the registry, and the implementation, test-implementation, and verification owner stages come from the workflow definition. The `test` workflow has no production `implementation` stage, so its implementation leg is `not-applicable`. Inactive legs are `pending` and their structural issues and orphans are ignored, so a run corrected back to an earlier stage is not blocked by stale downstream mappings. An unknown current stage yields `SEMANTIC_CONTINUITY_STAGE_UNKNOWN` and state `invalid`.

Each declared upstream trace of a responsibility must exist, by exact case-sensitive match, in the supplied declared-trace set; a missing trace invalidates that responsibility. Leg states are `pending`, `not-applicable`, `satisfied`, `partial`, `unsatisfied`, `missing`, `indeterminate`, `failed`, `skipped`, `blocked`, and `invalid`. Corroboration states map `corroborated`/`partially-corroborated`/`uncorroborated`/`missing-declaration`/`producer-mapping-unavailable` to `satisfied`/`partial`/`unsatisfied`/`missing`/`indeterminate`, and verification `passed`/`failed`/`skipped`/`blocked`/`missing-declaration` to `satisfied`/`failed`/`skipped`/`blocked`/`missing`. Malformed evidence on an active leg (a structural issue) makes that leg `invalid`, which is distinct from absent evidence (`missing`). Orphan declarations on an active leg make the overall state `invalid`. `VERIFICATION_RESPONSIBILITY_STATUS_EVIDENCE_INCONSISTENT` stays a diagnostic and never invalidates continuity.

Per-responsibility state is phase-relative (complete through the currently active legs), with precedence `invalid` > `failed` > `blocked` > `incomplete` > `indeterminate` > `complete`. Overall states are `not-applicable`, `pending`, `invalid`, `failed`, `blocked`, `incomplete`, `indeterminate`, and `complete`; an active strategy with zero canonical responsibilities is `incomplete` and is never `complete`. The evaluator carries and summarizes criticality (critical/noncritical counts and complete/unsatisfied ID lists) but does not let it change a semantic state; enforcement policy belongs to `RunIntegrityGate`. Evaluator issues use `SEMANTIC_CONTINUITY_*` codes and keep the exact underlying bridge code in `sourceIssueCode`. Bridge-level codes for missing declarations, uncorroborated references, and missing or truncated producer mappings stay on the bridge results; the gate and command surfaces expose the resulting leg states.

## Semantic Continuity activation and enforcement

Semantic Continuity is enforced through the existing canonical `RunIntegrityGate` as one more input alongside repository-context readiness. There is no parallel semantic gate: `JudgeIntegrity`, artifact lifecycle, stage detection, `mark`, and final-report eligibility consume the same gate result and do not read continuity themselves. The gate schema version is `1.1.0` (the semantic fields are additive).

Activation is explicit and versioned. Run metadata (`run.json`) may carry `semanticContinuityVersion`. The one supported value is `1.0.0` (`SEMANTIC_CONTINUITY_CONTRACT_VERSION`, owned by `src/instructions/runSemanticContinuity.ts`). The `start` command persists it automatically for new staged runs in `feature`, `repair`, `test`, `refactor`, `harden`, and `extraction`, derived from `TEST_STRATEGY_SOURCE_REQUIREMENTS` rather than a second mode list. Greenfield and `--proof-only` runs are not activated, and no CLI flag exists. `createRun()` persists a version only when the caller supplies one, so absent-version legacy runs remain creatable. When the field is absent the run is legacy: semantic continuity is `not-required` and every behavior is unchanged, even if artifacts happen to contain RSP-looking text; activation is never inferred from artifact contents. A present value other than `1.0.0` fails closed with the blocking code `SEMANTIC_CONTINUITY_CONTRACT_VERSION_UNSUPPORTED` and no guessed correction stage. `DIRECT_IMPLEMENTATION` and `FULL_STAGE_CONTEXT` are planner policies, not modes: the staged workflow is the full-stage-context surface, and a direct implementation that bypasses it stays outside Semantic Continuity.

`src/instructions/runSemanticContinuity.ts` is the only I/O adapter. It reads the mode-owned strategy artifact from `TEST_STRATEGY_SOURCE_REQUIREMENTS`, the implementation, test-implementation and verification reports located through the workflow definition, and trace declarations (through `parseDeclaredTraceIds()`) from artifacts of stages before the strategy stage. It reuses the readiness results from the same gate invocation and `readRawContextCapsule()` for my-dev-kit evidence, so context readiness is evaluated once. It hands everything to `evaluateSemanticContinuity()` and re-models nothing. If a context is refresh-required, no producer evidence is fabricated, and the existing context blocker stays the primary diagnosis.

The gate adds `semanticContinuityClassification` (`not-required`, `ready`, `warning`, `blocked`). Current `runIntegrityReady` requires `contextReady`, `semanticContinuityReady`, and `ecosystemEvidenceReady`; unactivated ECO evidence is not required and contributes readiness. The expected judge verdict is `PASS` only when `runIntegrityReady` is true, otherwise `NEED_CONTEXT`. `pending` continuity counts as ready. A non-complete critical responsibility blocks (`SEMANTIC_CONTINUITY_CRITICAL_RESPONSIBILITY_UNSATISFIED`), an unclassified one blocks (`SEMANTIC_CONTINUITY_UNCLASSIFIED_RESPONSIBILITY`), and a non-complete noncritical responsibility only warns (`SEMANTIC_CONTINUITY_NONCRITICAL_RESPONSIBILITY_UNSATISFIED`), including noncritical attributable invalidity. Defects that cannot be attributed to a canonical responsibility (unknown stage, empty active strategy, orphan declarations, unattributable structural invalidity) block as `SEMANTIC_CONTINUITY_GLOBAL_INTEGRITY_INVALID`, with the underlying source issue code preserved. Diagnostics such as the verification status/exit-code inconsistency remain warnings. Proof-only and greenfield stay `not-required` even when a version is present, and test mode requires no production implementation continuity.

A repository-context blocker keeps primary precedence for `primaryBlockingCode`, `primaryBlockingReason`, and `recommendedCorrectionStage`; semantic blockers stay visible in the semantic fields. The semantic correction stage comes from the earliest correction-owner stage in workflow order, then canonical strategy declaration order (the strategy leg maps to the mode-owned strategy stage), and is `null` for an unknown stage or unsupported version. Judge routing accepts only stages the correction router treats as correctable for the run's mode: `regression-test-strategy`, `compatibility-test-strategy`, and `resilience-test-strategy` are correctable only for `repair`, `refactor`, and `harden` respectively, while `test-strategy` and `target-architecture` behave as before and route-table defaults are unchanged.

A blocking semantic defect blocks the current phase stage (not the correction target): its live prompt cannot render normal work, its artifact resolves `blocked` even when the file exists or is manually marked complete, `mark ... --state complete` is rejected before any state mutation, and progression stops there. A warning alone blocks nothing. Commands evaluate the gate at the lifecycle phase (the phase reconciliation uses), not at a correction cursor, because semantic legs are not monotone in the cursor. An authored `PASS` against a critical semantic blocker is rejected through the existing judge contradiction mechanism (`JUDGE_VERDICT_CONTRADICTS_RUN_INTEGRITY`, worded in terms of canonical run integrity) and the run is not final-report eligible. When the gate expects `NEED_CONTEXT` and the authored verdict is `NEED_CONTEXT`, the gate's recommendation is authoritative, including `null` (no fallback to the generic table default); an authored `NEED_CONTEXT` while the gate expects `PASS` keeps ordinary authored routing. Semantic state is recomputed from current artifacts: no semantic file or timestamp is persisted.

## Semantic Continuity prompt and command surface

`src/instructions/semanticContinuityPrompt.ts` is the single owner of the activated-run authoring guidance: upstream trace declarations and ID stability, strategy `RSP` blocks and criticality meaning, implementation and test-implementation mappings with post-change and post-test evidence refresh, verification attribution, and the judge policy. It also owns the my-dev-kit request guidance that carries the canonical `RSP` IDs as `testResponsibilityRefs` and merges `responsibility-mappings` into the existing role-specific evidence kinds without replacing them. The guidance applies only when the version is `1.0.0`, the mode is activated, and the run is not proof-only; legacy, greenfield, and proof-only prompts are unchanged. `src/promptGenerator.ts` integrates it: saved prompt templates include the authoring guidance but never live gate state, while `generateLiveStagePrompt()` (used by `prompt`) honors the current `RunIntegrityGate`. The guidance teaches contracts the evaluator already validates and adds no validation.

A stage the gate blocks on Semantic Continuity renders bounded correction guidance for `semanticRecommendedCorrectionStage` (inputs, output artifact, and artifact kind come from the existing correction stage tables, with unaffected `RSP` IDs preserved), never the blocked stage's own work. A null correction stage renders an external-resolution notice and guesses no stage. A refresh-required repository context for a context-sensitive correction target still takes precedence. The final-report stage keeps its eligibility-blocked prompt.

`src/semanticContinuitySurface.ts` projects the already-computed `RunIntegrityGateResult` for `status`, `check`, `export`, and the live judge prompt, so no surface evaluates continuity separately and all agree on classification, blocking and warning IDs, primary blocker, correction stage, and expected verdict. `artifactChecker` does not parse responsibilities.

## Native run telemetry contract

`src/runTelemetry.ts` owns an Orchestrator-native observational contract; it is not the ECO-00 `EvidenceEnvelopeV1` or any ecosystem evidence schema (generic ecosystem evidence intake belongs to `v1.7.0`, `ORC-EVIDENCE-01`). This is `v1.6.0` release behavior.

- **Activation.** `run.json#runTelemetryVersion` is optional and explicit. `"1.0.0"` activates telemetry; absence means a legacy run (nothing is read, shown, or warned about); any other value is unsupported and is never downgraded to `1.0.0`. Activation is never inferred from files. New CLI-created runs write `"1.0.0"`; programmatic `createRun()` callers that omit it stay legacy.
- **Identity.** `runId` is unchanged and opaque. Each recorded interaction has a fresh `invocationId` of the form `inv-` plus 32 lowercase hex characters (128 random bits) that depends on no timestamp, path, run ID, or responsibility ID. There is no second logical run identity and no CLI option for invocation IDs.
- **Record.** Kind `my-dev-kit-orchestrator/run-telemetry-invocation`, schema `1.0.0`, with `producer`, `runId`, `invocationId`, `command` (`start`, `prompt`, or `mark`), `state`, UTC `startedAt`, and, when completed, `completedAt`, monotonic `durationMs`, and `observations`. Unknown properties are rejected.
- **Lifecycle.** `state` describes record completeness only: `pending` (no terminal outcome was captured; no success or failure may be inferred) or `completed`. A completed record is immutable and carries `outcome` `succeeded` or `failed`. Handled failures after a pending record exists are finalized as `failed` before the command's own exit behavior; an interruption or unhandled exception can leave a pending record.
- **Observations.** Only typed, bounded fields: `outcome`, `mode`, `currentStage`, `stageIndex`, `stageCount`, `runStatus`, `selectedStage`, `promptKind` (`stage` or `correction`), `promptCharacterCount`, `mark` (`artifact`, `requestedState`, `resultingState`, `reasonProvided`), and `integrity`, `judge`, and `semanticContinuity` snapshots that copy values the recording command already computed. Each snapshot domain has `availability` `observed`, `not-applicable`, or `unavailable`; absence never means PASS. `promptCharacterCount` is the emitted prompt's length in characters, never tokens. The `mark` reason text, prompt bodies, source content, environment values, command output, and error text are never stored.
- **Timing.** Timestamps are UTC observations. Duration is measured with a monotonic clock inside the Orchestrator interaction; it is not derived from timestamps, file times, or run age.
- **Recorded interactions.** Only `start`, `prompt`, and `mark` record. `init`, `list`, `status`, `check`, and `export` never record, so repeated inspection cannot change the economics it shows. A `start` that fails before a run exists writes nothing.
- **Persistence.** One file per invocation at `.my-dev-kit-orchestrator/telemetry/<run-id>/pending/<invocation-id>.json` and, once completed, `.../invocations/<invocation-id>.json`, outside the run directory. Files are created exclusively (never replacing an existing file), completed records are published before the pending copy is removed, paths are containment-checked and reject symbolic links and junctions, and a record above 8 KiB is rejected unread. A telemetry write failure emits one bounded `Telemetry warning: <CODE>` on stderr and never changes the command's output or exit code.
- **Reader.** `readRunTelemetry` is the single reader/validator. It orders accepted records by `startedAt` then `invocationId`, reports bounded diagnostics (for example `MALFORMED_JSON`, `UNKNOWN_PROPERTY`, `RECORD_TOO_LARGE`, `UNSAFE_RECORD_FILE`, `UNSUPPORTED_RUN_TELEMETRY_VERSION`), and never mutates a file. If the same invocation exists as both pending and completed (a crash between publishing the completed record and removing the pending copy), the completed record is the usable observation and the leftover pending copy is reported as `DUPLICATE_INVOCATION_ID`; it is not a second invocation. Malformed telemetry never prevents a run from loading.
- **Authority.** Telemetry observes `RunIntegrityGate`, judge integrity, final-report eligibility, lifecycle, correction routing, stage detection, repository-context readiness, and Semantic Continuity; canonical owners never import or read it. It has no effect on any of their decisions.

## Workflow Economics contract

`src/runWorkflowEconomics.ts` owns one pure evaluator, `evaluateWorkflowEconomics` (with a read-only `computeRunWorkflowEconomics` wrapper), version `1.0.0` (a separate namespace from the package, telemetry schema, and ECO-00 versions). It derives a summary on demand from the accepted telemetry record set and persists nothing; it writes nothing, reads no clock, executes no command, and evaluates no workflow policy. The same accepted record set always yields the same summary, independent of read order.

- **Availability.** `not-activated` (legacy run; not a warning), `available`, `partial` (supported telemetry summarized, but pending invocations, reader diagnostics, wall-clock anomalies, or an unrepresentable aggregate mean coverage is incomplete), and `unsupported` (never read as `1.0.0`). Availability is descriptive and never means pass, fail, ready, or blocked.
- **Records.** Only completed records feed metrics. A unique pending record counts only as incomplete coverage; a pending copy of a completed invocation counts as neither. Invalid records are reader diagnostics, not metrics.
- **Interactions and prompts.** Completed, succeeded, failed, and incomplete counts, with fixed per-command counts; prompt render counts (`stage` versus `correction`, where one correction rendering does not prove a correction cycle) and total, minimum, maximum, and 2-decimal average characters. Unavailable values are `null`, never zero.
- **Durations and span.** Total, minimum, maximum, and average persisted invocation duration with per-command totals (time inside Orchestrator interactions only). `observedWorkflowSpanMs` is the latest `completedAt` minus the earliest `startedAt` over completed records; it is wall-clock time and is not active work time.
- **Stage movement and concurrency.** Comparisons use only adjacent, non-overlapping completed records with stage facts. `stageRevisitCount` is the conservative count of backward stage transitions; repeating a prompt is not a revisit. Two adjacent intervals overlap when the later `startedAt` precedes the earlier `completedAt` (equality is not overlap); overlap sets `concurrencyDetected`, is counted in `ambiguousTransitionBoundaryCount`, and suppresses every transition inference across that boundary.
- **Snapshots.** Integrity, judge, final-eligibility, and Semantic Continuity figures are counts of recorded snapshots copied from their canonical owners, plus blocked-entry/recovery and reached/lost transitions between adjacent comparable snapshots. They are observations, not gate evaluations, judge attempts, or Semantic Continuity executions; no judge-attempt count exists.
- **Hardening.** Fixed-shape `unrecognized` buckets count recorded values outside the known vocabulary without assigning meaning; `wallClockAnomalyCount` counts completed records that end before they start (excluded from span and boundary inference); `numericLimitExceeded` reports a total that could not be represented safely, whose metrics are then `null`.
- **Unavailable facts.** Coding-agent time, human time, provider/model identity, token use, API cost, external build/test duration, and target-application measurements are not collected and are never estimated.

## Compatibility expectations

Schema versions, fixed paths, stage order, command families, issue codes, legacy-run treatment, and documented non-execution boundaries are compatibility-sensitive. Additive evolution must preserve old-run readability or emit explicit legacy/not-evaluated evidence. See [ARCHITECTURE.md](ARCHITECTURE.md) for owners and [DOCUMENTATION_PRESERVATION_POLICY.md](DOCUMENTATION_PRESERVATION_POLICY.md) for anti-drift rules.
