# Artifacts

Artifacts are plain-text handoff files stored in each run folder.

`my-dev-kit-orchestrator` uses artifact file existence and lifecycle state, not schema-heavy validation, to determine workflow progress.

## Run layout

```text
.my-dev-kit-orchestrator/runs/<run-id>/
  00-request.txt
  run.json
  artifact-state.json   ← added in v0.3.0
  prompts/
  artifacts/
  reports/
```

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

1. If state is `blocked` → `blocked` (even without artifact file)
2. If artifact file does not exist → `missing`
3. If state is `incomplete` → `incomplete`
4. If an upstream artifact was completed or modified after this artifact → `stale`
5. Otherwise → `complete`

### Stale detection

An artifact is stale when its completion time (from `updatedAt` in state record, or file `mtime` as fallback) is earlier than the completion time of any upstream required artifact.

Stale detection is deterministic and local. It does not inspect artifact content.

### Dependency model

Dependencies follow stage order: artifacts for stage N depend on artifacts from all prior required stages. Supporting reports (e.g., `reports/architecture-context-retrieval-report.txt`) do not create stale gates.

For extraction mode, the `porting-map` stage has two artifacts — `source-to-target-porting-map.txt` and `do-not-port-list.txt` — and both are treated as upstream for subsequent stages.

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

- `fail` — check found a definite problem; `check` exits 1
- `warn` — check found a possible problem; `check` exits 0 unless `--strict` is set
- `pass` — no issues found

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

**Produced by:** `design-map` stage

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

## Not implemented in v0.4.0

- design trace IDs (implemented in v0.5.0)
- full JSON schema validation or Zod/AJV enforcement
- LLM-based artifact judging or semantic artifact grading
- automatic artifact rewriting
- judge correction routing

## How stage advancement works

For the selected workflow, the CLI checks stage order from first to last.

Rules used in v0.4.0:

- if the effective lifecycle state of any stage artifact is not `complete`, that stage is the current stage
- if all artifacts are effectively `complete`, the run is complete
- **backward compatibility**: if `artifact-state.json` does not exist, file presence means `complete` and file absence means `missing`

Artifact content checks (`check` command) are a separate optional layer. They do not affect stage advancement — they report quality issues for human review.

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
