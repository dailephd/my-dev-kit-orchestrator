# Architecture

## Purpose

`my-dev-kit-orchestrator` is a CLI-first workflow tool for design-first
software development with coding agents. This document describes the
architecture implemented at repository HEAD.

The current release is `v1.5.0`, which ships Semantic Continuity alongside
the prior greenfield, integrity, and instruction-bootstrap contracts,
`v1.4.0`'s maintained-line trace/lifecycle reconciliation, phase-aware
readiness, explicit proof-only verification, and the bounded Observer v0.6
consumer. Architecture is organized by current responsibility rather than by
release version.

## System boundaries

The user starts and advances workflow runs. The CLI owns mode selection, run
metadata, native stage ordering, prompt generation, artifact naming, lifecycle
inspection, deterministic checks, and portable export. A coding agent works
outside the CLI by consuming prompts, inspecting repositories, writing the
requested artifacts, implementing changes, and recording verification evidence.

The surrounding tools retain separate responsibilities:

- `my-dev-kit` owns repository indexing, bounded retrieval, and evidence
  classification.
- `my-dev-kit-orchestrator` owns workflow instructions, stage requirements,
  readiness evaluation, and routing policy for supplied evidence.
- `my-frontend-observer` owns rendered browser evidence, frontend contracts,
  reference fidelity, and explicit runtime/static correlation.
- `my-dev-kit-lab` owns evaluation and experiments; it is not part of the
  orchestrator's production runtime.

Cross-repository workflow composition is documented once in
[my-dev-kit](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md).
Documentation ownership does not move these runtime responsibilities.

A user or coding agent performs repository retrieval and project-command
execution outside Orchestrator. The CLI does not automatically retrieve
evidence, run a coding agent, edit source code, execute tests, or publish
packages. The user or agent invokes `my-dev-kit` separately and supplies its
evidence.

Artifact content validation remains one shared system. Artifact-kind entries in
the registry select their native format contract: text artifacts use the
existing section parser, while structured greenfield JSON artifacts use strict
JSON parsing and structured-field validators. Format-independent existence,
predecessor, lifecycle, stage-gate, judge-integrity, and readiness checks remain
shared and unchanged.

## Core components

The CLI command layer exposes exactly eight commands: `init`, `start`,
`status`, `prompt`, `list`, `mark`, `check`, and `export`. Those commands create
and inspect local runs; they do not form a general task-running platform.

The core architecture consists of:

- workflow definitions and ordered native stages
- a typed instruction catalog with exact stable identifiers
- deterministic `WorkflowInstructionPacket` assembly and sidecars
- stage prompt assembly from catalog instructions and in-memory run context
- plain-text native artifacts and supplemental repository-evidence files
- deterministic context-readiness evaluation
- lifecycle, status, check, export, judge, and correction integration
- Semantic Continuity: stable `RSP-NNN` responsibility identity carried through
  strategy, implementation, test-implementation, and verification evidence, and
  enforced by the same `RunIntegrityGate`

Android Compose support already shipped in `v1.2.0` as the explicit
`android-compose` greenfield starter profile alongside `typescript-cli` and
`nextjs-app`. It remains prompt and scaffold guidance only. The orchestrator
does not run Gradle, require an Android SDK, or detect an emulator or device.

All four current profiles share one validation architecture, owned by
`src/greenfield/profiles/` and `src/greenfield/readiness/`:

- `validateGreenfieldProfile()` and `validateGreenfieldProfileRegistry()`
  validate a profile and the built-in registry (required fields, command
  classification, target expectations, duplicate/alias/overlap detection)
  and return an immutable `ProfileValidationResult`; they never throw for
  expected failures.
- `validateGreenfieldScaffoldPlan()` checks a `GreenfieldScaffoldPlan` against
  the selected profile's targets and commands, using
  `targetPathSafety.ts` (lexical normalization; traversal/absolute rejection
  before any filesystem access) and `targetPatternMatching.ts` (exact and
  bounded-pattern matching, including overlap detection).
  `parseGreenfieldScaffoldPlanArtifact()` deterministically reconstructs a
  plan from the persisted `scaffold-plan.txt` artifact so this validator runs
  against real runs, not only in-memory callers.
- `evaluateGreenfieldReadiness()` is a pure function combining profile
  validation, scaffold-plan validation, generated-file evidence (matched
  against the scaffold implementation report, with optional read-only
  filesystem corroboration via `corroborateGeneratedTarget.ts` that rejects
  directories and symlinks as file evidence), verification-command evidence,
  first-vertical-slice readiness, and a documentation-findings bridge into
  `validateGreenfieldProfileDocumentation()`.
  `checkGreenfieldRunReadiness()` is the sole disk-reading boundary: it
  resolves the selected profile, reads the run's native text artifacts, and
  delegates to the pure evaluator.
- All of the above reuse the shared `ProfileValidationIssue`
  (code/severity/profileId/affectedContract/reason/correctiveAction) and
  deterministic ordering from the original validation implementation. There
  is no second issue system, profile-ID branch inside a shared validator,
  or parallel readiness authority.
- A run's evidence is treated as legacy (evaluated for compatibility, not
  failed for missing v1.3.0-only fields) using the presence of a "Profile"
  section in the scaffold implementation report as the sole discriminator,
  not a timestamp.

### v1.3.1: standardized documents and full-stack capability

`v1.3.1` is retained by the current release and is additive to the architecture
above rather than a replacement:

- `src/greenfield/brief/briefTypes.ts` adds optional `projectType` and
  `webFramework` fields to the raw and normalized brief. They are orthogonal
  to starter-profile selection, not a new profile: `GreenfieldProfileId`
  was `'typescript-cli' | 'nextjs-app' | 'android-compose'` in that release
  (`src/greenfield/profiles/profileTypes.ts`); there is no `nextjs-fullstack`
  profile. A brief without these fields normalizes exactly as before, so
  legacy briefs remain valid.
- `src/greenfield/bootstrap/projectDocBootstrapTypes.ts` owns the canonical
  15-file greenfield document baseline (`GREENFIELD_CANONICAL_DOCUMENTS`):
  `README.md`, `CHANGELOG.md`, and the 13 `docs/*.md` files through
  `DOCUMENTATION_PRESERVATION_POLICY.md`, in one deterministic order, applied
  to the `typescript-cli`, `nextjs-app`, and `android-compose` profiles present
  in that release. `src/greenfield/bootstrap/`
  `populateCanonicalProjectDocumentsFromBrief.ts` derives per-document content
  from the actual brief/profile/capability, not copied ecosystem prose.
  Profile- and capability-specific requirements layer additively into these
  common owners; there is no default `DATABASE.md`/`ENVIRONMENT.md`/
  `TESTING.md`/`DEPLOYMENT.md` taxonomy.
- `src/greenfield/fullstack/` owns the one supported full-stack combination:
  `fullstackCapabilityTypes.ts` defines the single
  `FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY` (fullstack-web +
  nextjs + nextjs-app + PostgreSQL + Prisma + Docker), including environment
  variable metadata with host/container address distinction, a default-none
  seed policy, an explicit migration-create-vs-deploy distinction, isolated
  test-database lifecycle, and a three-way distinction between PostgreSQL
  health, application liveness, and application/database readiness.
  `resolveFullstackCapability.ts` and `validateFullstackCapability.ts` resolve
  and validate it deterministically. No other framework, database, or
  container runtime is supported; there is no generic arbitrary-stack claim.
- `src/greenfield/scaffold/buildScaffoldPlan.ts` composes the base `nextjs-app`
  profile's targets and commands with the full-stack capability's targets and
  commands additively into one scaffold plan (Dockerfile, scoped
  `.dockerignore`, development and isolated-test Compose files, non-secret
  environment templates, the Prisma schema and migration structure, the
  canonical application database client, environment/Docker/database
  readiness scripts, and the database-backed first vertical slice). An
  ordinary `nextjs-app` run, `typescript-cli`, and `android-compose` never
  receive full-stack targets: capability resolution only activates for
  `fullstack-web` + `nextjs`.
- `src/greenfield/readiness/checkGreenfieldRunReadiness.ts` and
  `evaluateGreenfieldReadiness.ts` remain the sole greenfield readiness owner;
  full-stack evidence (generated-file evidence, verification-command
  evidence, and the three-way health/liveness/readiness proof) feeds into the
  same aggregation as base readiness rather than a second lifecycle, gate, or
  issue system.
- `src/judgeIntegrity.ts`'s `evaluateFinalReportEligibility()` consults
  canonical greenfield readiness for every greenfield run (generic to
  `gate.mode === 'greenfield'`, not hard-coded to full-stack): an authored
  judge `PASS` can no longer make a greenfield run final-report-eligible
  while canonical readiness is incomplete. A legacy run (evidence predating
  the structured-evidence sections) is exempted only through the existing
  `legacyRun && valid` distinction `status`/`check` already used, not a
  blanket bypass. `prompt`, `mark`, `status`, `check`, and `export` all
  consume this same function; none recomputes readiness independently.
- The generated verification/judge/final-report/initial-index prompts
  (`src/promptGenerator.ts`) and canonical greenfield readiness both read and
  write the verification-report artifact at the same canonical location the
  shared workflow artifact map already declares for the "verification" stage
  (`src/workflows.ts`), so a real run following the generated prompts
  produces evidence at the same path every downstream consumer expects.

### v1.3.3: common project instructions and Python CLI

The `v1.3.3` release extends the same architecture without adding a workflow
mode, stage, native artifact, or readiness subsystem:

- `src/greenfield/bootstrap/projectInstructions/projectInstructionTypes.ts`
  owns one normalized in-memory project-instruction model and exactly four
  generated-project paths. `buildProjectInstructionBundle.ts` deterministically
  renders the detailed `agents.txt`, compact `claude.txt`, and small uppercase
  adapters from that source; `validateProjectInstructionBundle.ts` validates
  the bounded bundle. The pure path performs no I/O or command execution.
- These four files are not members of the 15-file
  `GREENFIELD_CANONICAL_DOCUMENTS` public-document registry and are not native
  orchestrator artifacts.
- `src/greenfield/scaffold/effectiveTargetExpectations.ts` owns the common
  exact targets and `composeEffectiveGreenfieldTargetExpectations()`.
  Its deterministic order is common, selected profile, then optional
  capability. Scaffold planning, plan validation, generated-file evidence,
  filesystem corroboration, and canonical readiness consume the same composition.
- `src/greenfield/profiles/pythonCliProfile.ts` defines the fourth profile via
  the existing `GreenfieldProfile` contract: `pyproject.toml`, `src/main.py`,
  `tests/test_main.py`, and `README.md`, with Python setup/compile/pytest/help
  guidance and no full-stack compatibility. Registry and resolution remain in
  `resolveGreenfieldProfile.ts`; bare Python and Python web/API/server intent
  remain unresolved/unsupported.
- `buildScaffoldPlan.ts` derives the first runnable entry point from the
  selected profile's required exact `entry-point` target metadata. It does not
  maintain a TypeScript/Kotlin/Python extension list.
- The closed terminology vocabulary in `profileTypes.ts` includes `PYTHON`;
  `validateBootstrapDocs.ts` applies it through profile-owned declarations,
  not Python profile-ID branches. Starter-profile guidance likewise derives
  supported profile IDs from the canonical registry.
- The existing generic `initial-index` stage is unchanged. Verified Python
  source can be indexed by published `my-dev-kit` through ordinary extension
  inference; the orchestrator neither invokes it nor owns a Python index path.

### Native run telemetry and Workflow Economics

Run telemetry is an Orchestrator-owned observational contract for the
`start`, `prompt`, and `mark` interactions of a telemetry-activated run. It is
descriptive: it never feeds `RunIntegrityGate`, judge integrity, artifact
lifecycle, correction routing, stage detection, repository-context readiness,
or Semantic Continuity. Ownership and data flow:

```text
run.json runTelemetryVersion            (explicit activation, never inferred)
        |
start / prompt / mark commands
        |  copy bounded facts from results they already computed
        v
runTelemetryObservation.ts              (projector: canonical owner -> observation)
        |
        v
runTelemetry.ts / runTelemetryStore.ts  (contract, validator, safe persistence)
        |
        v   telemetry/<run-id>/{pending,invocations}/  (outside runs/)
runTelemetryStore.readRunTelemetry      (the one reader/validator)
        |
        +--> runWorkflowEconomics.ts    (the one pure evaluator, derived on demand)
        |            |
        |            v
        |    workflowEconomicsSurface.ts (pure formatting)
        |            +--> status   (compact section)
        |            +--> export   (bounded section)
        |
        +--> check / check --all diagnostics (via the same surface)
```

- Canonical policy owners sit upstream of telemetry. The dependency direction
  is policy owner -> observation projector -> telemetry contract/store, never
  the reverse; a structural test protects it.
- Telemetry is stored beside `runs/`, not inside a run directory, so recording
  never changes run-folder contents, run-folder mtime, or lifecycle state.
- There is exactly one Workflow Economics evaluator. It is pure (no writes, no
  clock, no policy) and its result is never persisted; `status` and `export`
  format it and `check` reads the same canonical reader for structure.
- `init`, `list`, `status`, `check`, and `export` never record telemetry, so
  repeated inspection cannot alter the economics being inspected.
- Runs without `runTelemetryVersion` are legacy: no telemetry is read, shown,
  or warned about. An explicit unsupported version is reported as unsupported
  and is never read as `1.0.0`.

## Workflow definitions

The Workflow mode layer is owned by `src/workflows.ts`. It defines the seven
workflow modes, native stage order, artifact filenames, and prompt filenames:

- `feature`
- `repair`
- `test`
- `refactor`
- `harden`
- `extraction`
- `greenfield`

There are 79 native stages in total. Stage definitions remain the source of
truth for prompt generation, stage detection, and lifecycle progression.

Extraction mode separates source-repository evidence from target-repository
implementation. Its run workspace lives under the target repository; source
and target indexes remain separate. The source is read-only evidence by
default, while implementation, testing, verification, and reporting occur in
the target. Automatic target creation is not implemented.

Greenfield profile resolution uses an explicit bounded alias table. Generic
mobile requests remain unresolved, and unsupported platforms are not silently
mapped to Android Compose. Profile setup and validation commands are descriptive
prompt data and are never executed by the orchestrator.

## Instruction catalog and exact resolution

`src/instructions/catalog.ts` owns instruction identity and references. Stable
workflow, stage, command, rule, and report-contract IDs are declared in the
catalog ID and type modules. Catalog schema and catalog version are both
`1.0.0`.

Catalog validation rejects malformed entries, duplicate IDs, incompatible
references, and incomplete native-stage coverage. The resolver uses exact IDs
only. It performs no fuzzy matching, semantic selection, or LLM selection.

The catalog does not replace workflow definitions. `src/workflows.ts` continues
to own stage order and filenames; the catalog owns the instruction content and
references associated with those stages.

The implemented deterministic contract versions are:

| Contract | Version |
| --- | --- |
| Instruction catalog schema | `1.0.0` |
| Instruction catalog version | `1.0.0` |
| `WorkflowInstructionPacket` | `1.0.0` |
| `TaskState` | `1.0.0` |
| `StageContextBundle` | `1.0.0` |
| Supplemental context packet | `1.0.0` |
| Supplemental context retrieval report | `1.0.0` |
| `ContextReadiness` | `1.0.0` |
| `RunIntegrityGate` | `1.1.0` |
| `JudgeIntegrity` | `1.0.0` |
| Semantic Continuity contract | `1.0.0` |
| Run telemetry contract | `1.0.0` |
| Workflow Economics | `1.0.0` |

## WorkflowInstructionPacket

`src/instructions/workflowInstructionPacket.ts` assembles the exact instruction
content for one native stage. A packet includes resolved rules and commands,
the report contract, validation and stop conditions, provenance, budget,
adequacy, and truncation information. The schema version is `1.0.0`.

Packet serialization applies canonical JSON key ordering and stable arrays.
Run creation writes one deterministic `*.instruction-packet.json` sidecar next
to every native `*.prompt.txt` file. All 79 native stages receive a catalog
entry and sidecar; 77 use the generalized packet-backed rendering path, while
`scaffold-plan` and `scaffold-implementation` retain their specialized
greenfield renderer.

A packet contains no repository evidence, run-specific paths, readiness state,
or timestamps. Required instruction content is retained when over budget and
reported as inadequate rather than silently removed. Optional content can be
omitted only with an explicit deterministic truncation record.

## Prompt assembly

Prompt generation remains stage-specific. The renderer combines the current
stage contract with the exact packet and applicable in-memory context. Prompts
identify required inputs, current work, expected output, validation, stop
conditions, and the required return format.

Context-sensitive implementation and test-implementation stages render normal
work only when their required repository evidence is ready. When readiness is
blocked, the direct-stage prompt is refresh-only and prohibits normal
implementation or test work. Printing a prompt reevaluates readiness but does
not create sidecars or templates and does not mutate `run.json` or
`artifact-state.json`.

For an unfamiliar existing project, prompt assembly also has a manual ecosystem
precondition: the [Architecture Assimilation Gate in my-dev-kit](https://github.com/dailephd/my-dev-kit/blob/main/docs/ECOSYSTEM_DEVELOPMENT_WORKFLOWS.md#6-existing-project-onboarding-workflow)
must return `ARCHITECTURE_ASSIMILATION_PASS` before ChatGPT chooses direct or
staged execution or supplies an implementation prompt. This is deliberately
not a second native stage, persisted schema, or producer artifact. The current
CLI does not validate the outcome and must not be described as enforcing it.

The bounded implementation prompt references the passing result and carries
only its relevant conclusions: existing owner and extension point, analogous
implementation, canonical contracts/state, involved dependencies and flows,
layers intentionally excluded, tests to extend, architecture that must not be
duplicated, and accepted noncritical uncertainty. Task-specific repository
evidence remains required and must be refreshed against the current candidate;
the full assimilation report is not copied into every prompt.

For an activated run (see Semantic Continuity below), `src/instructions/semanticContinuityPrompt.ts`
owns the conditional authoring guidance that `promptGenerator.ts` appends to
each participating stage's packet-backed instructions. Saved prompt files are
templates that carry this guidance but never live gate state; the live `prompt`
command renders through `generateLiveStagePrompt()`, which also honors the
current `RunIntegrityGate` and replaces a semantically blocked stage's normal
work with bounded correction guidance for the canonical correction stage.
Legacy, greenfield, and proof-only prompts receive none of it.

The two greenfield scaffold stages keep their specialized renderer without
changing their stage names, prompt filenames, sidecars, or lifecycle behavior.

## TaskState and StageContextBundle

`TaskState` schema `1.0.0` projects the selected run-specific state needed for
prompt assembly. `StageContextBundle` schema `1.0.0` combines the exact packet,
`TaskState`, upstream artifact references, and applicable
`RepositoryEvidenceReference` values.

Both structures are assembled in memory and are never persisted. A
`StageContextBundle` does not redefine native artifacts or lifecycle state, and
`TaskState` is not a second run metadata file.

## Supplemental repository evidence

Mode-appropriate runs create fixed supplemental templates:

- `artifacts/implementation-context-packet.txt`
- `reports/implementation-context-retrieval-report.txt`
- `artifacts/test-context-packet.txt`
- `reports/test-context-retrieval-report.txt`

The supplemental context packet and supplemental context retrieval report use
schema `1.0.0`. They record bounded identity, status, freshness, adequacy,
truncation, provenance, raw capsule and audit references, and required evidence
sections. Raw `my-dev-kit` capsule and audit JSON are parsed into bounded
projections; full raw documents are not embedded in the instruction packet or
stage bundle.

`RepositoryEvidenceReference` describes evidence applicable to a stage. The
exact requirement registry contains five implementation-context direct stages
and six test-context direct stages. Greenfield requires no supplemental
repository context. Verification and judge review mode-level context requirements
rather than adding native context stages.

## Context readiness

`ContextReadiness` schema `1.0.0` evaluates one repository-evidence requirement.
Run-level readiness aggregates the implementation and test decisions required
by the selected mode.

Evaluation checks:

- document structure and schema identity
- supplemental document kind and role
- raw capsule/audit repository and active-index identity agreement
- source references and provenance
- declared freshness and after-index agreement
- role-specific adequacy
- required-evidence truncation
- critical test-responsibility mappings

Freshness is supplied by verified external evidence; the orchestrator does not
independently compute repository freshness. Missing, stale, inadequate,
truncated, or critically unmapped required evidence produces deterministically
ordered issues and a blocked decision.

`src/instructions/myDevKitEvidenceSummary.ts` parses the corrected
`my-dev-kit` v1.10.4 producer contract's additive `roleConditionCoverage[]`
field (condition-aware role adequacy with retained required-condition witness
IDs) when present. The released `@dailephd/my-dev-kit@1.10.4` package emits
the additive field when applicable; its absence on older schema-major-1
evidence, including `1.10.3`, remains legacy-compatible and never blocks
by itself. Producer `roleAdequacy` and `requiredEvidenceLost` remain authoritative
and are never recomputed. Optional-only truncation is nonblocking whenever
producer adequacy remains sufficient. An actual lost required-condition witness
raises a dedicated code independent of general truncation. Capsule/audit parity
checks extend to that field. Packet/report declarations are reconciled against
raw producer evidence, not just each other. An agreeing supplemental pair
cannot mask a contradiction with the raw capsule or audit.

Every refresh-required result is finalized with an actionable canonical
blocker summary. The summary contains `contextKind`, `primaryCode`,
`primaryReason`, `correctiveAction`, `evidenceTarget`, `blockingIssueCodes`,
and `supportingIssueCodes`. Primary selection uses one deterministic priority
order. Run aggregation preserves implementation-before-test priority and never
converts an error-bearing result to ready.

## Lifecycle boundaries

Each native stage produces its expected artifact file. Lifecycle progression
uses artifact existence and artifact state with applicable integrity decisions.
Explicit content and dependency checks do not replace that mechanism.

Instruction-packet sidecars are inspection aids, not native lifecycle artifacts.
They are absent from `run.json` and `artifact-state.json`, are not mark targets,
and cannot advance a run.

Supplemental context packets and retrieval reports are run files, not native
stage artifacts. Editing or deleting them creates no artifact-state transition.
They can affect readiness, rendered prompts, checks, and exported readiness
summaries without changing the native lifecycle graph.

## RunIntegrityGate and judge integrity

`src/runIntegrityGate.ts` is the sole canonical run-integrity evaluator. It
derives `contextReady`, `blockedStageNames`, deterministic blocking codes, the
recommended correction stage, and `expectedJudgeVerdict` (`PASS` when context
is ready or not required, `NEED_CONTEXT` otherwise) directly from
`ContextReadiness`/`RunContextReadiness` results. It does not recompute readiness.
Every readiness-sensitive command evaluates this gate once per invocation and
threads the same result through its decisions: automatic/explicit prompt
selection, lifecycle resolution, stage detection, `mark`, `status`, `check`,
`check --all`, `check --artifacts`, and `export`.

`resolveArtifactStateWithRunIntegrity` is the single override point. It forces
a context-blocked implementation/test artifact, a semantically blocked current
stage artifact, or an ineligible final report, to `blocked` regardless of file
presence or a manual complete record.

`src/judgeIntegrity.ts` composes on top of the gate. It parses the authored
judge verdict and compares it with `expectedJudgeVerdict`. An authored PASS
is rejected when NEED_CONTEXT is expected and routes to the gate's recommended
stage. Accepted NEED_CONTEXT uses that same recommendation, overriding both
the routing-table default and conflicting authored prose. Other supported
verdicts retain their existing behavior. `SCOPE_VIOLATION` and `BLOCKED` remain
terminal. Missing, malformed, and unknown verdicts fail closed.

A normal final report requires accepted PASS, no active correction, and all
required prior native artifacts effectively complete under the same gate.
Artifact presence, manual completion, explicit final-report selection, or
structurally valid final-report content cannot substitute for this decision.

### Semantic Continuity

Semantic Continuity carries one stable responsibility identity, `RSP-NNN`,
through four legs: the mode-owned strategy artifact declares the
responsibilities and traces them to upstream `REQ`/`CTX`/`BEH`/`INV`/`TRN`/`PSE`
IDs; the existing `ImplementationReport`, `TestImplementationReport`, and
`VerificationReport` carry per-RSP mappings and results. No native artifact,
stage, mode, command, or persisted state is added.

- The bridge modules (`implementationResponsibilityEvidence.ts`,
  `testImplementationResponsibilityEvidence.ts`,
  `verificationResponsibilityEvidence.ts`, with shared path policy in
  `responsibilityEvidenceShared.ts`) parse the authored blocks and corroborate
  declared production and test identities by exact match against same-ID
  my-dev-kit mappings. Corroboration shows only that an identity exists in
  bounded producer evidence; it does not prove causality, execution, or
  correctness. Verification results are agent-reported and never executed.
- `semanticContinuity.ts` is the single pure, phase-aware evaluator: a leg is
  active only after its owner stage, so correcting an earlier stage ignores
  future downstream defects.
- `runSemanticContinuity.ts` is the only I/O adapter. It is activated by the
  `semanticContinuityVersion` field in `run.json` (supported value `1.0.0`);
  `start` sets it for new staged runs in every mode that owns a test
  strategy (all except `greenfield`). Absent means legacy, an unsupported value fails closed.
- `runIntegrityGate.ts` projects the result into the one gate: critical
  incomplete responsibilities and global integrity defects block, noncritical
  ones warn, and a repository-context blocker keeps primary precedence. Lifecycle,
  `mark`, judge integrity, correction routing, and final-report eligibility
  consume that same gate.
- `semanticContinuitySurface.ts` projects the computed gate for `status`,
  `check`, `export`, and the judge prompt so no surface re-derives continuity.

## Status, check, and export

`status` reports human-readable implementation/test readiness, freshness,
adequacy, primary blocker/reason, corrective action, evidence target, ordered
issue codes, and the next stage. It has no status JSON option.

`check` evaluates context readiness alongside its selected checks. Blocking
context issues fail the command. Warning-only conditions do not, and duplicate
failures for the same context kind are suppressed. Its failure message uses
the same canonical blocker summary. Checks do not advance lifecycle state.

For a greenfield run with a selected profile, `status` and `check`/`check --all`
also surface `checkGreenfieldRunReadiness()` findings through the same shared
issue model. They consume existing readiness rather than introduce another
gate. Non-greenfield runs and runs without a selected profile are unaffected
by that presentation path.

For an activated run, `status`, `check`, `check --artifacts`, `check --all`, and
`export` each add one compact Semantic Continuity section projected from the
same gate. Blocked semantic state fails `check`; a warning fails only under
`--strict`.

For a telemetry-activated run, `status` adds one compact Workflow Economics
section, `export` adds one bounded fixed-size Workflow Economics section, and
the default `check` and `check --all` add a `Run telemetry` section from the
canonical telemetry reader. Telemetry findings in `check` are warnings only
(existing `--strict` promotes them like any other warning), never failures,
and never change the gate, judge, lifecycle, or correction decisions. Legacy
runs show none of these sections, and unsupported or malformed telemetry never
crashes a command.

`export` preserves honest readiness, accepted judge state, correction, and
final eligibility. It includes canonical primary-blocker fields when blocked,
but does not embed raw capsule/audit JSON or copy external evidence merely
because a supplemental file references it. Existing path-safety rules remain.

## Judge and correction routing

Verification and judge prompts review context kinds required by their mode.
Feature, repair, refactor, harden, and extraction review implementation and test
context. Test mode reviews test context only. Greenfield reviews neither of
these supplemental kinds and retains canonical greenfield readiness.

A blocked context judge uses `NEED_CONTEXT` and an exact `Recommended next stage`.
Implementation takes priority when implementation context is blocked, otherwise
use test-implementation. Test mode recommends test-implementation.

Normal valid recommended-stage overrides remain supported, except that accepted
NEED_CONTEXT uses the canonical run-integrity recommendation over the table
default and conflicting prose, including when that recommendation is none.
Mode-owned strategy stages (`regression-test-strategy` for `repair`,
`compatibility-test-strategy` for `refactor`, `resilience-test-strategy` for
`harden`) are correctable only in their owning mode. There is no new verdict, correction sidecar, context file,
or automatic correction execution.

## Determinism

Equivalent inputs produce stable catalog resolution, packet serialization,
sidecar bytes, readiness issues, and recommended stages. Determinism relies on:

- exact stable IDs
- canonical JSON key ordering
- stable sorted arrays
- schemas without timestamps
- preservation of required content
- explicit optional-content truncation records
- deterministic issue and recommendation ordering
- for telemetry, a fixed record order (`startedAt`, then `invocationId`) and a
  Workflow Economics summary that is identical for the same accepted record
  set regardless of read order

Prompt filenames, native artifact filenames, workflow order, and old-run
interpretation remain compatible with `v1.2.0`.

## Security boundaries

Run storage is local. The CLI rejects unsafe export traversal and symlink
targets, does not call external services, and does not execute agents or
repository tools. `npm run test:security` validates package identity, semver,
CLI bin policy, package-file policy, and dry-run package contents. It does not
replace broader evaluation owned by `my-dev-kit-lab`.

Native run telemetry is written only to the workspace `telemetry/` directory
through containment-checked paths that reject separators and traversal, refuse
symbolic links and junctions, create each record exclusively without replacing
an existing file, keep completed records immutable, and bound record size.
Records hold bounded operational facts only; prompt bodies, source content,
mark reasons, environment values, credentials, command output, stack traces,
and target-application data are never stored, and diagnostics never expose
absolute paths.

Repository evidence is supplied data. Parsing is bounded, raw external files
are referenced rather than embedded, and prompt rendering does not grant
evidence authority beyond explicit stage requirements.

## Known limitations

- `scaffold-plan` and `scaffold-implementation` retain the specialized renderer.
- Extraction command examples are not fully promoted into command catalog entries.
- Extraction has no generic architecture-context stage. Exact NEED_CONTEXT
  recommendations use implementation/test-implementation. Generic non-context
  architecture routing retains a pre-existing edge case.
- Repository evidence retrieval and producer CLI selection remain manual.
- Semantic Continuity cannot detect that an `RSP` ID was semantically
  repurposed: identity discipline is authored, and the runtime keeps no ID
  history or semantic comparison.
- Producer corroboration is exact identity presence only; my-dev-kit evidence is
  request-scoped and does not establish per-responsibility causality.
- The current CLI has no status JSON output.
- There is no shared cross-repository schema package or Lab runtime integration.
- Cross-tool recipes are externally executed compositions. Documentation
  consolidation does not add an automatic browser or full-stack executor.

## Non-goals

The architecture intentionally excludes:

- direct LLM or autonomous multi-agent execution
- automatic `my-dev-kit` execution or repository indexing
- automatic source editing, test generation, or test execution
- Gradle execution, Android SDK validation, and device or emulator detection
- fuzzy, semantic, or LLM catalog selection
- semantic scoring, probabilistic or fuzzy responsibility matching, or
  persisted semantic state
- on-disk `TaskState` or `StageContextBundle`
- native context stages
- automatic target-repository creation
- a wholesale prompt-generator rewrite
- evaluation logic from `my-dev-kit-lab`
- release automation or package publication
