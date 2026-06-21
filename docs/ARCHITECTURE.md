# Architecture

`my-dev-kit-orchestrator` is a CLI-first workflow tool for design-first software development with coding agents.

Version `0.1.0` focuses on workflow orchestration, prompt generation, and artifact handoff. It creates local workflow runs, writes stage-specific prompts, tracks expected artifacts, and prints the next prompt for the active stage. It does not execute an LLM directly.

Version `0.2.0` extends the architecture-context stage prompt with full graph-guided retrieval guidance and adds supporting report visibility to the `status` command.

## Architecture overview

The released architecture has four main responsibilities:

- define the workflow mode and ordered stages for each run
- create and manage the local run workspace
- generate stage-specific prompt files
- detect workflow progress from expected artifact files

The CLI is intentionally small. It does not try to become a general automation platform, a task runner, or an autonomous multi-agent system in `v0.1.0`.

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

Some generated prompts may recommend using `my-dev-kit` for graph-guided architecture context acquisition when that tool is available. `my-dev-kit-orchestrator` does not execute `my-dev-kit` automatically in `v0.1.0`.

## CLI command layer

The public command surface in `v0.1.0` is:

- `init`
- `start`
- `status`
- `prompt`
- `list`

These commands cover workspace setup, run creation, prompt retrieval, run inspection, and run listing. The release does not expose a larger set of low-level workflow management commands.

## Workflow mode layer

`my-dev-kit-orchestrator` ships with five workflow modes:

- `feature`
- `repair`
- `test`
- `refactor`
- `harden`

Each mode has a fixed stage sequence and a corresponding ordered list of expected artifact files. The CLI uses those definitions as the source of truth for prompt generation and stage advancement.

Examples:

- `feature` moves from request framing through architecture context, behavior modeling, pseudocode, test strategy, implementation, test implementation, verification, judge, and final report
- `repair` adds divergence analysis and correction design before implementation
- `test` focuses on behavior reconstruction and test implementation without a production implementation stage
- `refactor` preserves behavior through invariant and compatibility stages
- `harden` emphasizes assumptions, failure modes, guards, and resilience testing

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
- `reports/` is reserved for report-oriented outputs and future expansion

This storage model is local by design. Run workspaces are meant to support an iterative development flow without adding generated workflow state to the source repository.

## Prompt generation architecture

Prompt generation is stage-specific.

Instead of producing one large master prompt, the CLI generates one prompt per stage. Each prompt is scoped to the current stage and includes the information needed to complete only that stage. In `v0.1.0`, that typically means:

- the current stage name
- the required inputs from prior artifacts
- the task to perform now
- the expected output artifact
- stop conditions
- the required return format

This design helps enforce workflow gates. A prompt tells the coding agent what belongs in the current stage and what should wait for a later stage. That prevents early implementation, premature test claims, or mixed-stage outputs from becoming the default workflow behavior.

For architecture-context work, the prompt guides the coding agent through graph-guided context acquisition with `my-dev-kit`. The prompt includes the full retrieval sequence (index, search, lookup, slice, symbol source retrieval), the retrieval evidence report template, and the ArchitectureContextPacket template. It instructs the coding agent to synthesize retrieval evidence into the artifact rather than dumping raw output. If `my-dev-kit` is unavailable, the prompt guides the coding agent to use focused manual inspection instead.

## Graph-guided architecture context

The architecture-context stage is the main point where `my-dev-kit` and `my-dev-kit-orchestrator` meet.

When `my-dev-kit` is available, the stage should use retrieval evidence from indexing, search, lookup, slice generation, source retrieval, and optional semantic inspection to build a bounded architecture view for the requested change.

This stage has two outputs:

- supporting report: `reports/architecture-context-retrieval-report.txt`
- required workflow artifact: `artifacts/architecture-context-packet.txt`

The retrieval report records what was retrieved and how that context was gathered. The ArchitectureContextPacket is the synthesized design input that later stages consume.

## Retrieval evidence report

The retrieval report is supporting evidence for the architecture-context stage.

Recommended contents:

- index artifacts used
- whether the index was refreshed or reused
- manifest status
- search queries run
- candidate nodes selected
- lookup commands run
- graph slices created
- source symbols retrieved
- line-range fallback retrieval used
- full files read beyond retrieved source
- semantic artifacts inspected
- context gaps or uncertainty

This report helps reviewers understand why the downstream ArchitectureContextPacket was assembled the way it was.

## ArchitectureContextPacket synthesis

Raw retrieval output should not be copied directly into `artifacts/architecture-context-packet.txt`.

The ArchitectureContextPacket should synthesize retrieval evidence into a design-oriented handoff that later stages can use. In practice, that means summarizing:

- relevant files
- relevant symbols
- relevant components, modules, commands, routes, services, or boundaries
- relevant tests
- relevant docs
- state owners
- data owners
- upstream dependencies
- downstream consumers
- existing patterns to preserve
- likely files or modules involved
- context gaps or uncertainty
- selection rationale
- expected next stage

## Artifact handoff architecture

Artifacts are plain-text files in `v0.1.0`.

Each stage produces one expected artifact file. The next stage consumes the request, prior artifacts, or both. The CLI does not parse a heavy structured schema to decide whether a stage is complete. It uses file existence at the expected path.

That handoff model keeps the workflow simple:

- stage output is saved to `artifacts/<name>.txt`
- supporting retrieval evidence can be saved to `reports/architecture-context-retrieval-report.txt`
- the next stage prompt is generated from the workflow definition and prior context
- the CLI advances when the expected artifact file exists

Two artifact relationships matter especially in the current release:

- the ArchitectureContextPacket is the synthesized downstream input for behavior modeling and later design stages
- the pseudocode packet is the shared design source for implementation and test implementation
- the test strategy packet is the source for test implementation

Verification and final report artifacts are expected to include command evidence and unresolved risks, but the CLI does not enforce content validation automatically in `v0.1.0`.

## Stage gate model

The workflow definitions establish practical gates between design, implementation, and verification work.

Important gates include:

- no architecture-context packet without synthesizing the available retrieval evidence
- no pseudocode before a behavior model or equivalent behavior analysis stage exists
- no production implementation before the pseudocode packet or mode-specific implementation design exists
- no test implementation before the test strategy packet or mode-specific test strategy exists
- no completion claim without verification evidence
- no `PASS` outcome without judge support

These gates are enforced through ordered stages, expected artifact names, and stage-specific prompt instructions rather than through a large validation engine.

## Relationship to my-dev-kit

`my-dev-kit` and `my-dev-kit-orchestrator` solve different problems.

`my-dev-kit` is intended for code indexing, symbol lookup, and graph-guided retrieval. `my-dev-kit-orchestrator` is responsible for workflow orchestration, stage prompting, and artifact handoff between bounded stages of work.

In the intended design, a task-specific prompt directs the coding agent to use `my-dev-kit` for context acquisition, record supporting retrieval evidence, and synthesize an ArchitectureContextPacket. `my-dev-kit-orchestrator` then manages the downstream workflow through behavior modeling, pseudocode, testing, implementation, verification, judging, and final reporting.

In `v0.1.0`, that relationship is still prompt-driven rather than automatic. The CLI does not invoke `my-dev-kit` directly.

## v0.1.0 non-goals

Version `0.1.0` does not include:

- direct LLM execution
- automatic `my-dev-kit` execution
- automatic provider integration
- full JSON schema validation
- automatic judge routing
- design-map generation
- autonomous multi-agent execution
- a large low-level command surface
- low-level retrieval commands inside `my-dev-kit-orchestrator`

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
