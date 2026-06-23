# Roadmap

## Implemented

### v0.1.0

- workflow shell release
- commands: `init`, `start`, `status`, `prompt`, `list`
- modes: `feature`, `repair`, `test`, `refactor`, `harden`
- local run folders under `.my-dev-kit-orchestrator/runs/`
- generated prompt files and plain-text artifact flow

### v0.2.0

- graph-guided architecture context release
- retrieval evidence report template in generated prompts
- ArchitectureContextPacket synthesis guidance
- supporting retrieval report visibility in `status`
- tagged in git as `v0.2.0`
- not published to npm

### v0.2.1

- extraction mode runtime implementation
- `--mode extraction`
- required `--source <path>` and `--target <path>` options for extraction runs
- source repository treated as read-only evidence by default
- target repository used as the implementation destination
- extraction-specific 14-stage workflow order
- extraction artifact gates:
  - `source-architecture-context-packet.txt`
  - `source-workflow-map.txt`
  - `source-to-target-porting-map.txt`
  - `do-not-port-list.txt`
  - `golden-behavior-contract.txt`
  - `target-architecture-proposal.txt`
- extraction-specific prompt generation and status support
- run artifacts placed under the target repository by default
- cross-platform validation with GitHub Actions OS matrix:
  - `ubuntu-latest`
  - `windows-latest`
  - `macos-latest`
- relative path normalization for `--source` and `--target`
- paths-with-spaces coverage
- macOS canonical path handling in cross-platform tests

### v0.3.0 (implemented)

- artifact lifecycle states: `missing`, `incomplete`, `blocked`, `complete`, `stale`
- `artifact-state.json` per run at `.my-dev-kit-orchestrator/runs/<run-id>/artifact-state.json`
- manual state setting via `mark` command (incomplete/blocked/complete only)
- stale detection via upstream artifact timestamp comparison
- lifecycle-aware `status` output with reason for blocked/incomplete/stale
- lifecycle-aware `prompt` progression respecting incomplete/blocked/stale
- lifecycle context block prepended to generated prompts when artifact is blocked/incomplete/stale
- backward compatibility: runs without `artifact-state.json` use file-existence behavior
- comprehensive lifecycle unit tests and integration tests

## Planned milestones

### v0.4.0

- artifact content validation against expected sections (optional, opt-in)
- prompt quality checks
- CI-friendly verification summaries

### v0.5.0

- design-map and trace-link exploration
- deeper `my-dev-kit` integration for retrieval-oriented stages while remaining prompt-driven

### v0.6.0

- judge routing and correction loops
- richer comparison and reporting around workflow outcomes

### v1.0.0

- stable workflow architecture and artifact contracts
- polished extraction-mode guidance and release documentation
- mature cross-platform release validation

## Non-goals

`my-dev-kit-orchestrator` is not intended to become:

- a general autonomous multi-agent runtime
- a security-validation framework
- a replacement for `my-dev-kit`
- a large low-level command suite
