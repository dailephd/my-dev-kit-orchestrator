# Artifacts

Artifacts are inspectable handoff files stored in each run folder. Most native
artifact contracts use plain text. Greenfield uses structured JSON for
`artifacts/idea-brief.json`, `artifacts/starter-profile.json`, and
`artifacts/bootstrap-bundle.json`; its remaining native artifacts and reports
use text.

`my-dev-kit-orchestrator` uses artifact file existence and lifecycle state, not schema-heavy validation, to determine workflow progress.

Use contract names such as `RequestBrief` when discussing an artifact's role,
and use its exact path, such as `artifacts/request-brief.txt`, when discussing
storage. See [Workflows](WORKFLOWS.md) for stage procedures and
[Usage](USAGE.md) for command syntax.

## Run layout

```text
.my-dev-kit-orchestrator/runs/<run-id>/
  00-request.txt
  run.json
  artifact-state.json   <- added in v0.3.0
  prompts/
  artifacts/
  reports/
```

New ordinary runs persist `proofOnly: false`. Explicit proof-only runs also
persist their `verificationResponsibility`; the declared file is evidence owned
by that responsibility, not a new Orchestrator artifact family. Observer
evidence consumption adds no run persistence.

For extraction mode, the run layout lives under the target repository:

```text
<target-repo-root>/.my-dev-kit-orchestrator/runs/<run-id>/
```

## artifact-state.json (v0.3.0)

`artifact-state.json` stores manual lifecycle state for run artifacts.

**Path:** `.my-dev-kit-orchestrator/runs/<run-id>/artifact-state.json`

**Format:**

```json
{
  "version": "1",
  "artifacts": {
    "artifacts/request-brief.txt": {
      "state": "blocked",
      "updatedAt": "2026-06-01T12:00:00.000Z",
      "reason": "Waiting for PM sign-off",
      "source": "manual"
    }
  }
}
```

Keys are the relative artifact file path as used in the stage definition (e.g., `artifacts/request-brief.txt`).

If `artifact-state.json` does not exist, lifecycle state is derived from file existence only (backward compatibility).

## Artifact lifecycle states (v0.3.0)

Each required artifact has an effective lifecycle state:

| State        | Type     | Meaning |
|-------------|----------|---------|
| `missing`   | computed | Artifact file does not exist |
| `incomplete`| manual   | Artifact exists but is marked unfinished |
| `blocked`   | manual   | Artifact cannot be completed due to a blocker |
| `complete`  | manual + computed | Artifact is ready for downstream stages |
| `stale`     | computed | Artifact exists but an upstream artifact changed after it was completed |

**Manual states** (`incomplete`, `blocked`, `complete`) are set via the `mark` command.

**Computed states** (`missing`, `stale`) are derived automatically and cannot be set manually.

### State resolution rules (in priority order)

1. If state is `blocked` -> `blocked` (even without artifact file)
2. If artifact file does not exist -> `missing`
3. If state is `incomplete` -> `incomplete`
4. If an upstream artifact was completed or modified after this artifact -> `stale`
5. Otherwise -> `complete`

### Stale detection

An artifact is stale when its completion time (from `updatedAt` in state record, or file `mtime` as fallback) is earlier than the completion time of any upstream required artifact.

Stale detection is deterministic and local. It does not inspect artifact content.

### Dependency model

Dependencies follow stage order: artifacts for stage N depend on artifacts from all prior required stages. Supporting reports (e.g., `reports/architecture-context-retrieval-report.txt`) do not create stale gates.

For extraction mode, the `porting-map` stage has two artifacts - `source-to-target-porting-map.txt` and `do-not-port-list.txt` - and both are treated as upstream for subsequent stages.

## artifact-check-results.json (v0.4.0)

`artifact-check-results.json` stores the most recent check results for a run.

**Path:** `.my-dev-kit-orchestrator/runs/<run-id>/artifact-check-results.json`

**Created by:** `my-dev-kit-orchestrator check` (when run without `--artifact` or `--prompts`)

**Format:**

```json
{
  "version": "1",
  "checkedAt": "2026-06-24T12:00:00.000Z",
  "artifactResults": [
    {
      "artifactFile": "artifacts/request-brief.txt",
      "stageName": "request-brief",
      "artifactKind": "RequestBrief",
      "issues": [],
      "passed": true,
      "checkedAt": "2026-06-24T12:00:00.000Z"
    }
  ],
  "promptResults": [
    {
      "promptFile": "prompts/01-request-brief.txt",
      "stageName": "request-brief",
      "issues": [],
      "passed": true,
      "checkedAt": "2026-06-24T12:00:00.000Z"
    }
  ]
}
```

### Artifact check codes (v0.4.0)

| Code | Severity | Meaning |
|------|----------|---------|
| `MISSING_FILE` | `fail` | Artifact file does not exist |
| `MISSING_SECTION` | `fail` | A required section header is absent from the artifact |
| `EMPTY_SECTION` | `warn` | A required section is present but has no content |
| `PLACEHOLDER_CONTENT` | `warn` | Artifact contains TODO/PLACEHOLDER/[TBD] or is shorter than 80 characters |
| `STATUS_MISMATCH` | `warn` | Artifact `Status:` field conflicts with `artifact-state.json` lifecycle state |
| `MALFORMED_JSON` | `fail` | A registered structured artifact is not valid JSON |
| `MISSING_FIELD` | `fail` | A registered structured artifact lacks a required JSON field |
| `INVALID_FIELD` | `fail` | A registered structured artifact has an invalid required JSON field |

### Prompt check codes (v0.4.0)

| Code | Severity | Meaning |
|------|----------|---------|
| `PROMPT_MISSING_FILE` | `fail` | Prompt file does not exist |
| `PROMPT_EMPTY` | `fail` | Prompt file is empty or shorter than 50 characters |
| `PROMPT_MISSING_STAGE_HEADER` | `fail` | Prompt does not contain a `Stage: ...` header line |
| `PROMPT_MISSING_TASK_SECTION` | `fail` | Prompt does not contain a `Task:` section |
| `PROMPT_MISSING_OUTPUT_ARTIFACT` | `warn` | Prompt does not contain `Required output artifact:` |
| `PROMPT_PLACEHOLDER` | `warn` | Prompt contains placeholder marker text |

### Check severity

- `fail` - check found a definite problem; `check` exits 1
- `warn` - check found a possible problem; `check` exits 0 unless `--strict` is set
- `pass` - no issues found

## Judge correction routing (v0.6.0)

The judge report artifact drives correction routing in v0.6.0.

**Path:** `artifacts/judge-report.txt`

The parser reads two fields from the judge report:

```text
Verdict: IMPLEMENTATION_MISMATCH
Recommended next stage: implementation
```

**Supported verdicts:**

| Verdict | Route status | Default correction stage |
|---------|-------------|------------------------|
| `PASS` | pass | (none) |
| `DESIGN_INCOMPLETE` | correction_required | `behavior-model` |
| `PSEUDOCODE_INCOMPLETE` | correction_required | `pseudocode-packet` |
| `IMPLEMENTATION_MISMATCH` | correction_required | `implementation` |
| `TEST_COVERAGE_INCOMPLETE` | correction_required | `test-strategy` |
| `ARCHITECTURE_MISMATCH` | correction_required | `architecture-context` |
| `NEED_VERIFICATION` | correction_required | `verification` |
| `NEED_CONTEXT` | correction_required | `architecture-context` |
| `SCOPE_VIOLATION` | blocked | (none) |
| `BLOCKED` | blocked | (none) |

**Unknown verdicts** fail the parser - they are not guessed.
**Missing verdict** field returns `missing_verdict` status without error.

The `Recommended next stage:` field overrides the routing table default when it names a valid correctable stage, **except** for an accepted `NEED_CONTEXT` (`v1.2.3`): the canonical run-integrity recommendation always wins there, overriding both the table default and a conflicting authored value.

Correction routing is computed fresh on each `status` or `prompt` call. No additional persistence file is required.

**`v1.2.3` judge-verdict acceptance:** a literal
`Verdict: PASS` is no longer accepted as-is. It is compared against the
canonical expected verdict (`PASS` when repository context is ready or not
required, `NEED_CONTEXT` otherwise); when it contradicts `NEED_CONTEXT` it is
rejected and routed back to the blocked stage instead of clearing correction
state. A missing verdict field, an unknown verdict token, and a missing
`judge-report.txt` file are each represented as their own distinct,
never-guessed state.

## trace-check-results.json (v0.5.0)

`trace-check-results.json` stores the most recent trace check results for a run.

**Path:** `.my-dev-kit-orchestrator/runs/<run-id>/trace-check-results.json`

**Created by:** `my-dev-kit-orchestrator check --trace`

**Format:**

```json
{
  "version": "1",
  "checkedAt": "2026-06-24T12:00:00.000Z",
  "traceResults": [
    {
      "artifactFile": "artifacts/behavior-model.txt",
      "issues": [],
      "passed": true,
      "checkedAt": "2026-06-24T12:00:00.000Z"
    }
  ]
}
```

### Trace check codes (v0.5.0)

| Code | Severity | Meaning |
|------|----------|---------|
| `TRACE_MALFORMED_ID` | `fail` | A token looks like a trace ID but is not in valid canonical format (e.g., `BEH001`, `FOO-001`) |
| `TRACE_DUPLICATE_ID` | `warn` | The same trace ID is declared more than once in the artifact |
| `TRACE_ORPHAN_ID` | `warn` | A declared trace ID appears in no trace link in the artifact |
| `TRACE_MISSING_LINK_TARGET` | `fail` | A trace link references a valid trace ID not declared in this artifact |

Trace IDs are optional in artifacts. The trace checker skips artifacts with no trace IDs. Only artifacts that declare at least one trace ID are evaluated for orphan and link integrity.

## DesignMap artifact (v0.5.0)

**Path:** `artifacts/design-map.txt`

**Produced by:** the workflow participant when a consolidated trace registry is needed. DesignMap is not a registered workflow stage.

**Purpose:** Maps trace IDs across all run artifacts into a single registry. Records requirement links, behavior links, invariant links, and orphan or missing links.

**Required sections:**

- Artifact
- DesignMap
- Workflow mode
- Inputs used
- Trace ID registry
- Requirement links
- Context links
- Behavior links
- Invariant links
- Transition links
- Pseudocode links
- Test responsibility links
- Implementation links
- Verification links
- Risk links
- Orphan or missing links
- Trace gaps
- Status

Use `my-dev-kit-orchestrator check --design-map` to verify the DesignMap artifact has all required sections and no trace link issues.

## Artifact contract checks (v1.0.0)

`my-dev-kit-orchestrator check --artifacts` checks every stage artifact against
its mode-aware contract. It applies text-section checks where applicable and
the implemented structured checks to selected greenfield JSON contracts. It
reports missing or empty files, required content, placeholder or blank
content, missing predecessor artifacts, and unsupported modes or stages.
Warnings remain warnings in normal mode and cause exit code 1 with `--strict`.

`my-dev-kit-orchestrator check --all` combines artifact contracts with critical stage-gate checks, trace checks, the DesignMap trace check when present, and correction-routing status. Contract and stage-gate checks inspect the run but do not change lifecycle state or advance stages.

## Current format limitations

- full JSON schema validation or Zod/AJV enforcement
- LLM-based artifact judging or semantic artifact grading
- automatic artifact rewriting
- autonomous runtime verification

## How stage advancement works

For the selected workflow, the CLI checks stage order from first to last.

Rules used in v0.4.0:

- if the effective lifecycle state of any stage artifact is not `complete`, that stage is the current stage
- if all artifacts are effectively `complete`, the run is complete
- **backward compatibility**: if `artifact-state.json` does not exist, file presence means `complete` and file absence means `missing`

Artifact content checks (`check` command) are a separate optional layer. They do not affect stage advancement - they report quality issues for human review.

## Core feature-mode artifact files

Feature mode uses these core artifact contracts in order:

| Contract | Producing stage | Preferred path | Primary downstream use |
| --- | --- | --- | --- |
| `RequestBrief` | `request-brief` | `artifacts/request-brief.txt` | Architecture context and scope control |
| `ArchitectureContextPacket` | `architecture-context` | `artifacts/architecture-context-packet.txt` | Behavior, pseudocode, and implementation design |
| `BehaviorModel` | `behavior-model` | `artifacts/behavior-model.txt` | Pseudocode and behavior-derived tests |
| `PseudocodePacket` | `pseudocode-packet` | `artifacts/pseudocode-packet.txt` | Implementation and test implementation |
| `TestStrategyPacket` | `test-strategy` | `artifacts/test-strategy-packet.txt` | Test implementation and verification |
| `ImplementationReport` | `implementation` | `artifacts/implementation-report.txt` | Verification and judge review |
| `TestImplementationReport` | `test-implementation` | `artifacts/test-implementation-report.txt` | Verification and judge review |
| `VerificationReport` | `verification` | `artifacts/verification-report.txt` | Judge review and final report |
| `JudgeReport` | `judge` | `artifacts/judge-report.txt` | Correction routing and final report |
| `FinalReport` | `final-report` | `artifacts/final-report.txt` | Completed run handoff |

The producing prompt defines each artifact's required sections. An artifact is
complete only when its required content is present, its declared status agrees
with lifecycle metadata, and it is ready for its downstream consumers.

The corresponding files are:

1. `artifacts/request-brief.txt`
2. `artifacts/architecture-context-packet.txt`
3. `artifacts/behavior-model.txt`
4. `artifacts/pseudocode-packet.txt`
5. `artifacts/test-strategy-packet.txt`
6. `artifacts/implementation-report.txt`
7. `artifacts/test-implementation-report.txt`
8. `artifacts/verification-report.txt`
9. `artifacts/judge-report.txt`
10. `artifacts/final-report.txt`

## Mode-specific artifact files

### Repair mode

- `artifacts/observed-behavior-report.txt`
- `artifacts/architecture-context-packet.txt`
- `artifacts/behavior-trace.txt`
- `artifacts/divergence-report.txt`
- `artifacts/correction-design.txt`
- `artifacts/regression-test-strategy.txt`
- `artifacts/implementation-report.txt`
- `artifacts/test-implementation-report.txt`
- `artifacts/verification-report.txt`
- `artifacts/judge-report.txt`
- `artifacts/final-report.txt`

### Test mode

- `artifacts/test-target-brief.txt`
- `artifacts/architecture-context-packet.txt`
- `artifacts/behavior-reconstruction.txt`
- `artifacts/pseudocode-summary.txt`
- `artifacts/test-strategy-packet.txt`
- `artifacts/test-implementation-report.txt`
- `artifacts/verification-report.txt`
- `artifacts/judge-report.txt`
- `artifacts/final-report.txt`

### Refactor mode

- `artifacts/refactor-brief.txt`
- `artifacts/architecture-context-packet.txt`
- `artifacts/existing-behavior-map.txt`
- `artifacts/preserved-invariant-list.txt`
- `artifacts/compatibility-test-strategy.txt`
- `artifacts/refactor-pseudocode-packet.txt`
- `artifacts/implementation-report.txt`
- `artifacts/test-implementation-report.txt`
- `artifacts/verification-report.txt`
- `artifacts/judge-report.txt`
- `artifacts/final-report.txt`

### Harden mode

- `artifacts/hardening-brief.txt`
- `artifacts/architecture-context-packet.txt`
- `artifacts/assumption-report.txt`
- `artifacts/failure-mode-matrix.txt`
- `artifacts/guard-pseudocode-packet.txt`
- `artifacts/resilience-test-strategy.txt`
- `artifacts/implementation-report.txt`
- `artifacts/test-implementation-report.txt`
- `artifacts/verification-report.txt`
- `artifacts/judge-report.txt`
- `artifacts/final-report.txt`

## Greenfield mode artifacts

Greenfield uses the same `ARTIFACT_MAP`, stage-kind registry, section
registry, artifact checker, and contract checker as every other mode. It does
not have a parallel artifact engine or a
`validateGreenfieldArtifacts.ts` module.

The 13 stage outputs are:

| Stage | Implemented path |
| --- | --- |
| `idea-brief` | `artifacts/idea-brief.json` |
| `product-boundary` | `artifacts/product-boundary.txt` |
| `stack-decision` | `artifacts/stack-decision.txt` |
| `starter-profile` | `artifacts/starter-profile.json` |
| `bootstrap-bundle` | `artifacts/bootstrap-bundle.json` |
| `project-docs` | `artifacts/project-docs-report.txt` |
| `scaffold-plan` | `artifacts/scaffold-plan.txt` |
| `scaffold-implementation` | `reports/scaffold-implementation-report.txt` |
| `first-vertical-slice` | `artifacts/first-vertical-slice.txt` |
| `verification` | `artifacts/verification-report.txt` |
| `initial-index` | `reports/initial-index-report.txt` |
| `judge` | `artifacts/judge-report.txt` |
| `final-report` | `artifacts/final-report.txt` |

`verification`, `judge`, and `final-report` deliberately reuse the shared
`artifacts/*.txt` paths because `ARTIFACT_MAP` is keyed by stage name across
all modes. They do not use greenfield-only `reports/*.txt` alternatives.

The JSON brief, profile, and bundle files participate in the same shared
existence, predecessor, lifecycle, and readiness checks as text artifacts.
Their content checks parse JSON and apply their registered structured-field
contracts; they are not required to contain bare text section headers.
Bootstrap project
documentation is structured in-memory runtime output; it does not imply that
the orchestrator writes template documents. `validateBootstrapDocs` checks
required content and is profile-aware through the selected profile's declared
terminology. Android/Jetpack content is permitted for `android-compose`,
Next.js/React for `nextjs-app`, and Python/pytest/pyproject terminology for
`python-cli`; equivalent stack claims are rejected for profiles that do not
declare them. iOS/React Native/Flutter/multiplatform claims and
release/security/publish/Play-Store claims are rejected regardless of the
selected profile.

`GreenfieldScaffoldPlan`'s `setupCommands` and `validationCommands` fields are
`GreenfieldProfileCommand[]` (`{ command, purpose, required,
environmentNotes? }`), sourced directly from the selected profile -- never
executed by the orchestrator. For `android-compose`, `setupCommands` is `[]`
(the Gradle wrapper needs no separate install step) and `validationCommands`
lists `./gradlew build` and `./gradlew testDebugUnitTest` as required, plus an
optional, device/emulator-dependent `./gradlew connectedAndroidTest`.

`scaffold-plan.txt` carries bounded, deterministically parseable sections
inside its native "Heading: body" text format, alongside the free-prose
fields (`Planned file groups`, `First runnable behavior`, `Test
expectations`, `Documentation expectations`, `Unresolved decisions`,
`Non-goals`):

- `Profile: <selected profile id>` -- must match the run's selected profile.
- `Target paths:` -- one normalized relative path per line (`- <path>`).
- `Setup commands:` / `Validation commands:` -- one command per line in the
  form `- <command text>: required` or
  `- <command text>: optional, <nonblank note>`.

`checkGreenfieldRunReadiness()` reads and parses this artifact into a
`GreenfieldScaffoldPlan` (`parseGreenfieldScaffoldPlanArtifact()` in
`src/greenfield/readiness/parseGreenfieldEvidence.ts`) and validates it
through the same `validateGreenfieldScaffoldPlan()` used during the
scaffold-plan stage itself, for every run whose scaffold implementation
report is not legacy. A missing or malformed plan on a current-format run
surfaces through the plan validator's existing profile-identity check rather
than a new issue code.

The scaffold implementation report, verification report, and first vertical
slice artifacts carry their own bounded structured sections that
`checkGreenfieldRunReadiness()` reads for evidence:

- `ScaffoldImplementationReport`: `Profile: <selected profile id>` and
  `Files changed:` (one `- <path>` per generated file, matched against the
  profile's required target expectations).
- `VerificationReport`: `Commands verified:` (one
  `- <command text>: passed|failed|skipped[, <reason>]` per line; an optional
  command may pass with evidence or skip with a nonblank reason, but a
  required command must show `passed`).
- `FirstVerticalSlice`: `Profile:`, `Minimal behavior:`, `Entry point:`, and
  `Tied to product boundary:` -- all required and non-placeholder for
  readiness.

A run whose scaffold implementation report has no `Profile:` section
predates this evidence model. It is treated as legacy: readiness reports
`GF_LEGACY_EVIDENCE_NOT_EVALUATED` (a warning, not a failure) and skips
generated-file, scaffold-plan, and first-slice-profile-identity evidence for
that run, rather than retroactively failing it for fields it could not have
written.

### v1.3.1 additions

These extend the artifacts above; no artifact identity, filename, or path
changes. See [ARCHITECTURE.md](ARCHITECTURE.md#v131-standardized-documents-and-full-stack-capability)
for the owning modules.

- `artifacts/bootstrap-bundle.json` additionally carries the normalized
  `projectType`/`webFramework` brief dimensions and, when a full-stack
  combination resolves, the selected capability
  (`FULLSTACK_NEXTJS_POSTGRESQL_PRISMA_DOCKER_CAPABILITY`), following the same
  `{ status: 'selected' | ..., reason, ... }` shape already used for profile
  selection.
- `artifacts/project-docs-report.txt` reflects the standardized 15-file
  canonical document baseline for every profile, with full-stack-specific
  content layered in only when the capability is selected.
- `artifacts/scaffold-plan.txt`'s `Target paths:`, `Setup commands:`, and
  `Validation commands:` sections carry the additive composition of the base
  profile's targets/commands and the full-stack capability's targets/commands
  (Dockerfile, Compose files, Prisma schema, environment templates, readiness
  scripts) when selected, using the exact same parsed sections described
  above -- there is no separate full-stack scaffold-plan format.
- `checkGreenfieldRunReadiness()` extends its existing generated-file and
  verification-command evidence matching to the capability's target/command
  expectations when a full-stack run is detected, and additionally requires
  distinct evidence for PostgreSQL health, application liveness, and
  application/database readiness -- one cannot substitute for another. This
  is the same readiness computation `status`, `check`/`check --all`, and
  final-report eligibility all consume; there is no duplicate readiness
  subsystem.
- The orchestrator continues to prepare, contract, and validate artifacts and
  prompts only. It does not build the generated project, run Docker, or
  execute PostgreSQL/Prisma/database commands itself; every command in a
  full-stack scaffold plan is descriptive guidance for the coding agent, as
  with every other profile's commands.

### v1.3.3 generated-project instruction and Python additions

The files `agents.txt`, `claude.txt`, `AGENTS.md`, and `CLAUDE.md` are required
generated-project outputs for current-format greenfield runs. They are not
native stage artifacts, do not add stages or lifecycle files, and are not part
of the 15-file canonical public project-document registry. Their in-memory
bundle is owned by `src/greenfield/bootstrap/projectInstructions/`.

`src/greenfield/scaffold/effectiveTargetExpectations.ts` composes their common
exact expectations with the selected profile and optional compatible
capability. Consequently the existing `Target paths:` and `Files changed:`
evidence and filesystem corroboration require them without a new artifact
schema or readiness engine. `python-cli` adds only its four profile-owned
targets (`pyproject.toml`, `src/main.py`, `tests/test_main.py`, `README.md`) and
its profile-owned command guidance. Older evidence remains governed by the
legacy rule above.

## Extraction mode artifacts

Extraction mode is implemented in `v0.2.1`.

All extraction artifacts live under:

```text
<target-repo-root>/.my-dev-kit-orchestrator/runs/<run-id>/artifacts/
```

Five pre-implementation analysis stages produce these six extraction gate
artifact files. The `porting-map` stage produces both items 3 and 4:

1. `artifacts/source-architecture-context-packet.txt`
2. `artifacts/source-workflow-map.txt`
3. `artifacts/source-to-target-porting-map.txt`
4. `artifacts/do-not-port-list.txt`
5. `artifacts/golden-behavior-contract.txt`
6. `artifacts/target-architecture-proposal.txt`

No production implementation should begin before all six artifacts exist.

### SourceArchitectureContextPacket

**Path:** `artifacts/source-architecture-context-packet.txt`

**Purpose:** Synthesize graph-guided workflow inspection evidence from the source repository before the source workflow map and source-to-target porting analysis begin.

**Produced by:** `source-architecture-context`

**Supporting report:** `reports/source-architecture-context-retrieval-report.txt`

**Used by:** `source-workflow-map`, `porting-map`, `golden-behavior-contract`

### SourceWorkflowMap

**Path:** `artifacts/source-workflow-map.txt`

**Purpose:** Describe how the workflow currently works in the source repository. This artifact documents evidence, not porting decisions.

**Produced by:** `source-workflow-map`

**Used by:** `porting-map`, `golden-behavior-contract`, `target-architecture`

**Required sections:**

- Source repo path
- Workflow entry point
- User-facing steps
- Frontend components
- Frontend state owners
- API routes
- Backend services
- Data contracts
- Persistence dependencies
- External service dependencies
- Tests found
- Known behavior risks
- Ambiguous or missing context

### SourceToTargetPortingMap

**Path:** `artifacts/source-to-target-porting-map.txt`

**Purpose:** Classify each source subsystem as reusable, refactorable, rewritable, discardable, or postponed. Record the reason for each decision.

**Produced by:** `porting-map`

**Used by:** `golden-behavior-contract`, `target-architecture`, `judge`

**Required structure for each item:**

- Source behavior
- Source files or symbols
- Target behavior
- Target module or component
- Decision: port as-is / port with refactor / rewrite cleanly / discard / postpone
- Reason
- Required tests
- Risks

### DoNotPortList

**Path:** `artifacts/do-not-port-list.txt`

**Purpose:** Prevent accidental transfer of unrelated source architecture into the target project.

**Produced by:** `porting-map`

**Used by:** `target-architecture`, `implementation`, `judge`

**Required sections:**

- Systems excluded from the target project
- UI labels excluded from the target project
- Backend routes excluded from the target project
- Persistence layers excluded from the target project
- Downstream workflows excluded from the target project
- Reason each exclusion exists
- Consequences if accidentally ported

### GoldenBehaviorContract

**Path:** `artifacts/golden-behavior-contract.txt`

**Purpose:** Define the exact behavior the target implementation must satisfy. This is the primary source of truth for the target implementation and the judge stage.

**Produced by:** `golden-behavior-contract`

**Used by:** `target-architecture`, `behavior-model`, `pseudocode-packet`, `test-strategy`, `judge`

**Required sections:**

- User-visible behavior
- API behavior
- State behavior
- Sorting and ranking behavior
- Pagination behavior
- Selection behavior
- Error and empty-state behavior
- Edge cases
- Non-negotiable regression tests
- Acceptance criteria

The GoldenBehaviorContract is mandatory before `pseudocode-packet` and `test-strategy`.

### TargetArchitectureProposal

**Path:** `artifacts/target-architecture-proposal.txt`

**Purpose:** Describe the clean target architecture before implementation begins.

**Produced by:** `target-architecture`

**Used by:** `behavior-model`, `pseudocode-packet`, `implementation`, `judge`

**Required sections:**

- Target repo path
- Target project purpose
- Target workflow
- Frontend components
- Backend services
- API routes
- Shared contracts
- State ownership
- Persistence policy
- External dependencies
- Testing strategy overview
- Source components reused
- Source components rewritten
- Source components discarded
- Architecture guardrails

## Instruction packets and supplemental context files

### Instruction-packet sidecars

Every native stage prompt has one sibling `*.instruction-packet.json` file.
The path is derived by replacing the `*.prompt.txt` suffix with
`*.instruction-packet.json`. Each sidecar uses
`WorkflowInstructionPacket` schema `1.0.0` and deterministic canonical JSON.

Sidecars contain catalog-owned instruction content only. They contain no
run-specific paths, repository context, context-readiness state, or timestamps.
They are not native artifacts, do not appear in `run.json` or
`artifact-state.json`, are not mark targets, and do not participate in
lifecycle progression.

### Fixed supplemental context files

Context-sensitive modes create these fixed run files as templates:

- `artifacts/implementation-context-packet.txt`
- `reports/implementation-context-retrieval-report.txt`
- `artifacts/test-context-packet.txt`
- `reports/test-context-retrieval-report.txt`

The mode matrix is:

| Mode | Implementation packet/report | Test packet/report |
| --- | --- | --- |
| `feature` | yes | yes |
| `repair` | yes | yes |
| `test` | no | yes |
| `refactor` | yes | yes |
| `harden` | yes | yes |
| `extraction` | yes, with source-target scope | yes, with source-target scope |
| `greenfield` | no | no |

Supplemental context packets and retrieval reports each use schema `1.0.0`.
Their required metadata identifies schema version, document kind, role,
template/populated status, repository scope, freshness, adequacy, truncation,
tool/index identity, and raw-evidence references. Populated documents use
required headings for bounded repository evidence, warnings, gaps, and
responsibility mappings where applicable. References identify the raw
context-capsule, raw retrieval-audit record, and after-index evidence; full raw
evidence is not copied into the supplemental document model.

These supplemental files are run files, not native stage artifacts. They are
not mark targets and do not affect native lifecycle state: editing them does
not mark artifacts stale, deletion creates no artifact-state transition, and
they do not appear as lifecycle stages. They can affect context readiness,
prompt rendering, `check` results, and exported readiness summaries.

`export` includes a structured readiness summary. A blocked context includes
its canonical `contextKind`, `primaryCode`, `primaryReason`,
`correctiveAction`, `evidenceTarget`, `blockingIssueCodes`, and
`supportingIssueCodes`; a ready context has no primary blocker. The export does
not embed complete raw capsule or audit contents and does not copy referenced
external evidence files merely because a supplemental document names them.

## Shared completion expectations

- Most native artifacts are plain text; the three greenfield JSON contracts
  named above are structured JSON.
- The CLI applies the registered format-specific contract for each artifact;
  valid JSON syntax alone is not sufficient for a structured artifact.
- `reports/architecture-context-retrieval-report.txt` and `reports/source-architecture-context-retrieval-report.txt` are supporting evidence for context acquisition.
- `artifacts/architecture-context-packet.txt` and `artifacts/source-architecture-context-packet.txt` are required downstream workflow artifacts.
- later stages should consume the synthesized architecture packets rather than raw `my-dev-kit` output
- the pseudocode packet is the shared design source for implementation and test implementation
- the test strategy packet is the source for test implementation
- verification and final report artifacts should contain command evidence and unresolved risks, but the CLI does not enforce that automatically
- (`v1.2.3`) `final-report.txt` existing, an `artifact-state.json` `complete` record, or structurally valid content is not sufficient by itself: a normal final report additionally requires an accepted `PASS` judge verdict, no active correction route, and every required prior artifact complete under the same gate-aware lifecycle rules; a manual `mark final-report.txt --state complete` is rejected before any mutation when that eligibility is not met
- (`v1.2.3`) the same rule applies to the repository-context-sensitive `implementation`/`test-implementation` artifacts: their file existing or carrying a manual `complete` record does not advance the run while required repository context remains refresh-required
