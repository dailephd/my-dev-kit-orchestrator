# Roadmap

## Implemented in v0.1.0

`v0.1.0` is the workflow shell release.

Implemented:

- a small CLI command surface centered on `init`, `start`, `status`, `prompt`, and `list`
- five workflow modes with fixed stage order
- run folders stored under `.my-dev-kit-orchestrator/runs/`
- generated stage prompt files for each run
- plain-text artifacts and simple artifact-presence stage tracking
- manual coding-agent handoff through prompts and saved artifacts

## Implemented in v0.2.0

`v0.2.0` is the graph-guided architecture context release.

Implemented:

- updated architecture-context stage prompt with full graph-guided retrieval sequence
- explicit guidance for the 8-step context acquisition flow (index, search, lookup, slice, symbol source, line-range fallback, semantic artifacts, whole-file fallback)
- retrieval evidence report template included in the generated prompt
- explicit output paths for both stage outputs in the generated prompt:
  - `reports/architecture-context-retrieval-report.txt` (supporting retrieval evidence)
  - `artifacts/architecture-context-packet.txt` (required downstream artifact)
- synthesis instruction: retrieval output must be synthesized, not dumped
- fallback guidance for when `my-dev-kit` is unavailable
- supporting report visibility in `status` output
- `getSupportingReportStatuses` function for checking known supporting report presence
- stage progression remains based on required artifacts only; supporting reports are visible but not stage gates

## Planned in v0.2.1 — Extraction Mode

`v0.2.1` documents the planned `--mode extraction` workflow for transferring a bounded feature, workflow, subsystem, or behavior from an existing source repository into a new or separate target repository.

Planned documentation in v0.2.1:

- `--mode extraction` command shape and source/target repository roles
- extraction-specific stage order
- extraction artifact contracts: SourceWorkflowMap, SourceToTargetPortingMap, DoNotPortList, GoldenBehaviorContract, TargetArchitectureProposal
- source/target index separation
- golden behavior contract as mandatory pre-implementation gate
- guardrails against cloning the source repository architecture

The runtime implementation of `--mode extraction` will follow in a later version when:

- `start` accepts `--source` and `--target` flags
- extraction workflow stages are added to the workflow definition layer
- extraction-specific prompts are generated
- source and target run metadata paths are tracked
- status and progression behavior is updated for the two-repo model

See [docs/WORKFLOWS.md](WORKFLOWS.md) and [docs/ARTIFACTS.md](ARTIFACTS.md) for the planned extraction workflow and artifact contracts.

## Possible next steps after v0.2.1

These are future directions, not current features:

- runtime implementation of `--mode extraction` (source and target flag parsing, extraction-specific prompt generation, two-repo run metadata, status updates)
- artifact validation beyond simple file-existence tracking
- richer run status and correction routing based on judge outcomes
- deeper `my-dev-kit` integration for architecture-context retrieval
- optional report templates or report generation helpers
- better packaging controls for published artifacts
- optional structured artifact formats in addition to plain text
- design-map generation and trace links between behavior, pseudocode, code, and tests
- optional CI-friendly verification summaries
- optional LLM-provider integration

## Non-goals

`my-dev-kit-orchestrator` intentionally does not try to become:

- a general autonomous multi-agent runtime
- a security-validation framework
- a replacement for `my-dev-kit`
- a large low-level command suite
