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

## Extraction

Use `extraction` when you want to transfer a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository.

This mode is not for normal feature implementation. It is for inspecting an existing source project, identifying the useful behavior, discarding unrelated architecture, preserving critical behavior, and implementing a cleaner version in the target project.

**Implemented in v0.2.1.**

### Purpose

- source repository: used for inspection and evidence only; treated as read-only by default
- target repository: where the extracted workflow is implemented, tested, verified, and reported
- the orchestrator must not assume the target should inherit the full source architecture

### Command

```bash
npx my-dev-kit-orchestrator start --mode extraction \
  --source "<source-repo-root>" \
  --target "<target-repo-root>" \
  "<extraction request>"
```

Windows example:

```powershell
npx my-dev-kit-orchestrator start --mode extraction `
  --source "Z:\Users\newuser\Projects\scientific-literature-explorer-v1" `
  --target "Z:\Users\newuser\Projects\biolit-neighborhoods" `
  "Extract search, ranked results, pagination, paper selection, evidence-set construction, and semantic paper-neighborhood workflow."
```

### Stage order

1. `request-brief`
2. `source-architecture-context`
3. `source-workflow-map`
4. `porting-map`
5. `golden-behavior-contract`
6. `target-architecture`
7. `behavior-model`
8. `pseudocode-packet`
9. `test-strategy`
10. `implementation`
11. `test-implementation`
12. `verification`
13. `judge`
14. `final-report`

### Stage behavior

**request-brief**

Capture the source repository path, target repository path, workflow to extract, desired target scope, features excluded from the extraction, critical behaviors to preserve, and expected deliverables.

**source-architecture-context**

Use `my-dev-kit` on the source repository. Index the source repository into its own `.my-dev-kit` directory:

```bash
npx @dailephd/my-dev-kit index --root <source-repo-root> --out <source-repo-root>/.my-dev-kit
```

Do not use target repository indexing to infer source behavior. Source and target indices must stay separate.

**source-workflow-map**

Write `artifacts/source-workflow-map.txt`. This stage describes what exists in the source repository. It does not decide what to port yet.

**porting-map**

Write `artifacts/source-to-target-porting-map.txt` and `artifacts/do-not-port-list.txt`. Classify each source subsystem as reusable, refactorable, rewritable, discardable, or postponed. Explicitly list systems that must not be ported.

**golden-behavior-contract**

Write `artifacts/golden-behavior-contract.txt`. Define the exact behavior the target implementation must satisfy. No production implementation should begin before this artifact exists.

**target-architecture**

Write `artifacts/target-architecture-proposal.txt`. If the target repository already exists, use `my-dev-kit` to inspect it. If the target repository does not exist yet, define the planned structure and contracts before scaffolding.

**behavior-model**

Write a behavior model for the target system using the golden behavior contract as the primary source of truth.

**pseudocode-packet**

Write pseudocode for the target implementation. The pseudocode must map to the target architecture, not the source architecture.

**test-strategy**

Write the test strategy before any test implementation begins. Include:
- contract tests
- backend unit tests
- frontend component tests
- state behavior tests
- integration tests
- E2E tests for the full extracted workflow
- regression tests for every golden behavior item

**implementation**

Implement the extracted workflow in the target repository only. Do not modify the source repository unless the user explicitly permits it.

**test-implementation**

Add or update tests in the target repository.

**verification**

Run actual target project validation commands. Record results.

**judge**

Compare the target implementation against:
- request brief
- source workflow map
- source-to-target porting map
- do-not-port list
- golden behavior contract
- target architecture proposal
- behavior model
- pseudocode packet
- test strategy
- verification report

**final-report**

Summarize:
- extracted workflow
- source repository inspected
- target repository modified
- source components reused
- source components rewritten
- source components discarded
- tests added
- validation results
- judge result
- remaining risks

### Source and target repository responsibilities

| Responsibility | Source repository | Target repository |
|---|---|---|
| Graph-guided inspection | ✓ | — |
| Index artifacts | `<source>/.my-dev-kit` | `<target>/.my-dev-kit` |
| Orchestrator run workspace | — | `<target>/.my-dev-kit-orchestrator/runs/<run-id>/` |
| Porting analysis | input | output |
| Implementation | read-only evidence | ✓ implementation happens here |
| Testing | — | ✓ |
| Verification | — | ✓ |
| Reports | — | ✓ |

### Extraction guardrails

- The source repository is evidence, not destiny. Do not port code just because it exists.
- Do not create a second copy of the old architecture inside the target project.
- Do not port authentication, persistence, workspaces, database schema, background jobs, or downstream workflows unless explicitly in scope.
- Do not preserve old UI labels if they conflict with the new workflow.
- Do not implement before all five extraction artifacts are complete.
- Do not mark the run as passed unless the judge report confirms that the target implementation satisfies the golden behavior contract.
- Modify only the target repository unless the user explicitly permits source repository changes.

---

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
