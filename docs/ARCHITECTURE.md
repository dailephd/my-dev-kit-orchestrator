# Architecture

`my-dev-kit-orchestrator` is a CLI-first workflow tool for design-first software development with coding agents.

`v0.1.0` established the workflow shell. `v0.2.0` added graph-guided architecture context support. `v0.2.1` adds extraction mode and cross-platform validation across Ubuntu, Windows, and macOS.

## Architecture overview

The released architecture has five main responsibilities:

- define the workflow mode and ordered stages for each run
- create and manage the local run workspace
- generate stage-specific prompt files
- detect workflow progress from expected artifact files
- keep source-repository evidence and target-repository implementation responsibilities separate in extraction mode

The CLI is intentionally small. It does not try to become a general automation platform, a task runner, or an autonomous multi-agent system.

## Tool responsibilities

The intended design uses four cooperating roles:

- ChatGPT writes task-specific coding-agent prompts for the requested software change
- `my-dev-kit` performs graph-guided code retrieval and produces retrieval evidence
- `my-dev-kit-orchestrator` stores synthesized architecture context and manages downstream workflow stages
- the coding agent executes the prompt, runs commands, writes artifacts, implements changes, and verifies results

This split keeps retrieval, workflow control, and implementation work clearly separated.

## System boundaries

The system boundary is straightforward:

- the user starts and advances workflow runs
- the CLI owns mode selection, run metadata, stage ordering, prompt generation, artifact naming, and next-stage detection
- a coding agent works outside the CLI by consuming the generated prompt, using `my-dev-kit` when needed, and writing the requested artifacts
- artifacts carry context from one stage to the next

Some generated prompts may recommend using `my-dev-kit` for graph-guided architecture context acquisition when that tool is available. `my-dev-kit-orchestrator` does not execute `my-dev-kit` automatically.

## CLI command layer

The public command surface is:

- `init`
- `start`
- `status`
- `prompt`
- `list`

These commands cover workspace setup, run creation, prompt retrieval, run inspection, and run listing. The release does not expose a larger set of low-level workflow management commands.

## Workflow mode layer

`my-dev-kit-orchestrator` ships with six workflow modes:

- `feature`
- `repair`
- `test`
- `refactor`
- `harden`
- `extraction`

Each mode has a fixed stage sequence and a corresponding ordered list of expected artifact files. The CLI uses those definitions as the source of truth for prompt generation and stage advancement.

Examples:

- `feature` moves from request framing through architecture context, behavior modeling, pseudocode, test strategy, implementation, test implementation, verification, judge, and final report
- `repair` adds divergence analysis and correction design before implementation
- `test` focuses on behavior reconstruction and test implementation without a production implementation stage
- `refactor` preserves behavior through invariant and compatibility stages
- `harden` emphasizes assumptions, failure modes, guards, and resilience testing
- `extraction` adds source-repository inspection, source workflow mapping, source-to-target porting analysis, a do-not-port gate, a golden behavior contract, and a target architecture proposal before implementation begins

## Run workspace and storage model

Each run lives under a local workspace:

```text
.my-dev-kit-orchestrator/
  config.json
  runs/
    <run-id>/
      00-request.txt
      run.json
      prompts/
      artifacts/
      reports/
```

Important files and folders:

- `00-request.txt` stores the original request passed to `start`
- `run.json` stores run metadata, selected mode, and ordered stage definitions
- `prompts/` contains generated stage prompt files
- `artifacts/` contains the plain-text outputs produced for each stage
- `reports/` is reserved for report-oriented outputs and supporting retrieval evidence

For non-extraction modes, the workspace lives under the selected project root. For extraction mode, the workspace lives under the target repository by default:

```text
<target-repo-root>/.my-dev-kit-orchestrator/runs/<run-id>/
```

This storage model is local by design. Run workspaces are meant to support an iterative development flow without adding generated workflow state to the source repository.

## Prompt generation architecture

Prompt generation is stage-specific.

Instead of producing one large master prompt, the CLI generates one prompt per stage. Each prompt is scoped to the current stage and includes the information needed to complete only that stage. That typically means:

- the current stage name
- the required inputs from prior artifacts
- the task to perform now
- the expected output artifact
- stop conditions
- the required return format

This design helps enforce workflow gates. A prompt tells the coding agent what belongs in the current stage and what should wait for a later stage. That prevents early implementation, premature test claims, or mixed-stage outputs from becoming the default workflow behavior.

For architecture-context work, the prompt guides the coding agent through graph-guided context acquisition with `my-dev-kit`. The prompt includes the full retrieval sequence, a retrieval evidence report template, and an ArchitectureContextPacket template. It instructs the coding agent to synthesize retrieval evidence into the artifact rather than dumping raw output. If `my-dev-kit` is unavailable, the prompt guides the coding agent to use focused manual inspection instead.

Extraction mode extends that architecture with extraction-specific prompt families for all 14 stages, including source-repository evidence gathering, source-to-target porting analysis, and target-side implementation guardrails.

## Graph-guided architecture context

The architecture-context stage is the main point where `my-dev-kit` and `my-dev-kit-orchestrator` meet.

When `my-dev-kit` is available, the stage should use retrieval evidence from indexing, search, lookup, slice generation, source retrieval, and optional semantic inspection to build a bounded architecture view for the requested change.

This stage has two outputs:

- supporting report: `reports/architecture-context-retrieval-report.txt`
- required workflow artifact: `artifacts/architecture-context-packet.txt`

The retrieval report records what was retrieved and how that context was gathered. The ArchitectureContextPacket is the synthesized design input that later stages consume.

Extraction mode uses the same pattern for `source-architecture-context`, with:

- supporting report: `reports/source-architecture-context-retrieval-report.txt`
- required workflow artifact: `artifacts/source-architecture-context-packet.txt`

## Artifact handoff architecture

Artifacts are plain-text files.

Each stage produces one expected artifact file, except `porting-map`, which produces both:

- `artifacts/source-to-target-porting-map.txt`
- `artifacts/do-not-port-list.txt`

The next stage consumes the request, prior artifacts, or both. The CLI does not parse a heavy structured schema to decide whether a stage is complete. It uses required artifact existence at the expected paths.

That handoff model keeps the workflow simple:

- stage output is saved to `artifacts/<name>.txt`
- supporting retrieval evidence can be saved to `reports/<name>.txt`
- the next stage prompt is generated from the workflow definition and prior context
- the CLI advances when the expected artifact files exist

Two artifact relationships matter especially in the current release:

- the ArchitectureContextPacket is the synthesized downstream input for behavior modeling and later design stages
- the SourceWorkflowMap and SourceToTargetPortingMap are evidence and scoping inputs for extraction-mode design
- the GoldenBehaviorContract is the required target behavior source of truth before pseudocode and test strategy
- the TargetArchitectureProposal defines the clean target structure before implementation begins
- the pseudocode packet is the shared design source for implementation and test implementation
- the test strategy packet is the source for test implementation

Verification and final report artifacts are expected to include command evidence and unresolved risks, but the CLI does not enforce content validation automatically.

## Stage gate model

The workflow definitions establish practical gates between design, implementation, and verification work.

Important gates include:

- no architecture-context packet without synthesizing the available retrieval evidence
- no pseudocode before a behavior model or equivalent behavior analysis stage exists
- no production implementation before the pseudocode packet or mode-specific implementation design exists
- no test implementation before the test strategy packet or mode-specific test strategy exists
- no completion claim without verification evidence
- no `PASS` outcome without judge support

Extraction mode adds additional pre-implementation gates:

- no implementation before `source-architecture-context-packet.txt` exists
- no implementation before `source-workflow-map.txt` exists
- no implementation before both `source-to-target-porting-map.txt` and `do-not-port-list.txt` exist
- no implementation before `golden-behavior-contract.txt` exists
- no implementation before `target-architecture-proposal.txt` exists

These gates are enforced through ordered stages, expected artifact names, and stage-specific prompt instructions rather than through a large validation engine.

## Extraction mode architecture

Extraction mode is implemented in `v0.2.1`.

### Why extraction mode is different from feature mode

`feature` mode assumes one project. The coding agent inspects the current project, models behavior, writes pseudocode, and implements the change in the same repository.

`extraction` mode assumes two project roles. The coding agent inspects an existing source repository for evidence, decides what behavior to port and what to discard, and implements the extracted workflow in a separate target repository.

The key constraint: the orchestrator must not assume that the target repository should inherit the source architecture wholesale. The purpose is to extract desired behavior into a clean target implementation.

### Two-repo model

In extraction mode, the user provides two repository paths:

- `--source <source-repo-root>`: the existing project used for inspection and porting analysis. Treated as read-only evidence by default.
- `--target <target-repo-root>`: the project where the extracted workflow will be implemented, tested, verified, and reported.

All implementation work happens in the target repository. The source repository is used only for graph-guided workflow inspection and porting analysis.

### Source repository as read-only evidence

The source repository should not be modified during an extraction run unless the user explicitly overrides that restriction.

Its role is to:

- provide source context through graph-guided workflow inspection
- supply evidence for the SourceWorkflowMap and SourceToTargetPortingMap
- feed the GoldenBehaviorContract via behavior analysis

The coding agent should index the source repository into its own `.my-dev-kit` directory and use retrieval results as evidence, not as a design template to copy.

### Target repository as implementation destination

The target repository is where all implementation, testing, verification, and reporting happens.

The orchestrator run workspace lives under the target repository by default:

```text
<target-repo-root>/.my-dev-kit-orchestrator/runs/<run-id>/
```

If the target repository does not exist yet, the orchestrator requires the user to initialize it before starting an extraction run. Automatic target creation is not implemented in the current release.

### Source and target index separation

Source and target repositories each use their own `.my-dev-kit` index directory.

```text
<source-repo-root>/.my-dev-kit
<target-repo-root>/.my-dev-kit
```

The coding agent must index the source repository separately from the target repository. Mixing source and target retrieval results would undermine the porting analysis.

### Extraction artifacts as pre-implementation gates

Six extraction-specific artifacts must be produced before any production implementation can begin in the target repository:

1. `SourceArchitectureContextPacket`
2. `SourceWorkflowMap`
3. `SourceToTargetPortingMap`
4. `DoNotPortList`
5. `GoldenBehaviorContract`
6. `TargetArchitectureProposal`

No production implementation should start before all six artifacts are complete.

### Golden behavior contract as target behavior source of truth

The GoldenBehaviorContract is the central gate in the extraction workflow. It defines the behavior the target implementation must satisfy, independently of how the source implementation achieved that behavior.

The judge stage at the end of the extraction workflow compares the target implementation against the GoldenBehaviorContract, not against the source implementation directly.

## Relationship to my-dev-kit

`my-dev-kit` and `my-dev-kit-orchestrator` solve different problems.

`my-dev-kit` is intended for code indexing, symbol lookup, and graph-guided retrieval. `my-dev-kit-orchestrator` is responsible for workflow orchestration, stage prompting, and artifact handoff between bounded stages of work.

In the intended design, a task-specific prompt directs the coding agent to use `my-dev-kit` for context acquisition, record supporting retrieval evidence, and synthesize the downstream architecture packet. `my-dev-kit-orchestrator` then manages the downstream workflow through behavior modeling, pseudocode, testing, implementation, verification, judging, and final reporting.

That relationship is still prompt-driven rather than automatic. The CLI does not invoke `my-dev-kit` directly.

## Non-goals

The current release does not include:

- direct LLM execution
- automatic `my-dev-kit` execution
- automatic provider integration
- full JSON schema validation
- automatic judge routing
- design-map generation
- autonomous multi-agent execution
- a large low-level command surface
- low-level retrieval commands inside `my-dev-kit-orchestrator`
- `--create-target`

Those exclusions are intentional. The release is designed to keep workflow logic clear, local, and easy to inspect.

## Future architecture direction

Possible future extensions:

- stronger artifact validation
- design-map generation
- deeper `my-dev-kit` integration
- optional provider integrations
- CI-friendly verification summaries
- richer run status and judge-outcome routing

These are possible directions, not current features.
