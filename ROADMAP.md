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

## Possible next steps after v0.1.0

These are future directions, not current features:

- artifact validation beyond simple file-existence tracking
- richer run status and correction routing based on judge outcomes
- deeper `my-dev-kit` integration for architecture-context retrieval
- optional report templates or report generation helpers
- better packaging controls for published artifacts
- optional structured artifact formats in addition to plain text
- design-map generation and trace links between behavior, pseudocode, code, and tests
- optional CI-friendly verification summaries
- optional LLM-provider integration

## Not planned for the first release

`v0.1.0` intentionally does not try to become:

- a general autonomous multi-agent runtime
- a security-validation framework
- a replacement for `my-dev-kit`
- a large low-level command suite
