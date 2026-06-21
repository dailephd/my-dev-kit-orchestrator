# Architecture

`my-dev-kit-orchestrator` is a CLI-first workflow tool for design-first software development with coding agents.

Version `0.1.0` focuses on workflow orchestration, prompt generation, and artifact handoff. It creates local workflow runs, writes stage-specific prompts, tracks expected artifacts, and prints the next prompt for the active stage. It does not execute an LLM directly.

## Architecture overview

The released architecture has four main responsibilities:

- define the workflow mode and ordered stages for each run
- create and manage the local run workspace
- generate stage-specific prompt files
- detect workflow progress from expected artifact files

The CLI is intentionally small. It does not try to become a general automation platform, a task runner, or an autonomous multi-agent system in `v0.1.0`.

## System boundaries

The system boundary is straightforward:

- the user starts and advances workflow runs
- the CLI owns mode selection, run metadata, stage ordering, prompt generation, artifact naming, and next-stage detection
- a coding agent works outside the CLI by consuming the generated prompt and writing the requested artifact
- artifacts carry context from one stage to the next

Some generated prompts may recommend using `my-dev-kit` for code indexing or architecture lookup when that tool is available. `my-dev-kit-orchestrator` does not execute `my-dev-kit` automatically in `v0.1.0`.

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

## Artifact handoff architecture

Artifacts are plain-text files in `v0.1.0`.

Each stage produces one expected artifact file. The next stage consumes the request, prior artifacts, or both. The CLI does not parse a heavy structured schema to decide whether a stage is complete. It uses file existence at the expected path.

That handoff model keeps the workflow simple:

- stage output is saved to `artifacts/<name>.txt`
- the next stage prompt is generated from the workflow definition and prior context
- the CLI advances when the expected artifact file exists

Two artifact relationships matter especially in the current release:

- the pseudocode packet is the shared design source for implementation and test implementation
- the test strategy packet is the source for test implementation

Verification and final report artifacts are expected to include command evidence and unresolved risks, but the CLI does not enforce content validation automatically in `v0.1.0`.

## Stage gate model

The workflow definitions establish practical gates between design, implementation, and verification work.

Important gates include:

- no pseudocode before a behavior model or equivalent behavior analysis stage exists
- no production implementation before the pseudocode packet or mode-specific implementation design exists
- no test implementation before the test strategy packet or mode-specific test strategy exists
- no completion claim without verification evidence
- no `PASS` outcome without judge support

These gates are enforced through ordered stages, expected artifact names, and stage-specific prompt instructions rather than through a large validation engine.

## Relationship to my-dev-kit

`my-dev-kit` and `my-dev-kit-orchestrator` solve different problems.

`my-dev-kit` is intended for code indexing, symbol lookup, and graph-guided retrieval. `my-dev-kit-orchestrator` is responsible for workflow orchestration, stage prompting, and artifact handoff between bounded stages of work.

In `v0.1.0`, the relationship is advisory rather than automatic. Architecture-context prompts may mention `my-dev-kit`, but the CLI does not invoke it directly.

## v0.1.0 non-goals

Version `0.1.0` does not include:

- direct LLM execution
- automatic `my-dev-kit` execution
- full JSON schema validation
- automatic judge routing
- design-map generation
- autonomous multi-agent execution
- a large low-level command surface

Those exclusions are intentional. The release is designed to keep workflow logic clear, local, and easy to inspect.

## Future architecture direction

Future versions may extend the architecture in a few areas:

- stronger artifact validation
- design-map generation
- deeper `my-dev-kit` integration
- optional provider integrations
- CI-friendly verification summaries

These are possible directions, not implemented `v0.1.0` features.
