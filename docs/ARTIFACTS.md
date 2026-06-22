# Artifacts

Artifacts are plain-text handoff files stored in each run folder.

`my-dev-kit-orchestrator` uses artifact file existence, not schema-heavy validation, to determine workflow progress.

## Run layout

```text
.my-dev-kit-orchestrator/runs/<run-id>/
  00-request.txt
  run.json
  prompts/
  artifacts/
  reports/
```

For extraction mode, the run layout lives under the target repository:

```text
<target-repo-root>/.my-dev-kit-orchestrator/runs/<run-id>/
```

## How stage advancement works

For the selected workflow, the CLI checks stage order from first to last.

Rule used in the current release:

- if the expected artifact file for a stage is missing, that stage is the next stage
- if all expected artifact files exist, the run is treated as complete

That means the workflow advances when the artifact file exists at the expected path.

The release still uses file-existence checks, but the content expectations remain explicit so later stages receive a usable synthesized design input.

## Core feature-mode artifact files

Feature mode expects these artifact files in order:

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

## Extraction mode artifacts

Extraction mode is implemented in `v0.2.1`.

All extraction artifacts live under:

```text
<target-repo-root>/.my-dev-kit-orchestrator/runs/<run-id>/artifacts/
```

The six pre-implementation extraction gates are:

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

## Artifact expectations

- Artifacts are plain text.
- The CLI does not validate artifact contents against JSON schemas.
- `reports/architecture-context-retrieval-report.txt` and `reports/source-architecture-context-retrieval-report.txt` are supporting evidence for context acquisition.
- `artifacts/architecture-context-packet.txt` and `artifacts/source-architecture-context-packet.txt` are required downstream workflow artifacts.
- later stages should consume the synthesized architecture packets rather than raw `my-dev-kit` output
- the pseudocode packet is the shared design source for implementation and test implementation
- the test strategy packet is the source for test implementation
- verification and final report artifacts should contain command evidence and unresolved risks, but the CLI does not enforce that automatically
