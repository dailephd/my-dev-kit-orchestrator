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

### v0.4.0 (implemented)

- artifact content checker with section requirement registry
- check codes: `MISSING_FILE`, `MISSING_SECTION`, `EMPTY_SECTION`, `PLACEHOLDER_CONTENT`, `STATUS_MISMATCH`
- prompt quality checker with check codes: `PROMPT_MISSING_FILE`, `PROMPT_EMPTY`, `PROMPT_MISSING_STAGE_HEADER`, `PROMPT_MISSING_TASK_SECTION`, `PROMPT_MISSING_OUTPUT_ARTIFACT`, `PROMPT_PLACEHOLDER`
- `check` command: `my-dev-kit-orchestrator check [--artifact <name>] [--prompts] [--strict]`
- `artifact-check-results.json` persists check results per run
- `status` command shows content check summary when results exist
- `--strict` exits 1 on any `warn` in addition to `fail`
- `CheckSeverity`: `pass | warn | fail`

### v0.5.0 (implemented)

- `src/traceModel.ts`: `TRACE_PREFIXES`, `TRACE_ID_RE`, `isValidTraceId`, `isMalformedTraceId`
- `src/traceParser.ts`: `parseTraceIds`, `parseTraceLinks`, `findMalformedTraceIds`, `findDuplicateIds`, `findOrphanIds`, `findMissingLinkTargets`, `parseTrace`
- `src/traceChecker.ts`: `parseDeclaredTraceIds` (skips link lines), `checkArtifactTrace`, `checkAllTraces`, `checkDesignMapTrace`, `trace-check-results.json` persistence
- `check --trace`: deterministic trace link checker across all run artifacts
- `check --design-map`: checks DesignMap artifact (required sections + trace links)
- `check --strict --trace` / `check --strict --design-map`: promote warns to failures in exit code
- trace check codes: `TRACE_MALFORMED_ID` (fail), `TRACE_DUPLICATE_ID` (warn), `TRACE_ORPHAN_ID` (warn), `TRACE_MISSING_LINK_TARGET` (fail)
- `status` shows trace check summary when `trace-check-results.json` exists
- `DesignMap` artifact kind in section registry with 18 required sections
- optional trace ID guidance added to `behavior-model`, `pseudocode-packet`, and `test-strategy` prompts
- `judge` prompt requests trace link review when trace IDs are present in prior artifacts
- CI `validate.yml` updated with CLI trace smoke step

### v0.6.0 (implemented)

- `src/judgeParser.ts`: judge verdict parser, `JUDGE_VERDICTS`, `parseJudgeReport`, `isValidVerdict`
- `src/correctionRouter.ts`: `routeJudgeVerdict`, `parseAndRoute`, `CORRECTABLE_STAGES`, `CorrectionRouteResult`
- `src/correctionState.ts`: `readCorrectionState`, `isCorrectionActive`
- deterministic routing table maps non-PASS verdicts to correction stages
- `SCOPE_VIOLATION` and `BLOCKED` produce blocked status - no correction stage routed
- unknown verdicts fail the parser instead of being guessed
- `status` command shows Judge correction section when judge report exists
- `prompt` command selects routed correction stage and generates bounded correction-stage prompt
- correction prompts include judge-report.txt, prior stage inputs, and design-map when present
- `check --trace` and `check --design-map` suggest correction stages from trace issues
- trace-aware correction is deterministic - no LLM inference
- correction routing is prompt-generation, not autonomous execution
- 118 new tests across judge-parser, correction-router, and v060-integration suites
- correction smoke in `scripts/cli-smoke.mjs`
- CI `validate.yml` updated with CLI correction smoke step

## Planned milestones

### v0.7.0

- richer comparison and reporting around workflow outcomes
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
