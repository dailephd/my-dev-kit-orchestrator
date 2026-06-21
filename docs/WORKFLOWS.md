# Workflows

`my-dev-kit-orchestrator` supports five workflow modes in `v0.1.0`.

Each workflow uses a fixed ordered stage list. The CLI advances by checking whether the expected artifact file for a stage exists.

The intended design-to-code flow is:

`request -> graph-guided architecture context -> ArchitectureContextPacket -> BehaviorModel -> PseudocodePacket -> TestStrategyPacket -> ImplementationReport -> TestImplementationReport -> VerificationReport -> JudgeReport -> FinalReport`

In this model, `my-dev-kit` is used during context acquisition and `my-dev-kit-orchestrator` manages the downstream workflow after the synthesized ArchitectureContextPacket is saved.

## Feature

Use `feature` for new behavior or intentional behavior changes.

Command:

```bash
my-dev-kit-orchestrator start --mode feature "<request>"
```

Default form:

```bash
my-dev-kit-orchestrator start "<request>"
```

Stage order:

1. `request-brief`
2. `architecture-context`
3. `behavior-model`
4. `pseudocode-packet`
5. `test-strategy`
6. `implementation`
7. `test-implementation`
8. `verification`
9. `judge`
10. `final-report`

## Repair

Use `repair` when observed behavior diverges from intended behavior.

Command:

```bash
my-dev-kit-orchestrator start --mode repair "<observed behavior>"
```

Stage order:

1. `observed-behavior-report`
2. `architecture-context`
3. `behavior-trace`
4. `divergence-report`
5. `correction-design`
6. `regression-test-strategy`
7. `implementation`
8. `test-implementation`
9. `verification`
10. `judge`
11. `final-report`

## Test

Use `test` for behavior-derived test planning or test implementation for existing behavior.

Command:

```bash
my-dev-kit-orchestrator start --mode test "<test target>"
```

Stage order:

1. `test-target-brief`
2. `architecture-context`
3. `behavior-reconstruction`
4. `pseudocode-summary`
5. `test-strategy`
6. `test-implementation`
7. `verification`
8. `judge`
9. `final-report`

## Refactor

Use `refactor` for structure changes that must preserve behavior.

Command:

```bash
my-dev-kit-orchestrator start --mode refactor "<refactor goal>"
```

Stage order:

1. `refactor-brief`
2. `architecture-context`
3. `existing-behavior-map`
4. `preserved-invariant-list`
5. `compatibility-test-strategy`
6. `refactor-pseudocode-packet`
7. `implementation`
8. `test-implementation`
9. `verification`
10. `judge`
11. `final-report`

## Harden

Use `harden` for validation, resilience, and failure-handling improvements.

Command:

```bash
my-dev-kit-orchestrator start --mode harden "<hardening goal>"
```

Stage order:

1. `hardening-brief`
2. `architecture-context`
3. `assumption-report`
4. `failure-mode-matrix`
5. `guard-pseudocode-packet`
6. `resilience-test-strategy`
7. `implementation`
8. `test-implementation`
9. `verification`
10. `judge`
11. `final-report`

## Shared workflow rules

- The CLI generates one prompt file per stage when a run starts.
- `prompt` without a stage selects the first stage whose expected artifact file is missing.
- `prompt <stage>` requires prior stage artifacts to exist.
- The implementation and test-implementation stages are meant to consume the same design context rather than reinterpret the request independently.
- `v0.1.0` does not execute a coding agent or `my-dev-kit` automatically.

## Practical architecture-context flow

For an architecture-context stage, a task-specific coding-agent prompt can combine both tools in a bounded sequence:

1. run `my-dev-kit` retrieval commands to gather project context
2. write `reports/architecture-context-retrieval-report.txt`
3. write `artifacts/architecture-context-packet.txt`
4. continue the orchestrator workflow with the synthesized architecture context

This is intentionally prompt-driven rather than rigid. ChatGPT can tailor the architecture-context prompt to the project, change request, and available retrieval evidence without changing the orchestrator command surface.
