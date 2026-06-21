# Artifacts

Artifacts are plain-text handoff files stored in each run folder.

`v0.1.0` uses artifact file existence, not schema-heavy validation, to determine workflow progress.

## Run layout

```text
.my-dev-kit-orchestrator/runs/<run-id>/
  00-request.txt
  run.json
  prompts/
  artifacts/
  reports/
```

The important folder for stage advancement is:

```text
.my-dev-kit-orchestrator/runs/<run-id>/artifacts/
```

## How stage advancement works

For the selected workflow, the CLI checks stage order from first to last.

Rule used in `v0.1.0`:

- if the expected artifact file for a stage is missing, that stage is the next stage
- if all expected artifact files exist, the run is treated as complete

That means the workflow advances when the artifact file exists at the expected path.

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

Prompt files are generated alongside them:

1. `prompts/01-request-brief.prompt.txt`
2. `prompts/02-architecture-context.prompt.txt`
3. `prompts/03-behavior-model.prompt.txt`
4. `prompts/04-pseudocode-packet.prompt.txt`
5. `prompts/05-test-strategy.prompt.txt`
6. `prompts/06-implementation.prompt.txt`
7. `prompts/07-test-implementation.prompt.txt`
8. `prompts/08-verification.prompt.txt`
9. `prompts/09-judge.prompt.txt`
10. `prompts/10-final-report.prompt.txt`

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

## Artifact expectations in v0.1.0

- Artifacts are plain text.
- The CLI does not validate artifact contents against JSON schemas.
- The pseudocode packet is the shared design source for implementation and test implementation.
- The test strategy packet is the source for test implementation.
- Verification and final report artifacts should contain command evidence and unresolved risks, but `v0.1.0` does not enforce that automatically.
